"""Correction + reference explicitly authorized by user; no unrelated runtime edits."""
from pathlib import Path
import subprocess
base = '04a9f7edced6a6d94f921c7eed221f631699e86a'
allowed = set(Path('docs/STAGE6_CORRECTION_FILES.txt').read_text().splitlines())
changed = set(subprocess.check_output(['git','diff','--name-only',base,'HEAD'],text=True).splitlines())
assert not changed - allowed, 'Outside authorized scope: '+str(changed - allowed)
assert changed, 'No correction source changes'
root = Path('app/src/main/assets/haruna')
assert '<h1>Haruna</h1>' in (root/'index.html').read_text()
assert 'Haruna —' not in (root/'app.js').read_text()
assert not Path('app/src/main/java/com/proxyslabs/haruna/models/ModelSession.kt').exists()
assert 'overflow-x' not in (root/'voice/call-reference.css').read_text()
assert 'whisper_init_from_file_with_params' in Path('app/src/main/cpp/stt/whisper_jni.cpp').read_text()
assert 'whisper_full(ctx.get()' in Path('app/src/main/cpp/stt/whisper_jni.cpp').read_text()
assert 'SHA256=089b898' in Path('app/src/main/cpp/stt/CMakeLists.txt').read_text()
assert 'START_NOT_STICKY' in Path('app/src/main/java/com/proxyslabs/haruna/speech/VoiceCallService.kt').read_text()
assert 'FOREGROUND_SERVICE_MICROPHONE' in Path('app/src/main/AndroidManifest.xml').read_text()
print('PASS correction scope: LLM source/parameters/streaming, RAG, memory, persistence, templates and diagnostic45/46 untouched; STT, explicit call/reference hooks only.')
