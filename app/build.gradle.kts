import java.io.File
import java.net.URI
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.MessageDigest

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.jetbrains.kotlin.android)
}

val generatedVadAssets = layout.buildDirectory.dir("generated/vad-assets")

android {
    buildFeatures { buildConfig = true }
    namespace = "com.proxyslabs.haruna"
    compileSdk = 36
    ndkVersion = "29.0.13113456"

    defaultConfig {
        applicationId = "com.proxyslabs.haruna.incremental"
        minSdk = 33
        targetSdk = 36
        testInstrumentationRunner = "com.proxyslabs.haruna.diagnostic45.CanonicalRunner"
        versionCode = 9
        versionName = "0.8-documents-vision"
        val useVulkan = providers.gradleProperty("harunaVulkan").orElse("false").get().toBoolean()
        if(useVulkan) { applicationId = "com.proxyslabs.haruna.incremental.vulkan";versionName = "0.7-incremental-vulkan" }
        manifestPlaceholders["harunaLabel"] = if(useVulkan) "Haruna incremental GPU" else "Haruna incremental"
        externalNativeBuild { cmake { arguments += "-DCMAKE_BUILD_TYPE=Release" } }
        ndk { abiFilters += listOf("arm64-v8a") }
    }

    sourceSets.getByName("main").assets.srcDir(generatedVadAssets)
    externalNativeBuild { cmake { path = file("src/main/cpp/stt/CMakeLists.txt"); version = "3.31.6" } }

    packaging {
        jniLibs {
            useLegacyPackaging = true
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlin {
        jvmToolchain(17)
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.activity)
    implementation(libs.androidx.webkit)
    implementation(project(":llamaLib"))
}

fun sha256(file: File): String {
    val hash = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input ->
        val buffer = ByteArray(131072)
        while (true) {
            val n = input.read(buffer)
            if (n < 0) break
            hash.update(buffer, 0, n)
        }
    }
    return hash.digest().joinToString("") { "%02x".format(it) }
}

// Official Android AAR, pinned to a release and its published SHA-256.
val sherpaAar = layout.buildDirectory.file("speech-dependencies/sherpa-onnx-2.0.0.aar")
val fetchSherpaAar by tasks.registering {
    val expected = "f0f8716982d27cb4ce695e3934018b1342d9d3d6fdb6ef1f1658fe8bad50b4fc"
    inputs.property("sha256", expected)
    outputs.file(sherpaAar)
    doLast {
        val target = sherpaAar.get().asFile
        if (!target.isFile || sha256(target) != expected) {
            target.parentFile.mkdirs()
            val part = File(target.parentFile, target.name + ".part")
            try {
                val connection = URI("https://github.com/k2-fsa/sherpa-onnx/releases/download/v2.0.0/sherpa-onnx-2.0.0.aar").toURL().openConnection()
                connection.connectTimeout = 30000; connection.readTimeout = 60000
                connection.getInputStream().use { input -> part.outputStream().use { input.copyTo(it) } }
                check(sha256(part) == expected) { "Official sherpa-onnx AAR checksum mismatch" }
                Files.move(part.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING)
            } finally { part.delete() }
        }
    }
}

// Silero is a tiny runtime asset, not a user speech model. Fetch it only at build
// time from sherpa-onnx's official model release and fail closed on byte mismatch.
val fetchSileroVad by tasks.registering {
    val expected = "c36d490aff5ab924ca6c7aeec4d8f6bd3d22db6fa17611b9c5b17eae58ac3a20"
    val target = generatedVadAssets.map { it.file("silero_vad.int8.onnx") }
    inputs.property("sha256", expected)
    outputs.file(target)
    doLast {
        val output = target.get().asFile
        if (!output.isFile || sha256(output) != expected) {
            output.parentFile.mkdirs()
            val part = File(output.parentFile, output.name + ".part")
            try {
                val connection = URI("https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.int8.onnx").toURL().openConnection()
                connection.connectTimeout = 30000; connection.readTimeout = 60000
                connection.getInputStream().use { input -> part.outputStream().use { input.copyTo(it) } }
                check(sha256(part) == expected) { "Official Silero VAD INT8 checksum mismatch" }
                Files.move(part.toPath(), output.toPath(), StandardCopyOption.REPLACE_EXISTING)
            } finally { part.delete() }
        }
    }
}

tasks.named("preBuild").configure { dependsOn(fetchSileroVad) }

dependencies {
    implementation(files(sherpaAar).builtBy(fetchSherpaAar))
    implementation("org.apache.commons:commons-compress:1.27.1")
}

// Only explicit diagnostic builds use an isolated sandbox, never the user's installed Haruna data.
val diagnostic45Mode = providers.gradleProperty("harunaDiagnostic45").orElse("OFF").get()
require(diagnostic45Mode in listOf("OFF", "A_CURRENT", "B_CONSERVATIVE", "C_NO_KLEIDIAI", "D_NO_REPACK", "E_NO_ALL_VARIANTS", "F_ARMV8A_ONLY"))
if (diagnostic45Mode != "OFF") {
    android.buildTypes.getByName("debug").applicationIdSuffix = ".diagnostic45"
    android.sourceSets.getByName("debug").manifest.srcFile("src/diagnostic45/AndroidManifest.xml")
}


dependencies {
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}

// Independent configure/build: stable-diffusion.cpp must not reuse Whisper's ggml target.
val safetensorsJni = layout.buildDirectory.dir("generated/safetensors-jni")
android.sourceSets.getByName("main").jniLibs.srcDir(safetensorsJni)
val buildSafetensorsNative by tasks.registering {
    inputs.dir("src/main/cpp/safetensors")
    outputs.file(safetensorsJni.map { it.file("arm64-v8a/libharuna_sd_safetensors.so") })
    doLast {
        val sdk = android.sdkDirectory
        val cmake = File(sdk, "cmake/3.31.6/bin/" + if(System.getProperty("os.name").startsWith("Windows")) "cmake.exe" else "cmake")
        val nativeBuild = layout.buildDirectory.dir("safetensors-native").get().asFile
        val output = safetensorsJni.get().dir("arm64-v8a").asFile
        project.exec { commandLine(cmake.absolutePath, "-S", file("src/main/cpp/safetensors").absolutePath, "-B", nativeBuild.absolutePath,
            "-DCMAKE_TOOLCHAIN_FILE=" + File(sdk,"ndk/${android.ndkVersion}/build/cmake/android.toolchain.cmake").absolutePath,
            "-DANDROID_ABI=arm64-v8a", "-DANDROID_PLATFORM=android-33", "-DANDROID_STL=c++_static", "-DCMAKE_BUILD_TYPE=Release", "-DHARUNA_JNI_OUTPUT_DIR=" + output.absolutePath) }
        project.exec { commandLine(cmake.absolutePath, "--build", nativeBuild.absolutePath, "--target", "haruna_sd_safetensors", "--parallel", "2") }
    }
}
tasks.named("preBuild").configure { dependsOn(buildSafetensorsNative) }

// Stage 8: consolidated offline parsers/OCR, pinned artifacts; user vision weights stay outside APK.
val generatedDocumentAssets=layout.buildDirectory.dir("generated/document-assets")
android.sourceSets.getByName("main").assets.srcDir(generatedDocumentAssets)
val tesseractAar=layout.buildDirectory.file("document-dependencies/tesseract4android-4.9.0.aar")
val fetchDocumentRuntime by tasks.registering {
    val artifacts=listOf(
        Triple("https://jitpack.io/cz/adaptech/tesseract4android/tesseract4android/4.9.0/tesseract4android-4.9.0.aar",tesseractAar.get().asFile,"bce5d6413a1a5ae3d7240033fbbc851ba3217d0a08d9769400e17a077f42cb2a"),
        Triple("https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/87416418657359cb625c412a48b6e1d6d41c29bd/eng.traineddata",generatedDocumentAssets.get().file("tessdata/eng.traineddata").asFile,"7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2"),
        Triple("https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/87416418657359cb625c412a48b6e1d6d41c29bd/por.traineddata",generatedDocumentAssets.get().file("tessdata/por.traineddata").asFile,"c4932b937207a9514b7514d518b931a99938c02a28a5a5a553f8599ed58b7deb"))
    inputs.property("artifacts",artifacts.map{it.first+it.third})
    outputs.files(artifacts.map{it.second})
    doLast { for((url,target,hash) in artifacts){
        if(target.isFile&&sha256(target)==hash)continue
        target.parentFile.mkdirs();val part=File(target.parentFile,target.name+".part")
        try{val connection=URI(url).toURL().openConnection();connection.connectTimeout=30000;connection.readTimeout=60000
            connection.getInputStream().use{input->part.outputStream().use{input.copyTo(it)}}
            check(sha256(part)==hash){"Stage8 dependency checksum mismatch"}
            Files.move(part.toPath(),target.toPath(),StandardCopyOption.REPLACE_EXISTING)
        }finally{part.delete()}
    }}
}
tasks.named("preBuild").configure{dependsOn(fetchDocumentRuntime)}
dependencies {
    implementation(files(tesseractAar).builtBy(fetchDocumentRuntime))
    implementation("com.tom-roush:pdfbox-android:2.0.27.0")
    implementation("com.github.albfernandez:juniversalchardet:2.5.0")
    implementation("androidx.exifinterface:exifinterface:1.3.7")
}
