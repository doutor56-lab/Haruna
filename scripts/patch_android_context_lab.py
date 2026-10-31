from pathlib import Path
import shutil

def apply_context_lab_patch():
 root=Path('third_party/llama.cpp/examples/llama.android/lib/src/main/cpp')
 for name in ['haruna_context_config.h','haruna_context_lab.h','haruna_thread_policy.h']:
  shutil.copyfile(Path('patches/llama-android')/name,root/name)
 p=root/'ai_chat.cpp';s=p.read_text()
 if '#include "haruna_context_config.h"' not in s:
  s=s.replace('static llama_context *init_context(', '#include "haruna_context_config.h"\nstatic llama_context *init_context(',1)
  s=s.replace('const int n_ctx = DEFAULT_CONTEXT_SIZE) {','const int n_ctx = DEFAULT_CONTEXT_SIZE, bool use_lab_context = false) {',1)
  s=s.replace('    ctx_params.n_threads_batch = n_threads;', '    ctx_params.n_threads_batch = n_threads;\n    hc_apply(ctx_params, model, use_lab_context);',1)
  s=s.replace('        auto *context = init_context(g_model);','        hc_config={};hc_requested=HarunaJson::object();hc_rebuild_us=0;\n        auto *context = init_context(g_model);',1)
  s=s.replace('hs_resources = 15; hm_context();','hs_resources = 15; hm_context();hl_model_prepared();hc_observe();',1)
  s=s.replace('i += BATCH_SIZE)', 'i += llama_n_batch(context))')
  s=s.replace('std::min((int) tokens.size() - i, BATCH_SIZE)', 'std::min((int) tokens.size() - i, (int)llama_n_batch(context))')
  s=s.replace('DEFAULT_CONTEXT_SIZE - OVERFLOW_HEADROOM','llama_n_ctx(g_context) - OVERFLOW_HEADROOM')
  s=s.replace('#include "haruna_lab.h"','#include "haruna_context_lab.h"\n#include "haruna_lab.h"')
 p.write_text(s)
 # Actual tensor types for the two audited memory implementations; unknown remains -1.
 p=Path('third_party/llama.cpp/src/llama-context.cpp');s=p.read_text()
 if 'haruna_observed_kv_type' not in s:
  s+='''
#include "llama-kv-cache.h"
#include "llama-memory-hybrid.h"
extern "C" LLAMA_API int haruna_observed_kv_type(const llama_context * ctx, int value) {
    auto * memory=ctx->get_memory();
    const auto * kv=dynamic_cast<const llama_kv_cache *>(memory);
    if(!kv){const auto * hybrid=dynamic_cast<const llama_memory_hybrid *>(memory);if(hybrid)kv=hybrid->get_mem_attn();}
    return kv?static_cast<int>(value?kv->type_v():kv->type_k()):-1;
}
'''
 p.write_text(s)
 p=root/'haruna_metrics.h';s=p.read_text()
 if 'haruna_observed_kv_type' not in s:
  s='extern "C" int haruna_observed_kv_type(const llama_context *, int);\n'+s
  s=s.replace('    value["flashEffective"]=haruna_observed_flash(g_context);','''    value["modelHybrid"]=llama_model_is_hybrid(g_model);value["modelRecurrent"]=llama_model_is_recurrent(g_model);
    const int actual_k=haruna_observed_kv_type(g_context,0),actual_v=haruna_observed_kv_type(g_context,1);
    value["kvActualK"]=actual_k>=0?HarunaJson(ggml_type_name(static_cast<ggml_type>(actual_k))):HarunaJson(nullptr);
    value["kvActualV"]=actual_v>=0?HarunaJson(ggml_type_name(static_cast<ggml_type>(actual_v))):HarunaJson(nullptr);
    value["flashEffective"]=haruna_observed_flash(g_context);''')
 p.write_text(s)
