from pathlib import Path
base=Path('third_party/llama.cpp')
root=base/'examples/llama.android/lib/src/main'
cpp=(root/'cpp/ai_chat.cpp').read_text()
cmake=(root/'cpp/CMakeLists.txt').read_text()
assert 'HARUNA_DIAGNOSTIC_45 "OFF" CACHE STRING' in cmake
for flag in ('set(GGML_CPU_KLEIDIAI OFF)','set(GGML_CPU_REPACK OFF CACHE BOOL',
             'set(GGML_CPU_ALL_VARIANTS OFF CACHE BOOL','set(GGML_CPU_ARM_ARCH "armv8-a"'):
    assert flag in cmake
assert 'd45_choice(new_token_id,current_position);' in cpp
assert cpp.count('const auto new_token_id = common_sampler_sample(g_sampler, g_context, -1);')==1
assert cpp.index('d45_choice(new_token_id,') < cpp.index('common_sampler_accept(g_sampler, new_token_id, true);')
traits=(base/'ggml/src/ggml-cpu/traits.cpp').read_text()
assert traits.index('tensor_traits->compute_forward(params, op)')<traits.index('haruna45_extra_hit(ggml_backend_buft_name(extra));')
runner=(root/'cpp/haruna45_runner.h').read_text()
assert 'hs_ticket.load()!=0 || g_model || g_context || d45_capture' in runner
assert 'partial files are not valid evidence' in runner
capture=(root/'cpp/haruna45_capture.h').read_text()
assert 'messages[1].content!=d45_prompt' in capture
assert 'hk_confirmed.load()!=0 || hk_memory_count()!=0' in capture
print('PASS: opt-in OFF default, verified conservative flags, real successful-traits counters, original sampler, canonical-only capture, idle ownership and clean KV.')
