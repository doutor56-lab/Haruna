cmake_minimum_required(VERSION 3.22)
project(haruna_whisper_stt LANGUAGES C CXX)
include(FetchContent)
# Separate CMake invocation and static, hidden dependencies avoid colliding with llama.cpp's ggml.
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(CMAKE_C_VISIBILITY_PRESET hidden)
set(CMAKE_CXX_VISIBILITY_PRESET hidden)
set(CMAKE_VISIBILITY_INLINES_HIDDEN ON)
set(WHISPER_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_SERVER OFF CACHE BOOL "" FORCE)
set(WHISPER_CURL OFF CACHE BOOL "" FORCE)
set(GGML_NATIVE OFF CACHE BOOL "" FORCE)
set(GGML_BACKEND_DL OFF CACHE BOOL "" FORCE)
set(GGML_CPU_ALL_VARIANTS OFF CACHE BOOL "" FORCE)
set(GGML_CPU_ARM_ARCH armv8-a CACHE STRING "" FORCE)
set(GGML_CPU_KLEIDIAI OFF CACHE BOOL "" FORCE)
set(GGML_CPU_REPACK OFF CACHE BOOL "" FORCE)
set(GGML_OPENMP OFF CACHE BOOL "" FORCE)
set(GGML_VULKAN OFF CACHE BOOL "" FORCE)
set(GGML_CUDA OFF CACHE BOOL "" FORCE)
set(GGML_METAL OFF CACHE BOOL "" FORCE)
FetchContent_Declare(whisper_stt
    URL https://codeload.github.com/ggml-org/whisper.cpp/tar.gz/2eeeba56e9edd762b4b38467bab96c2517163158
    URL_HASH SHA256=089b898aa83b24a8321e0fd554eeb0967fb03dd687e27f6374c72d3363b5b429
    DOWNLOAD_EXTRACT_TIMESTAMP TRUE)
FetchContent_MakeAvailable(whisper_stt)
add_library(haruna_whisper_stt SHARED whisper_jni.cpp)
target_compile_features(haruna_whisper_stt PRIVATE cxx_std_17)
target_compile_options(haruna_whisper_stt PRIVATE -fexceptions)
target_link_libraries(haruna_whisper_stt PRIVATE whisper log)
target_link_options(haruna_whisper_stt PRIVATE
    -Wl,--exclude-libs,ALL -Wl,-Bsymbolic
    -Wl,--version-script=${CMAKE_CURRENT_SOURCE_DIR}/exports.map
    -Wl,-z,max-page-size=16384)
set_target_properties(haruna_whisper_stt PROPERTIES LINK_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/exports.map)


add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/../image ${CMAKE_CURRENT_BINARY_DIR}/haruna-image)
