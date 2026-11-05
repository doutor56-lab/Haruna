# Independent CPU-only image engine; no llama/GGML dependency.
include(FetchContent)
set(MNN_BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(MNN_SEP_BUILD OFF CACHE BOOL "" FORCE)
# Static embedding: skip upstream Android shared-library/header-export post-build tasks.
set(MNN_BUILD_FOR_ANDROID_COMMAND ON CACHE BOOL "" FORCE)
set(MNN_BUILD_TOOLS OFF CACHE BOOL "" FORCE)
set(MNN_BUILD_CONVERTER OFF CACHE BOOL "" FORCE)
set(MNN_BUILD_DEMO OFF CACHE BOOL "" FORCE)
set(MNN_BUILD_TEST OFF CACHE BOOL "" FORCE)
set(MNN_BUILD_BENCHMARK OFF CACHE BOOL "" FORCE)
set(MNN_BUILD_TRAIN OFF CACHE BOOL "" FORCE)
set(MNN_BUILD_LLM OFF CACHE BOOL "" FORCE)
set(MNN_BUILD_DIFFUSION OFF CACHE BOOL "" FORCE)
# Required by the official diffusion build for quantized weights and fused attention ops.
set(MNN_LOW_MEMORY ON CACHE BOOL "" FORCE)
set(MNN_SUPPORT_TRANSFORMER_FUSE ON CACHE BOOL "" FORCE)
set(MNN_OPENCL OFF CACHE BOOL "" FORCE)
set(MNN_OPENGL OFF CACHE BOOL "" FORCE)
set(MNN_VULKAN OFF CACHE BOOL "" FORCE)
set(MNN_METAL OFF CACHE BOOL "" FORCE)
set(MNN_CUDA OFF CACHE BOOL "" FORCE)
# Upstream CPU FP16 implementation, selected only after runtime supportFp16arith detection.
set(MNN_ARM82 ON CACHE BOOL "" FORCE)
FetchContent_Declare(mnn_image
 URL https://codeload.github.com/alibaba/MNN/tar.gz/c95758f4cd4cc4891a89833842dbd681109d3303
 URL_HASH SHA256=f6f6117e0ed89ec7896d29407469dd33075145d8748af9a8f89d3aa62a4928a6
 DOWNLOAD_EXTRACT_TIMESTAMP TRUE)
set(MNN_BUILD_OPENCV ON CACHE BOOL "" FORCE)
set(MNN_IMGCODECS ON CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(mnn_image)
add_library(haruna_image SHARED image_jni.cpp)
target_compile_features(haruna_image PRIVATE cxx_std_17)
target_include_directories(haruna_image PRIVATE ${mnn_image_SOURCE_DIR}/include ${mnn_image_SOURCE_DIR}/schema/current ${mnn_image_SOURCE_DIR}/3rd_party/flatbuffers/include)
target_link_libraries(haruna_image PRIVATE MNN log)
target_link_options(haruna_image PRIVATE -Wl,--exclude-libs,ALL -Wl,-Bsymbolic -Wl,--version-script=${CMAKE_CURRENT_SOURCE_DIR}/exports.map -Wl,-z,max-page-size=16384)
set_target_properties(haruna_image PROPERTIES LINK_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/exports.map)

include(${CMAKE_CURRENT_SOURCE_DIR}/pipeline.cmake)
