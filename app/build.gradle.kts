import java.io.File
import java.net.URI
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.MessageDigest

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.jetbrains.kotlin.android)
}

android {
    namespace = "com.proxyslabs.haruna"
    compileSdk = 36
    ndkVersion = "29.0.13113456"

    defaultConfig {
        applicationId = "com.proxyslabs.haruna"
        minSdk = 33
        targetSdk = 36
        testInstrumentationRunner = "com.proxyslabs.haruna.diagnostic45.CanonicalRunner"
        versionCode = 4
        versionName = "0.4"
        ndk { abiFilters += listOf("arm64-v8a") }
    }

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

// Official Android AAR, pinned to a release and its published SHA-256.
// The model itself is installed by the user, never bundled or fetched at runtime by this task.
val sherpaAar = layout.buildDirectory.file("speech-dependencies/sherpa-onnx-2.0.0.aar")
val fetchSherpaAar by tasks.registering {
    val expected = "f0f8716982d27cb4ce695e3934018b1342d9d3d6fdb6ef1f1658fe8bad50b4fc"
    inputs.property("sha256", expected)
    outputs.file(sherpaAar)
    doLast {
        fun digest(file: File): String {
            val hash = MessageDigest.getInstance("SHA-256")
            file.inputStream().use { input -> val buffer = ByteArray(131072); while (true) { val n = input.read(buffer); if (n < 0) break; hash.update(buffer, 0, n) } }
            return hash.digest().joinToString("") { "%02x".format(it) }
        }
        val target = sherpaAar.get().asFile
        if (!target.isFile || digest(target) != expected) {
            target.parentFile.mkdirs()
            val part = File(target.parentFile, target.name + ".part")
            try {
                val connection = URI("https://github.com/k2-fsa/sherpa-onnx/releases/download/v2.0.0/sherpa-onnx-2.0.0.aar").toURL().openConnection()
                connection.connectTimeout = 30000; connection.readTimeout = 60000
                connection.getInputStream().use { input -> part.outputStream().use { input.copyTo(it) } }
                check(digest(part) == expected) { "Official sherpa-onnx AAR checksum mismatch" }
                Files.move(part.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING)
            } finally { part.delete() }
        }
    }
}
dependencies {
    implementation(files(sherpaAar).builtBy(fetchSherpaAar))
    implementation("org.apache.commons:commons-compress:1.27.1")
}


// Only explicit diagnostic builds use an isolated sandbox, never the user's installed Haruna data.
val diagnostic45Mode = providers.gradleProperty("harunaDiagnostic45").orElse("OFF").get()
require(diagnostic45Mode in listOf("OFF", "A_CURRENT", "B_CONSERVATIVE"))
if (diagnostic45Mode != "OFF") {
    android.buildTypes.getByName("debug").applicationIdSuffix = ".diagnostic45"
    android.sourceSets.getByName("debug").manifest.srcFile("src/diagnostic45/AndroidManifest.xml")
}
