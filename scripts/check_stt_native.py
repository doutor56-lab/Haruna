"""Check the actual Android STT shared object, not its expected CMake settings."""
import os, subprocess
from pathlib import Path
sdk = Path(os.environ['ANDROID_HOME'])
readelf = sdk/'ndk/29.0.13113456/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-readelf'
files = list(Path('app/build/intermediates').glob('**/obj/arm64-v8a/libharuna_whisper_stt.so'))
assert files, 'Built STT JNI library not found'
for lib in files:
    symbols = subprocess.check_output([str(readelf),'--dyn-syms','--wide',str(lib)],text=True)
    exports = [line.split()[-1] for line in symbols.splitlines() if ' GLOBAL ' in line and ' UND ' not in line and ' DEFAULT ' in line]
    assert exports == ['Java_com_proxyslabs_haruna_speech_WhisperCppNative_transcribe'], exports
    dynamic = subprocess.check_output([str(readelf),'-d',str(lib)],text=True)
    needed = [line for line in dynamic.splitlines() if '(NEEDED)' in line]
    assert not any(word in '\n'.join(needed) for word in ['libggml','libllama','libwhisper','sherpa']), needed
    print('PASS actual STT ELF: JNI-only exports; no dynamic ggml/llama/sherpa dependency:',lib)
print('No model inference performed by this ABI-isolation check.')
