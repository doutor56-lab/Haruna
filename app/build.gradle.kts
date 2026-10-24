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
