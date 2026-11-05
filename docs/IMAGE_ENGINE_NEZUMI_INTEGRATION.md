# Nezumi MNN SD1.5 integration — implementation contract

Status: **not implemented / no verified generation**. Experimental branch only. Do not merge or advertise image generation as working until an Android device has produced a PNG.

## Verified source interfaces
- Upstream: https://github.com/mouse0329/nezumi-ai/tree/main/mnn-sd-engine
- Public API: `include/mnn_sd/engine.h`: `mnn_sd_create`, `mnn_sd_load`, `mnn_sd_generate`, `mnn_sd_cancel`, `mnn_sd_unload`, `mnn_sd_destroy`, `mnn_sd_free_image`.
- Model config: `src/model_config.cpp` accepts `clip_v2.mnn` / `clip_fp16.mnn` / `clip.mnn`, `unet_asym_block32.mnn` / `unet.mnn`, `vae_decoder_fp16.mnn` / `vae_decoder.mnn`, and `tokenizer.json`.
- Android upstream JNI is bound to `com.nezumi_ai.sd.MnnSdNative`, **not** Haruna's JNI names. A Haruna-specific adapter is required.
- Upstream `LICENSE.md`: LGPL v3 or separately obtained alternative license. Review obligations and notices before copying or linking code.

## Current Haruna constraints
- `ImagePackage.install` accepts only the Haruna manifest and `tokenizer.mtok`.
- `ImageNative` and `image_jni.cpp` use the MNN upstream diffusion pipeline, with hard-coded `text_encoder.mnn`, `unet.mnn`, `vae_decoder.mnn`.
- `ImageBridge.prepare` currently unloads GGUF and checks memory; preserve its exclusive resource lease and cleanup semantics.
- `ImageArchiveFormat` recognizes Nezumi-style ZIPs, but deliberately rejects installation before allocating model storage.
- CPU only for initial Android integration; do not silently enable Vulkan or OpenCL.
- Existing Haruna package loading, LLM, chat, voice, and stable branch must remain unchanged.

## Required implementation sequence
1. Pin an exact upstream Nezumi commit and MNN ABI/version; check license compliance and compile dependencies.
2. Add a separately named native Nezumi engine library with a Haruna JNI adapter. Avoid exporting duplicate MNN symbols or bundling incompatible libMNN copies.
3. Add a separately validated Nezumi ZIP installation path with streaming extraction, path traversal and symlink checks, size limits, atomic commit, and model.json/tokenizer.json support.
4. Dispatch image load/generation by persisted model format, without renaming Nezumi graphs to Haruna filenames. Release native resources and GGUF lease on every error/cancel path.
5. Convert the engine's returned RGB buffer to a valid PNG and free native image memory exactly once.
6. Build Android arm64-v8a APK, run import/load/generate/cancel on real target device, inspect peak RSS and low-memory behavior. Verify actual generated PNG and chat/LLM regression before enabling UI.

## Explicit non-goals
- A successful ZIP classification is **not** a successful model load.
- A successful APK compilation is **not** proof that image generation works.
- No model download, ZIP repackaging, GPU backend, or replacement of the existing working GGUF pipeline.
