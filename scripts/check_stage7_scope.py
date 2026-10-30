from pathlib import Path
import subprocess
base='3b105e14b85c52e8ccce40a33baad2d38b414001'
protected=['app/src/main/java/com/proxyslabs/haruna/speech','app/src/main/assets/haruna/voice','app/src/main/assets/haruna/voice-chat.js','app/src/main/assets/haruna/recovery-runtime.js','app/src/main/assets/haruna/retrieval','app/src/main/assets/haruna/essential','app/src/main/assets/haruna/learned','app/src/main/assets/haruna/theme.css','app/src/main/assets/haruna/index.html','app/src/main/java/com/proxyslabs/haruna/MainActivity.kt','app/src/androidTest','patches/diagnostic45','patches/diagnostic46']
assert not subprocess.check_output(['git','diff','--name-only',base,'HEAD','--',*protected],text=True).strip()
s=Path('app/src/main/java/com/proxyslabs/haruna/LlamaCppBackend.kt').read_text();assert 'if (BuildConfig.DEBUG)' in s
assert 'llama_model_is_hybrid' in Path('patches/llama-android/haruna_prefix_cache.h').read_text()
print('PASS Stage7 protected scope: normal chat behavior/identity/voice/RAG/storage/diagnostic fixtures unchanged; DEBUG lab gate and hybrid safety preserved.')
