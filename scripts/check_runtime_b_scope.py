from pathlib import Path
import subprocess
BASE='2231fc7480ec0d6c4ca4434f8f76feb06c64e385'
OLD='7894e8b92481a8bb8ffe94f73b656ffe0dd01e10'
NEW='4d71b42fd87db24b8b7c808c151b713aa4459cfd'
allowed={'third_party/llama.cpp','app/build.gradle.kts','app/src/main/AndroidManifest.xml','docs/RUNTIME_B_RELATORIO.md','scripts/check_runtime_b_scope.py'}
changed=set(subprocess.check_output(['git','diff','--name-only',BASE,'HEAD'],text=True).splitlines())
assert changed<=allowed,changed-allowed
for f in ['app/build.gradle.kts','app/src/main/AndroidManifest.xml']:
 s=Path(f).read_text().replace('applicationId = "com.proxyslabs.haruna.runtimeb"','applicationId = "com.proxyslabs.haruna"').replace('versionName = "0.7-debug-lab-runtime-b"','versionName = "0.7-debug-lab"').replace('android:label="Haruna B"','android:label="Haruna"')
 assert s==subprocess.check_output(['git','show',BASE+':'+f],text=True),f
runtime='third_party/llama.cpp'
assert subprocess.check_output(['git','-C',runtime,'rev-parse','HEAD'],text=True).strip()==NEW
# Native toolchain/variant choices, sampler assembly and Qwen graph are identical upstream.
paths=['CMakeLists.txt','ggml/CMakeLists.txt','ggml/cmake','ggml/src/CMakeLists.txt','ggml/src/ggml-cpu/CMakeLists.txt','ggml/src/ggml-cpu/kleidiai','examples/llama.android','common/sampling.cpp','src/models/qwen35.cpp','src/models/delta-net-base.cpp']
delta=subprocess.check_output(['git','-C',runtime,'diff','--name-only',OLD,NEW,'--',*paths],text=True)
assert not delta,delta
ops=subprocess.check_output(['git','-C',runtime,'show',NEW+':ggml/src/ggml-cpu/ops.cpp'],text=True)
assert 'GGML_CONCAT_TILE = 32' in ops
prefix=Path('patches/llama-android/haruna_prefix_cache.h').read_text()
assert 'llama_model_is_hybrid' in prefix and 'llama_model_is_recurrent' in prefix
print('PASS runtime B: one pinned runtime revision; no Haruna inference/frontend/timer/prompt/voice/RAG/cache changes; only isolated package/label. Upstream Android build, KleidiAI selection, sampler assembly and Qwen3.5 graph unchanged.')
