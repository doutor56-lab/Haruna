pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement { repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS); repositories { google(); mavenCentral() } }
rootProject.name = "HarunaAndroid"
include(":app")
include(":llamaLib")
project(":llamaLib").projectDir = file("third_party/llama.cpp/examples/llama.android/lib")
