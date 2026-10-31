from pathlib import Path
import subprocess
BASE='1d323b817a61457d208007aa1a17633d9ab1051b'
allowed=set(Path('docs/SYSTEM_PROMPT_FILES.txt').read_text().splitlines())
changed=set(subprocess.check_output(['git','diff','--name-only',BASE,'HEAD'],text=True).splitlines())
assert changed<=allowed,changed-allowed
backend='app/src/main/java/com/proxyslabs/haruna/LlamaCppBackend.kt'
s=Path(backend).read_text();a=s.index('                    val labVariant =');b=s.index('                    val roles =',a)
original=s[:a]+s[b:];original=original.replace('val originalSystem = HarunaIdentity.systemPrompt','val system = HarunaIdentity.systemPrompt')
assert original==subprocess.check_output(['git','show',BASE+':'+backend],text=True)
assert 'BuildConfig.DEBUG && requestId.startsWith("lab-")' in s
assert 'JSONObject(it).optString("systemPromptVariant", "current") == labVariant' in s
print('PASS scope: identity/personality/native/llama/Jinja/think/KV/lifecycle/timers/config unchanged; only gated system suffix in backend.')
