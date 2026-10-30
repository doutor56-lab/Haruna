"""Integration guards complement fake-backend tests; no GGUF or Android inference."""
from pathlib import Path
import subprocess

base = '3d7c343bce61c381761078e8aac2d73c6cb08e27'
immutable = [
    'patches', 'scripts/diagnostic45*', 'scripts/diagnostic46*',
    'scripts/patch_android*', 'scripts/check_diag*',
    'app/src/androidTest', 'app/src/diagnostic45',
    'app/src/main/assets/haruna/recovery-runtime.js',
    'app/src/main/java/com/proxyslabs/haruna/speech',
    'app/src/main/assets/haruna/streaming',
    'app/src/main/assets/haruna/retrieval',
    'app/src/main/assets/haruna/learned',
    'app/src/main/assets/haruna/essential',
    'app/src/main/java/com/proxyslabs/haruna/StreamDelivery.kt',
]
changed = subprocess.check_output(['git', 'diff', '--name-only', base, 'HEAD', '--', *immutable], text=True)
assert not changed.strip(), 'Protected subsystems changed: ' + changed
backend = Path('app/src/main/java/com/proxyslabs/haruna/LlamaCppBackend.kt').read_text()
load = backend[backend.index('private fun changeModel'):backend.index('private fun clearNativeModel')]
assert load.index('clearNativeModel()') < load.index('loadAndPrime(file)')
assert 'modelSession.admitGeneration' in backend
assert 'request.serial' in backend and 'jobs[requestId] === request' in backend
assert 'engine.cleanUp()' in backend and 'State.Initialized' in backend
assert 'fun configureDiagnostic(' in backend
prefs = Path('app/src/main/java/com/proxyslabs/haruna/models/ModelPreferences.kt').read_text()
assert 'editor.commit()' in prefs and 'putString("model_session_v1"' in prefs
ui = Path('app/src/main/assets/haruna/model-library.js').read_text()
assert 'localStorage' not in ui and 'resetConversation' not in ui
print('PASS: diagnostic45/46/native patches/voice/RAG/streaming/recovery preserved; native release order, durable journal, generation gate and chat ownership integration guards.')
