"""Stage 6 scope is measured against the explicit pre-stage-5 checkpoint."""
from pathlib import Path
import subprocess

base='3d7c343bce61c381761078e8aac2d73c6cb08e27'
protected=[
 'patches','third_party','scripts/diagnostic45*','scripts/diagnostic46*','scripts/patch_android*',
 'app/src/androidTest','app/src/diagnostic45','app/src/main/java/com/proxyslabs/haruna/LlamaCppBackend.kt',
 'app/src/main/java/com/proxyslabs/haruna/LlmBackend.kt','app/src/main/java/com/proxyslabs/haruna/LocalLibrary.kt',
 'app/src/main/java/com/proxyslabs/haruna/HarunaRuntime.kt','app/src/main/java/com/proxyslabs/haruna/HarunaAndroidBridge.kt',
 'app/src/main/java/com/proxyslabs/haruna/StreamDelivery.kt',
 'app/src/main/assets/haruna/recovery-runtime.js','app/src/main/assets/haruna/model-library.js',
 'app/src/main/assets/haruna/llm-engine.js','app/src/main/assets/haruna/streaming',
 'app/src/main/assets/haruna/essential','app/src/main/assets/haruna/retrieval',
 'app/src/main/assets/haruna/learned','app/src/main/assets/haruna/identity','app/src/main/assets/haruna/diagnostics',
 'app/src/main/assets/haruna/premium.css','app/src/main/assets/haruna/theme.css','app/src/main/assets/haruna/style.css'
]
changed=subprocess.check_output(['git','diff','--name-only',base,'HEAD','--',*protected],text=True)
assert not changed.strip(), 'Unrequested protected changes: '+changed
assert not Path('app/src/main/java/com/proxyslabs/haruna/models/ModelSession.kt').exists()
root=Path('app/src/main/assets/haruna')
assert '<h1>Haruna</h1>' in (root/'index.html').read_text()
assert 'overflow-x' not in (root/'voice/stage6.css').read_text()
app=(root/'app.js').read_text()
assert 'voiceObserver?.push' in app and 'view.push(delta)' in app
assert "modelName.hidden=true" in app and 'Haruna —' not in app
stt=Path('app/src/main/java/com/proxyslabs/haruna/speech/SttModelManager.kt').read_text()
assert '!entry.isSymbolicLink' in stt and 'it == ".."' in stt
assert '1300L * 1024 * 1024' in stt and 'stage.renameTo(target)' in stt
print('PASS Stage6 scope: pre-stage5 LLM/native/storage/chat systems/themes/diagnostic45/46 preserved; no stage5 state-machine or styles imported.')

activity='app/src/main/java/com/proxyslabs/haruna/MainActivity.kt'
original=subprocess.check_output(['git','show',base+':'+activity],text=True)
expected=original.replace('if (::speech.isInitialized) { speech.stop(); speech.cancelInstallation() }','if (::speech.isInitialized) { speech.suspendForBackground(); speech.cancelInstallation() }')
assert Path(activity).read_text()==expected, 'Only the requested voice-background lifecycle hook may change MainActivity'
gradle='app/build.gradle.kts'
original=subprocess.check_output(['git','show',base+':'+gradle],text=True)
assert Path(gradle).read_text()==original.replace('versionCode = 4','versionCode = 6').replace('versionName = "0.4"','versionName = "0.6"'), 'Only app version may change Gradle'
