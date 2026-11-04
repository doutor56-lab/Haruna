plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.android.library) apply false
    alias(libs.plugins.jetbrains.kotlin.android) apply false
}

// The GPU APK uses a separate application ID, but the llama.cpp Android
// library must also compile its Vulkan backend. Keep CPU builds unchanged.
val harunaVulkanEnabled = providers.gradleProperty("harunaVulkan")
    .orElse("false").get().toBoolean()

if (harunaVulkanEnabled) {
    project(":llamaLib") {
        plugins.withId("com.android.library") {
            extensions.configure<com.android.build.gradle.LibraryExtension>("android") {
                defaultConfig {
                    externalNativeBuild {
                        cmake {
                            arguments += "-DGGML_VULKAN=ON"
                        }
                    }
                }
            }
        }
    }
}
