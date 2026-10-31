from pathlib import Path
import json,subprocess
BASE='be5f3d353e0a877b69d55f93567195f6c60eabd7'
changed=set(subprocess.check_output(['git','diff','--name-only',BASE,'HEAD'],text=True).splitlines())
allowed=set(json.loads(Path('docs/INFERENCIA_INCREMENTAL_FILES.json').read_text()))
assert changed<=allowed,changed-allowed
assert subprocess.check_output(['git','-C','third_party/llama.cpp','rev-parse','HEAD'],text=True).strip()=='4d71b42fd87db24b8b7c808c151b713aa4459cfd'
for p in ['app/src/main/java/com/proxyslabs/haruna/HarunaIdentity.kt','app/src/main/java/com/proxyslabs/haruna/HarunaBehaviorProfile.kt','app/src/main/java/com/proxyslabs/haruna/diagnostics/LabSystemPrompt.kt','app/src/main/assets/haruna/recovery-runtime.js','app/src/main/assets/haruna/streaming/message-view.js']:
 assert Path(p).read_bytes()==subprocess.check_output(['git','show',BASE+':'+p]),p
prefix=Path('patches/llama-android/haruna_prefix_cache.h').read_text()
assert '!llama_model_is_hybrid(g_model)' in prefix and '!llama_model_is_recurrent(g_model)' in prefix
native=Path('patches/llama-android/haruna_incremental_native.h').read_text()
assert 'LLAMA_STATE_SEQ_FLAGS_NONE' in native and 'llama_memory_seq_rm' not in native
assert 'LLAMA_STATE_SEQ_FLAGS_PARTIAL_ONLY' not in native and 'seq_pos_max' in native
core=Path('app/src/main/assets/haruna/diagnostics/lab-core.js').read_text()
assert "schema:'haruna-lab-v1'" in core and 'Object.keys(baseline)' in core
print('PASS incremental scope: pinned runtime, exact persona/system experiment/streaming/recovery preservation, old hybrid KV-only guard retained; full-state path separate; no normal voice/RAG/storage/UI changes.')
