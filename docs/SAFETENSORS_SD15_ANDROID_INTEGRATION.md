# Optional SD 1.5 safetensors engine — integration gate

This is an **experimental** design record, not an announcement of working
safetensors inference.

## Engine source

- Upstream: https://github.com/leejet/stable-diffusion.cpp
- Reviewed upstream ref: `f5df5f8b84f139f1e80496902da90798a0d92896`
- Upstream public C API: `include/stable-diffusion.h`
- Preserve the upstream LICENSE and notices when vendoring or packaging.

Do not silently download or embed an unpinned native engine in a release build.

## Isolation

The existing Haruna MNN and Nezumi implementations are the production path.
`SafetensorsImageNative` is a **contract only**: its library
`haruna_sd_safetensors` is not compiled, packaged or called by the image
bridge. `available` returns false when the library is absent.

Do not present a safetensors file as installed or selectable until an actual
backend passes load, inference, cancel, unload and memory-pressure tests.

## Android ARM64 acceptance checklist

1. Pin and license-audit the upstream revision and native dependencies.
2. Cross-compile CPU-only for Android arm64-v8a using the project's NDK.
3. Implement JNI lifecycle matching `SafetensorsImageNative.kt` and check
   actual upstream API signatures before compiling.
4. Checkpoint must be SD 1.5 compatible, not merely a valid safetensors file.
   `SafetensorsArchitecture` is only a heuristic.
5. Use content-URI streaming to private storage with cancellation, bounded
   storage checks and atomic install. Do not load multi-GB files into Java heap.
6. Serialize native generation and release GGUF before allocating image engine.
7. Enforce minimum free RAM, storage and safe output dimensions.
8. Support cancellation, error propagation and native handle cleanup even on
   failed load/generation. Never delete user model files on generation failure.
9. Run unit tests and Android build, then test on the actual Teclast device.
10. Only after the above: expose the new format in the import and selection UI.

No APK should be labeled as supporting direct safetensors generation before
steps 1–8 are completed and verified.
