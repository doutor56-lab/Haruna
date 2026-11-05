# Experimental, opt-in CPU-only safetensors backend.
# Not included by the production Android Gradle build yet.
cmake_minimum_required(VERSION 3.22)
project(haruna_sd_safetensors LANGUAGES C CXX)
include(FetchContent)
set(SD_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(SD_BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(SD_CUDA OFF CACHE BOOL "" FORCE)
set(SD_VULKAN OFF CACHE BOOL "" FORCE)
set(SD_METAL OFF CACHE BOOL "" FORCE)
set(SD_OPENCL OFF CACHE BOOL "" FORCE)
set(SD_WEBP OFF CACHE BOOL "" FORCE)
set(SD_WEBM OFF CACHE BOOL "" FORCE)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
FetchContent_Declare(sd_cpp
  GIT_REPOSITORY https://github.com/leejet/stable-diffusion.cpp.git
  GIT_TAG f5df5f8b84f139f1e80496902da90798a0d92896
  GIT_SHALLOW FALSE
  GIT_SUBMODULES_RECURSE TRUE
)
FetchContent_MakeAvailable(sd_cpp)
if(TARGET stable-diffusion)
  set(HARUNA_SD_TARGET stable-diffusion)
elseif(TARGET stable-diffusion-static)
  set(HARUNA_SD_TARGET stable-diffusion-static)
else()
  message(FATAL_ERROR "Review upstream stable-diffusion.cpp target name before enabling")
endif()
add_library(haruna_sd_safetensors SHARED safetensors_jni.cpp)
target_compile_features(haruna_sd_safetensors PRIVATE cxx_std_17)
target_include_directories(haruna_sd_safetensors PRIVATE ${sd_cpp_SOURCE_DIR}/include ${sd_cpp_SOURCE_DIR}/thirdparty)
target_link_libraries(haruna_sd_safetensors PRIVATE ${HARUNA_SD_TARGET} log)
target_link_options(haruna_sd_safetensors PRIVATE -Wl,-z,max-page-size=16384)
