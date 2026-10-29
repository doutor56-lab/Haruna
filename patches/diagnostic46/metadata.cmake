if(HARUNA45_VALUE GREATER 0)
    string(LENGTH "${HARUNA46_SOURCE_COMMIT}" source_length)
    if(NOT source_length EQUAL 40 OR NOT HARUNA46_SOURCE_COMMIT MATCHES "^[0-9a-f]+$")
        message(FATAL_ERROR "Diagnostic builds require HARUNA_SOURCE_REVISION=exact source commit")
    endif()
endif()
# Called after add_subdirectory, so cache options and actual target properties exist.
function(h46_json_escape input output)
    set(value "${input}")
    string(REPLACE "\\" "\\\\" value "${value}")
    string(REPLACE "\"" "\\\"" value "${value}")
    string(REPLACE "\n" "\\n" value "${value}")
    string(REPLACE "\r" "\\r" value "${value}")
    set(${output} "${value}" PARENT_SCOPE)
endfunction()
set(h46_json "{")
foreach(pair IN ITEMS
    "variant|HARUNA_DIAGNOSTIC_45" "harunaCommit|HARUNA46_SOURCE_COMMIT"
    "abi|ANDROID_ABI" "androidPlatform|ANDROID_PLATFORM"
    "compilerId|CMAKE_CXX_COMPILER_ID" "compilerVersion|CMAKE_CXX_COMPILER_VERSION"
    "compiler|CMAKE_CXX_COMPILER" "buildType|CMAKE_BUILD_TYPE"
    "cFlags|CMAKE_C_FLAGS" "cxxFlags|CMAKE_CXX_FLAGS"
    "cFlagsRelease|CMAKE_C_FLAGS_RELEASE" "cxxFlagsRelease|CMAKE_CXX_FLAGS_RELEASE"
    "GGML_CPU_KLEIDIAI|GGML_CPU_KLEIDIAI" "GGML_CPU_REPACK|GGML_CPU_REPACK"
    "GGML_CPU_ALL_VARIANTS|GGML_CPU_ALL_VARIANTS" "GGML_CPU_ARM_ARCH|GGML_CPU_ARM_ARCH"
    "GGML_NATIVE|GGML_NATIVE" "GGML_BACKEND_DL|GGML_BACKEND_DL"
    "GGML_OPENMP|GGML_OPENMP" "GGML_LLAMAFILE|GGML_LLAMAFILE"
    "instrumentationMacro|HARUNA45_VALUE")
    string(REPLACE "|" ";" fields "${pair}")
    list(GET fields 0 key)
    list(GET fields 1 var)
    h46_json_escape("${${var}}" value)
    string(APPEND h46_json "\"${key}\":\"${value}\",")
endforeach()
string(APPEND h46_json "\"llamaCommit\":\"7894e8b92481a8bb8ffe94f73b656ffe0dd01e10\"}")
file(WRITE "${CMAKE_CURRENT_BINARY_DIR}/haruna46_effective.json" "${h46_json}\n")
file(WRITE "${CMAKE_CURRENT_BINARY_DIR}/haruna46_build.h"
    "#pragma once\n#define HARUNA46_BUILD_JSON R\"h46(${h46_json})h46\"\n")
