# Nezumi engine — Haruna distribution

Upstream: mouse0329/nezumi-ai, e23719bdf4d74e7ad3cbc5bca467e3f7136eb95b.
Original author/copyright and notices are retained. Distribution uses LGPL v3
(UPSTREAM-LICENSE.md, LGPL_LICENSE and GPL-3.0.txt), not the README's tentative MIT wording.
This directory contains the native mnn-sd-engine core; no Nezumi Android UI,
local-dream code or model weights are bundled.

Haruna modifications, 2026-11-05:
- cancellation flag uses std::atomic<bool>, rather than volatile across threads;
- initial generate boundary permits the owner to reassert queued cancellation;
- check MNN runSession return codes, cancel before executions and JIT creation;
- compile PROBE_LOG off with HARUNA_NEZUMI_QUIET (no token/path/tensor dumps).

The algorithm, CLIP BPE, embeddings, schedulers, CFG and JIT CLIP→UNet→VAE remain
upstream. CPU-only schedule: four threads, Precision_Low, Memory_Low. GPU engines
are neither built nor requested. The Haruna wrapper fixes txt2img to 512²,
DPM++ 2M, CFG 7.5; output may subsequently be scaled to the requested 256².
Five steps are supported but do not guarantee quality on non-distilled SD1.5.

MNN dependency: Haruna's existing c95758f4cd4cc4891a89833842dbd681109d3303,
Apache-2.0 (MNN-LICENSE in the offline app notices). Upstream Nezumi used MNN
5f44d96c6199c647dbc5b130861a6f5f5f6e370c. Haruna's MNN is unchanged; this
core compiles and is tested against it, not against an unpinned system library.

## LGPL replacement and corresponding source

libharuna_nezumi_image.so is the JNI adapter. It dynamically links the separate,
replaceable libharuna_nezumi_engine.so, whose exported ABI is mnn_sd_* in
include/mnn_sd. No signature or hash check restricts replacement of this library.
MNN is privately linked inside this core, with hidden symbols; no MNN symbols
are interposed on the legacy image or GGUF engine.

The matching Actions run provides Haruna-Nezumi-Source-and-Report including
HARUNA_NEZUMI_CORRESPONDING_SOURCE.tar.gz: this source, Haruna wrapper/build
files and the complete pinned MNN source, plus commit and APK SHA-256.
Redistributors must provide this corresponding source and licenses along with
this experimental APK; a link to a private repository alone is insufficient.

Rebuild with JDK17, Gradle8.14.3, Android SDK36/NDK29.0.13113456/CMake3.31.6.
See ../CMakeLists.txt and ../nezumi.cmake for exact CPU-only flags. Replace the
core sources, retaining the public C ABI, then run :app:assembleDebug on the
matching full Haruna commit. To rebuild only the core from the source archive,
add_subdirectory(MNN), set mnn_image_SOURCE_DIR to its absolute directory and
include ../nezumi.cmake from the image directory; use the NDK android.toolchain
with ANDROID_ABI=arm64-v8a and ANDROID_PLATFORM=android-33. Both core and adapter
are built there. Alternatively replace lib/arm64-v8a/libharuna_nezumi_engine.so
in the APK and re-sign with your own Android key (zipalign/apksigner). Android
requires reinstall for a different signing key; back up your local data first.
The ABI-compatible modified library may be used for debugging/reverse
engineering of modifications; this distribution adds no restriction on that.

Model weights have their own licenses, e.g. CreativeML OpenRAIL-M for the
referenced official Anything/CyberRealistic packages. They are not included.
NOTICE is retained from the full upstream project as attribution/reference;
its unrelated Android/LLM/voice components are not imported by this engine.
