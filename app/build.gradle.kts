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
        versionCode = 8
        versionName = "0.7-incremental"
        val useVulkan = providers.gradleProperty("harunaVulkan").orElse("false").get().toBoolean()
        if(useVulkan) { applicationId = "com.proxyslabs.haruna.incremental.vulkan";versionName = "0.7-incremental-vulkan" }
        manifestPlaceholders["harunaLabel"] = if(useVulkan) "Haruna incremental GPU" else "Haruna incremental"
        externalNativeBuild { cmake { arguments += "-DCMAKE_BUILD_TYPE=Release" } }
        ndk { abiFilters += listOf("arm64-v8a") }
    }

    sourceSets.getByName("main").assets.srcDir(generatedVadAssets)
    externalNativeBuild { cmake { path = file("src/main/cpp/stt/CMakeLists.txt"); version = "3.31.6" } }

    // llama.android discovers the GGML CPU variants by scanning
    // applicationInfo.nativeLibraryDir at runtime. Force JNI libraries to be
    // extracted on install so ggml_backend_load_all_from_path() can see them
    // as real files instead of leaving them only inside the APK.
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
    val expected = "a35ebf52fd3ce5f1469b2a36158dba761bc47b973ea3382b3186ca15b1f5af28"
    val target = generatedVadAssets.map { it.file("silero_vad.onnx") }
    inputs.property("sha256", expected)
    outputs.file(target)
    doLast {
        val output = target.get().asFile
        if (!output.isFile || sha256(output) != expected) {
            output.parentFile.mkdirs()
            val part = File(output.parentFile, output.name + ".part")
            try {
                val connection = URI("https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx").toURL().openConnection()
                connection.connectTimeout = 30000; connection.readTimeout = 60000
                connection.getInputStream().use { input -> part.outputStream().use { input.copyTo(it) } }
                check(sha256(part) == expected) { "Official Silero VAD checksum mismatch" }
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
