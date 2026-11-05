# stable-diffusion.cpp image backend

CPU-only Android ARM64. stable-diffusion.cpp MIT, revision
f5df5f8b84f139f1e80496902da90798a0d92896. Its private patched GGML (MIT):
135ce1e0e3f2b0693d3de93d4f6b5fa0a1947820. No code or GGML from the LLM/STT
is replaced. Dependencies and license notices in this directory. Pinned source
archives and hashes are in app/src/main/cpp/safetensors/CMakeLists.txt.

Models are user-provided, not bundled; their own licenses apply. No model
weights, prompts, generation JSON or user paths are embedded by the PNG writer.
This experimental integration has host tests; target Android validation must
be performed on the device. See docs/SAFETENSORS_SD15_ANDROID_INTEGRATION.md.
