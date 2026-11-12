"""Check an actual Android STT shared object, not its expected CMake settings."""
import os, shutil, subprocess, sys
from pathlib import Path
sdk = os.environ.get('ANDROID_HOME')
ndk_readelf = Path(sdk)/'ndk/29.0.13113456/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-readelf' if sdk else None
readelf = str(ndk_readelf) if ndk_readelf and ndk_readelf.is_file() else shutil.which('readelf')
assert readelf, 'NDK llvm-readelf or host readelf is required'
files = [Path(p) for p in sys.argv[1:]] if len(sys.argv)>1 else list(Path('app/build/intermediates').glob('**/obj/arm64-v8a/libharuna_whisper_stt.so'))
assert files, 'Built STT JNI library not found'
expected = {'Java_com_proxyslabs_haruna_speech_WhisperCppNative_'+name for name in ['load','resetCancellation','transcribe','cancel','unload']}
for lib in files:
    symbols = subprocess.check_output([readelf,'--dyn-syms','--wide',str(lib)],text=True)
    exports = {line.split()[-1] for line in symbols.splitlines() if ' GLOBAL ' in line and ' UND ' not in line and ' DEFAULT ' in line}
    assert exports == expected, exports
    dynamic = subprocess.check_output([readelf,'-d',str(lib)],text=True)
    needed = [line for line in dynamic.splitlines() if '(NEEDED)' in line]
    assert not any(word in '\n'.join(needed) for word in ['libggml','libllama','libwhisper','sherpa']), needed
    print('PASS actual STT ELF: session JNI-only exports; no dynamic ggml/llama/sherpa dependency:',lib)
print('No model inference performed by this ABI-isolation check.')
