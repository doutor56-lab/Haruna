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
        targetSdk = 35
        versionCode = 3
        versionName = "0.3.0"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlin { jvmToolchain(17) }
}

dependencies {
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.12.2")
    implementation(project(":llamaLib"))
}
