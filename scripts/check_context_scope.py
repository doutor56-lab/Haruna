from pathlib import Path
import subprocess
BASE='a72f9c7b84d2cb3e90e3d47bd37905a8081598af'
allowed=set(Path('docs/CONTEXT_LAB_FILES.txt').read_text().splitlines())
changed=set(subprocess.check_output(['git','diff','--name-only',BASE,'HEAD'],text=True).splitlines())
assert changed<=allowed,changed-allowed
for f in ['app/src/main/java/com/proxyslabs/haruna/LlamaCppBackend.kt','app/src/main/java/com/proxyslabs/haruna/diagnostics/LabSystemPrompt.kt','patches/llama-android/haruna_prefix_cache.h','patches/llama-android/haruna_prefix_ledger.h']:
 if not Path(f).exists():continue
 assert Path(f).read_text()==subprocess.check_output(['git','show',BASE+':'+f],text=True),f
f='patches/llama-android/haruna_chat.h';s=Path(f).read_text();s=s.replace('        if(hc_config.experimental&&hc_config.fa>=0&&haruna_observed_flash(g_context)!=hc_config.fa)throw std::runtime_error("Effective FA not confirmed");\n','')
assert s==subprocess.check_output(['git','show',BASE+':'+f],text=True)
f='app/src/main/assets/haruna/diagnostics/lab-core.js';s=Path(f).read_text();old=subprocess.check_output(['git','show',BASE+':'+f],text=True)
assert s[s.index('export function compareAB'):]==old[old.index('export function compareAB'):]
for line in old.splitlines():
 if line.startswith(('  prefillMs:','  prefillTokens:','  decodeWorkTokensPerSecond:','  ttftMs:')): assert line in s,line
lab=Path('app/src/main/assets/haruna/diagnostics/lab.js').read_text()
for anchor in ['queue=Array.from({length:n},()=>[{name:\'A\',config:bank.A},{name:\'B\',config:bank.B}]).flat()','repetitions.value=3',"bank.A.systemPromptVariant!==bank.B.systemPromptVariant","k!=='systemPromptVariant'&&bank.A[k]!==bank.B[k]"]:
 assert anchor in lab,anchor
patch=Path('scripts/patch_android_context_lab.py').read_text();assert 'hc_apply(ctx_params, model, use_lab_context)' in patch
assert 'hd_fixed_seed||hd_sampler_fixed' in Path('patches/llama-android/haruna_lab.h').read_text()
print('PASS context scope: normal prompt/system experiment/backend Kotlin/hybrid reuse preserved; existing rates, medians, A/B order and repeat count unchanged.')
