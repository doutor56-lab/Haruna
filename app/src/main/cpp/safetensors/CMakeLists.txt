# Separate invocation: Whisper and llama.cpp keep their own GGML versions.
cmake_minimum_required(VERSION 3.22)
project(haruna_sd_safetensors LANGUAGES C CXX)
include(FetchContent)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(CMAKE_C_VISIBILITY_PRESET hidden)
set(CMAKE_CXX_VISIBILITY_PRESET hidden)
set(CMAKE_VISIBILITY_INLINES_HIDDEN ON)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(SD_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(SD_BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(SD_BUILD_SHARED_GGML_LIB OFF CACHE BOOL "" FORCE)
foreach(backend CUDA HIPBLAS VULKAN METAL OPENCL SYCL MUSA WEBP WEBM)
  set(SD_${backend} OFF CACHE BOOL "" FORCE)
endforeach()
foreach(option NATIVE BACKEND_DL CPU_ALL_VARIANTS CPU_KLEIDIAI OPENMP CUDA HIP VULKAN METAL OPENCL SYCL RPC)
  set(GGML_${option} OFF CACHE BOOL "" FORCE)
endforeach()
set(GGML_CPU_ARM_ARCH armv8-a CACHE STRING "" FORCE)
FetchContent_Declare(sd_ggml
 URL https://codeload.github.com/leejet/ggml/tar.gz/135ce1e0e3f2b0693d3de93d4f6b5fa0a1947820
 URL_HASH SHA256=8eb563d3e5b1a5eef6f174ac29e85ba46b27ea25558185c7a8bc1261d92166ac
 SOURCE_SUBDIR haruna-populate-only
 DOWNLOAD_EXTRACT_TIMESTAMP TRUE)
# Populate only: stable-diffusion.cpp owns this dependency's CMake targets.
FetchContent_MakeAvailable(sd_ggml)
# SD configures GGML itself, including its required GGML_MAX_NAME=160 ABI.
set(SD_GGML_SOURCE_DIR ${sd_ggml_SOURCE_DIR} CACHE PATH "" FORCE)
FetchContent_Declare(sd_cpp
 URL https://codeload.github.com/leejet/stable-diffusion.cpp/tar.gz/f5df5f8b84f139f1e80496902da90798a0d92896
 URL_HASH SHA256=5b70114c5788a901714affb353a32ed41d09edc7465ef3903f7f111ae590cbd4
 DOWNLOAD_EXTRACT_TIMESTAMP TRUE)
# Archives have no .git; do not report the enclosing Haruna checkout as the SDK revision.
set(GIT_EXE "")
set(SDCPP_BUILD_COMMIT f5df5f8b84f139f1e80496902da90798a0d92896)
set(SDCPP_BUILD_VERSION Haruna-pinned-f5df5f8)
FetchContent_MakeAvailable(sd_cpp)
if(NOT TARGET stable-diffusion)
  message(FATAL_ERROR "Pinned stable-diffusion.cpp target missing")
endif()
add_library(haruna_sd_safetensors SHARED safetensors_jni.cpp)
target_compile_features(haruna_sd_safetensors PRIVATE cxx_std_17)
target_include_directories(haruna_sd_safetensors PRIVATE ${sd_cpp_SOURCE_DIR}/include ${sd_cpp_SOURCE_DIR}/thirdparty)
target_link_libraries(haruna_sd_safetensors PRIVATE stable-diffusion)
if(ANDROID)
  target_link_libraries(haruna_sd_safetensors PRIVATE log)
else()
  target_include_directories(haruna_sd_safetensors PRIVATE ${HARUNA_JNI_INCLUDE})
endif()
target_link_options(haruna_sd_safetensors PRIVATE -Wl,--exclude-libs,ALL -Wl,-Bsymbolic -Wl,--version-script=${CMAKE_CURRENT_SOURCE_DIR}/exports.map -Wl,-z,max-page-size=16384)
set_target_properties(haruna_sd_safetensors PROPERTIES LINK_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/exports.map)
if(HARUNA_JNI_OUTPUT_DIR)
  set_target_properties(haruna_sd_safetensors PROPERTIES LIBRARY_OUTPUT_DIRECTORY ${HARUNA_JNI_OUTPUT_DIR})
endif()
