"""Focused source contract checks on the actual fully patched, pinned Android binding."""
from pathlib import Path
base=Path('third_party/llama.cpp/examples/llama.android/lib/src/main')
s=(base/'cpp/ai_chat.cpp').read_text()
p=Path('patches/llama-android/haruna_decision_probe.h').read_text()
assert s.count('const auto new_token_id = common_sampler_sample(g_sampler, g_context, -1);')==1
assert 'common_sampler_get_candidates(g_sampler,false)' in p
for forbidden in ('common_sampler_sample(', 'llama_sampler_apply(', 'std::sort(', 'common_sampler_prev_str('):
    assert forbidden not in p, forbidden
for setting in ('DEFAULT_CONTEXT_SIZE    = 8192','BATCH_SIZE              = 512','DEFAULT_SAMPLER_TEMP    = 0.3f'):
    assert setting in s, setting
assert 'if (hd_fa_off) ctx_params.flash_attn_type=LLAMA_FLASH_ATTN_TYPE_DISABLED;' in s
assert 'if (hd_fixed_seed) sparams.seed=424242;' in s
assert 'if (!hd_fixed_seed && !hd_sampler_fixed) return;' in p
assert 'ggml_backend_load((path + "/libggml-cpu-android_armv8.0_1.so").c_str())' in s
assert 'if (!conservative) ggml_backend_load_all_from_path(path.c_str());' in s
assert 'hs_from_java(env,converted)==accumulated' in p
assert s.index('hd_decision(new_token_id,') < s.index('common_sampler_accept(g_sampler, new_token_id, true);')
assert s.index('hd_decision(new_token_id,') < s.index('auto new_token_chars = common_token_to_piece')
kt=(base/'java/com/arm/aichat/internal/InferenceEngineImpl.kt').read_text()
assert kt.count('@FastNative')==2
assert 'check(activeGeneration == 0L)' in kt
assert 'init(nativeLibDir, diagnosticCpu)' in kt
assert 'fun configureDiagnosticOptions' in kt
print('PASS: one original sample, no probe RNG/apply/sort/text logging; default constants, idle configuration, process-only CPU selection, lossless JNI and long-call annotations retained.')
