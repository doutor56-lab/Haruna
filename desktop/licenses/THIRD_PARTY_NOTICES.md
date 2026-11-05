# Haruna Windows — native dependencies

- stable-diffusion.cpp: MIT, leejet, pin f5df5f8b84f139f1e80496902da90798a0d92896.
- llama.cpp: MIT, ggml-org, b12130 / 7e42b95f231e508a001b6006fa73abbbbc1da3c2.
- GGML: MIT, license texts from both immutable native release archives retained.
- libwebp/libsharpyuv: BSD, WebM project (COPYING bundled).
- libwebm: BSD, WebM project (LICENSE bundled).
- Electron: MIT / Chromium third-party licenses included by electron-builder.
- Microsoft Visual C++ runtime: Microsoft Software License Terms. App-local
  redistributable DLLs copied only from the licensed Windows build SDK's
  VC/Redist/MSVC/x64/Microsoft.VC*.CRT directory, never from System32. Native
  release binaries require these DLLs. Versions and hashes accompany runtime
  metadata. https://learn.microsoft.com/en-us/cpp/windows/redistributing-visual-cpp-files
  https://learn.microsoft.com/en-us/cpp/windows/choosing-a-deployment-method

Build-time dependencies are listed in package-lock.json; no cloud AI service is
required. Models are not bundled or re-uploaded. Model owners' licenses apply.
RIN AnimePopCute's creator asks not to re-upload the weights: import a legitimately
obtained complete SDXL safetensors checkpoint from its original source.
