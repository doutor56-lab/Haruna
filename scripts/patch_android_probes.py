"""Bounded sampler/token/transport probes and explicit DBG-only A/B. No default tuning."""
from pathlib import Path
import shutil
from patch_android_metrics import replace_once


def apply_probe_patch():
    root = Path('third_party/llama.cpp/examples/llama.android/lib/src/main')
    for name in ('haruna_probe_policy.h', 'haruna_decision_probe.h'):
        shutil.copyfile('patches/llama-android/' + name, root / 'cpp' / name)
    api = root / 'java/com/arm/aichat/InferenceEngine.kt'
    text = api.read_text()
    if 'configureDiagnosticOptions' not in text:
        text = replace_once(text, '    fun runtimeMetrics(): String',
                            '    fun runtimeMetrics(): String\n    suspend fun configureDiagnosticOptions(fixedSeed: Boolean, flashOff: Boolean)')
        api.write_text(text)
    impl = root / 'java/com/arm/aichat/internal/InferenceEngineImpl.kt'
    text = impl.read_text()
    if '// Haruna bounded decision probes' not in text:
        text = replace_once(text, '    private val nativeLibDir: String',
                            '    private val nativeLibDir: String, private val diagnosticCpu: Boolean')
        text = replace_once(text, 'InferenceEngineImpl(nativeLibDir).also',
                            'InferenceEngineImpl(nativeLibDir, context.getSharedPreferences("haruna_runtime_diagnostic", Context.MODE_PRIVATE).getBoolean("cpuConservative", false)).also')
        text = replace_once(text, 'private external fun init(nativeLibDir: String)',
                            'private external fun init(nativeLibDir: String, diagnosticCpu: Boolean)')
        text = replace_once(text, 'init(nativeLibDir)', 'init(nativeLibDir, diagnosticCpu)')
        text = replace_once(text, '    override external fun runtimeMetrics(): String', '''    override external fun runtimeMetrics(): String
    // Haruna bounded decision probes. Serialized, idle-only configuration; never from a token callback.
    private external fun setDiagnosticOptions(fixedSeed: Boolean, flashOff: Boolean): Int
    override suspend fun configureDiagnosticOptions(fixedSeed: Boolean, flashOff: Boolean) = withContext(llamaDispatcher) {
        check(activeGeneration == 0L) { "Aguarde a geração terminar" }
        check(setDiagnosticOptions(fixedSeed, flashOff) == 0) { "Runtime ocupado" }
    }''')
        impl.write_text(text)
    cpp = root / 'cpp/ai_chat.cpp'
    text = cpp.read_text()
    if '// Haruna bounded decision probes' not in text:
        text = replace_once(text, '#include "haruna_prefix_cache.h"', '#include "haruna_prefix_cache.h"\n#include "haruna_decision_probe.h"\n// Haruna bounded decision probes')
        text = replace_once(text, 'jstring nativeLibDir) {', 'jstring nativeLibDir, jboolean diagnosticCpu) {')
        text = replace_once(text, 'if (!hs_registry_loaded) { ggml_backend_load_all_from_path(path.c_str()); hs_registry_loaded = true; }', '''if (!hs_registry_loaded) {
            // A/B CPU only at process initialization. Never unload/swap a live registry.
            bool conservative=false;
            if (diagnosticCpu) conservative=ggml_backend_load((path + "/libggml-cpu-android_armv8.0_1.so").c_str())!=nullptr;
            if (!conservative) ggml_backend_load_all_from_path(path.c_str());
            { std::lock_guard<std::mutex> guard(hd_lock); hd_cpu_conservative=conservative; hd_cpu_fallback=diagnosticCpu&&!conservative; }
            hs_registry_loaded = true;
        }''')
        text = replace_once(text, '    ctx_params.n_ctx = n_ctx;',
                            '    if (hd_fa_off) ctx_params.flash_attn_type=LLAMA_FLASH_ATTN_TYPE_DISABLED;\n    ctx_params.n_ctx = n_ctx;')
        text = replace_once(text, '    return common_sampler_init(g_model, sparams);', '''    if (hd_fixed_seed) sparams.seed=424242;
    auto * sampler=common_sampler_init(g_model, sparams);
    if (sampler) hd_sampler_observed(sparams,sampler);
    hd_sampler_fixed=hd_fixed_seed;
    return sampler;''')
        text = replace_once(text, '    common_sampler_accept(g_sampler, new_token_id, true);', '''    hd_decision(new_token_id,current_position,
        llama_vocab_is_eog(llama_model_get_vocab(g_model),new_token_id) || current_position+1>=stop_generation_position);
    common_sampler_accept(g_sampler, new_token_id, true);
    hd_accept_observed();''')
        text = replace_once(text, '    if (llama_process(g_context, LLAMA_PROCESS_TYPE_DECODE, g_batch.get()) != 0) {', '''    const int diagnostic_decode_result=llama_process(g_context, LLAMA_PROCESS_TYPE_DECODE, g_batch.get());
    if (diagnostic_decode_result != 0) {
        hd_decode_observed(current_position,current_position,diagnostic_decode_result);''')
        text = replace_once(text, '    current_position++;',
                            '    current_position++;\n    hd_decode_observed(current_position-1,current_position,0);')
        text = replace_once(text, '        assistant_ss << cached_token_chars;',
                            '        hd_piece_observed(new_token_chars,cached_token_chars,utf8_status,result,env);\n        assistant_ss << cached_token_chars;')
        text = replace_once(text, '    if (utf8_status == 2) { hm_finish(10); return nullptr; }',
                            '    if (utf8_status == 2) { hd_piece_observed(new_token_chars,cached_token_chars,utf8_status,nullptr,env); hm_finish(10); return nullptr; }')
        text = replace_once(text, '        result = env->NewStringUTF("");',
                            '        result = env->NewStringUTF("");\n        hd_piece_observed(new_token_chars,cached_token_chars,utf8_status,result,env);')
        cpp.write_text(text)
    print('Patched bounded read-only decision probes and explicitly requested DBG A/B; defaults unchanged.')


if __name__ == '__main__':
    apply_probe_patch()
