plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android { namespace="com.proxyslabs.haruna"; compileSdk=36
 defaultConfig { applicationId="com.proxyslabs.haruna"; minSdk=33; targetSdk=36; versionCode=3; versionName="0.3"; ndk { abiFilters += listOf("arm64-v8a") } }
 compileOptions { sourceCompatibility=JavaVersion.VERSION_17; targetCompatibility=JavaVersion.VERSION_17 }
 kotlinOptions { jvmTarget="17" }
}
dependencies { implementation("androidx.core:core-ktx:1.15.0"); implementation("androidx.appcompat:appcompat:1.7.0"); implementation("androidx.activity:activity-ktx:1.10.0"); implementation(project(":llamaLib")) }
