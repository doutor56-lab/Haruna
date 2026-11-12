"""CPU ownership/startup path matching upstream common/llama.rn without importing React Native."""
from pathlib import Path
import shutil

def apply_startup_patch():
    root=Path('third_party/llama.cpp/examples/llama.android/lib/src/main')
    cpp=root/'cpp'
    for name in ['haruna_threadpools.h','haruna_system_prefix.h']:
        shutil.copyfile(Path('patches/llama-android')/name,cpp/name)
    p=cpp/'ai_chat.cpp';s=p.read_text()
    if '#include "haruna_threadpools.h"' not in s:s=s.replace('#include "haruna_decision_probe.h"','#include "haruna_decision_probe.h"\n#include "haruna_threadpools.h"')
    if '#include "haruna_system_prefix.h"' not in s:s=s.replace('#include "haruna_chat.h"','#include "haruna_chat.h"\n#include "haruna_system_prefix.h"')
    p.write_text(s)
    for name in ['haruna_lab.h','haruna_inference_settings.h']:
        p=cpp/name;s=p.read_text().replace('llama_set_n_threads(g_context,','ht_set_threads(g_context,');p.write_text(s)
    p=cpp/'haruna_inference_settings.h';s=p.read_text().replace('static void ho_model_prepared() {','static void ho_model_prepared() {\n    ht_ensure(g_context);');p.write_text(s)
    for name in ['haruna_context_lab.h','haruna_resources.h']:
        p=cpp/name;s=p.read_text().replace('llama_free(g_context);','ht_release(g_context);llama_free(g_context);').replace('g_context=nullptr; llama_free(owned);','g_context=nullptr; ht_release(owned); llama_free(owned);');p.write_text(s)
    p=cpp/'haruna_prefix_cache.h';s=p.read_text()
    if 'hw_try_restore' not in s:
        s=s.replace('static std::atomic<bool> hk_valid{false};','static std::atomic<bool> hk_valid{false};\nstatic void hw_release();\nstatic void hw_try_restore(const llama_tokens &,const haruna_prefix::Owner &);')
        s=s.replace('static void hk_release() {','static void hk_release() {\n    hw_release();')
        s=s.replace('    const auto plan=hk_ledger.reconcile(owner,tokens,supported,','    if(supported)hw_try_restore(tokens,owner);\n    const auto plan=hk_ledger.reconcile(owner,tokens,supported,')
    p.write_text(s)
    # Detachment needs to clear the backend pointer BEFORE freeing the pool (not only ctx fields).
    p=Path('third_party/llama.cpp/src/llama-context.cpp');s=p.read_text()
    if 'haruna_detach_owned_threadpools' not in s:s+='''
extern "C" LLAMA_API void haruna_detach_owned_threadpools(llama_context * ctx) {
    if(!ctx)return;
    ctx->synchronize();
    auto sched=ctx->get_sched();
    if(sched)for(int i=0;i<ggml_backend_sched_get_n_backends(sched);++i){
        auto backend=ggml_backend_sched_get_backend(sched,i);
        auto device=ggml_backend_get_device(backend);
        if(!device||ggml_backend_dev_type(device)!=GGML_BACKEND_DEVICE_TYPE_CPU)continue;
        auto reg=ggml_backend_dev_backend_reg(device);
        auto fn=reinterpret_cast<void(*)(ggml_backend_t,ggml_threadpool_t)>(ggml_backend_reg_get_proc_address(reg,"ggml_backend_cpu_set_threadpool"));
        if(fn)fn(backend,nullptr);
    }
    ctx->detach_threadpool();
}
'''
    p.write_text(s)
    p=cpp/'CMakeLists.txt';s=p.read_text().replace('set(GGML_OPENMP ON)','set(GGML_OPENMP OFF)');p.write_text(s)
    for name in ['InferenceEngine.kt','internal/InferenceEngineImpl.kt']:
        p=root/'java/com/arm/aichat'/name;s=p.read_text()
        if 'primeStaticSystem' not in s:
            if name=='InferenceEngine.kt':s=s.replace('    fun runtimeMetrics(): String','    fun runtimeMetrics(): String\n    suspend fun primeStaticSystem(system: String, config: String, maxStateBytes: Long)')
            else:s=s.replace('    override external fun runtimeMetrics(): String','''    override external fun runtimeMetrics(): String
    private external fun primeSystemNative(system: String, config: String, maxStateBytes: Long): Int
    override suspend fun primeStaticSystem(system: String, config: String, maxStateBytes: Long) = withContext(llamaDispatcher) {
        check(activeGeneration==0L) { "Runtime ocupado" }
        _state.value=InferenceEngine.State.ProcessingSystemPrompt
        try { check(primeSystemNative(system,config,maxStateBytes)==0) { "Não foi possível preparar o prefixo do modelo" } }
        finally { _state.value=InferenceEngine.State.ModelReady }
    }''')
        p.write_text(s)
