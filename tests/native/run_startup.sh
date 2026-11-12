#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
# Requires Linux, JDK headers, CMake >=3.28, a C++17 compiler and numpy/gguf-py dependencies.
build_dir="${HARUNA_NATIVE_TEST_DIR:-/tmp/haruna-startup-regression}"
cmake_bin="${CMAKE_COMMAND:-cmake}"
java_dir="${JAVA_HOME:-$(dirname "$(dirname "$(readlink -f "$(command -v javac)")")")}"
mkdir -p "$build_dir/shim"
printf '#define HARUNA46_BUILD_JSON "{}"\n' > "$build_dir/shim/haruna46_build.h"
python3 scripts/patch_android_loader.py
python3 tests/native/make_smollm3_fixture.py "$build_dir/smol-random.gguf"
"$cmake_bin" -S third_party/llama.cpp -B "$build_dir/build" -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=ON -DLLAMA_BUILD_COMMON=ON -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_TOOLS=OFF -DLLAMA_BUILD_EXAMPLES=OFF -DLLAMA_BUILD_MTMD=OFF -DLLAMA_OPENSSL=OFF -DGGML_OPENMP=OFF -DGGML_NATIVE=OFF -DGGML_BACKEND_DL=OFF
"$cmake_bin" --build "$build_dir/build" --target llama-common --parallel 4
"${CXX:-g++}" -std=c++17 -O1 -Itests/native -I"$build_dir/shim" -I"$java_dir/include" -I"$java_dir/include/linux" -Ithird_party/llama.cpp/include -Ithird_party/llama.cpp/common -Ithird_party/llama.cpp/src -Ithird_party/llama.cpp/ggml/include -Ithird_party/llama.cpp/ggml/src -Ithird_party/llama.cpp/vendor -Ithird_party/llama.cpp tests/native/check_startup.cpp -L"$build_dir/build/bin" -Wl,-rpath,"$build_dir/build/bin" -lllama-common -lllama -lggml -lggml-cpu -lggml-base -ldl -pthread -o "$build_dir/check_startup"
LD_LIBRARY_PATH="$build_dir/build/bin${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" "$build_dir/check_startup" "$build_dir/smol-random.gguf"
