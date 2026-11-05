"""Observational baseline extension for the pinned Android runtime; no inference tuning."""
from pathlib import Path
import shutil
import subprocess


def replace_once(text, old, new):
    if old not in text:
        raise SystemExit('Unsupported runtime metric anchor: ' + old[:90])
    return text.replace(old, new, 1)


def apply_metrics_patch():
    base = Path('third_party/llama.cpp')
    root = base / 'examples/llama.android/lib/src/main'
    rev = subprocess.check_output(['git', '-C', str(base), 'rev-parse', 'HEAD'], text=True).strip()
    if len(rev) != 40 or any(c not in '0123456789abcdef' for c in rev):
        raise SystemExit('Cannot identify runtime revision')
    (root / 'cpp/haruna_metrics_build.h').write_text('#define HARUNA_LLAMA_COMMIT "' + rev + '"\n')
    shutil.copyfile('patches/llama-android/haruna_metrics.h', root / 'cpp/haruna_metrics.h')
    api = root / 'java/com/arm/aichat/InferenceEngine.kt'
    text = api.read_text()
    if 'fun runtimeMetrics()' not in text:
        text = replace_once(text, '    fun chatMetrics(): IntArray', '    fun chatMetrics(): IntArray\n    fun runtimeMetrics(): String')
        api.write_text(text)
    impl = root / 'java/com/arm/aichat/internal/InferenceEngineImpl.kt'
    text = impl.read_text()
    if 'fun runtimeMetrics()' not in text:
        text = replace_once(text, '    override external fun chatMetrics(): IntArray',
                            '    override external fun chatMetrics(): IntArray\n\n    override external fun runtimeMetrics(): String')
        impl.write_text(text)
    cmake = root / 'cpp/CMakeLists.txt'
    text = cmake.read_text()
    if '# Haruna scalar observers' not in text:
        text += '\n# Haruna scalar observers: staging memory API; inference options unchanged.\n'
        text += 'target_include_directories(${CMAKE_PROJECT_NAME} PRIVATE ${LLAMA_SRC}/src)\n'
        text += 'target_link_libraries(${CMAKE_PROJECT_NAME} dl)\n'
        cmake.write_text(text)
    core = base / 'src/llama-context.cpp'
    text = core.read_text()
    if 'haruna_observed_flash' not in text:
        text += '''
// Haruna scalar observers. Called on the inference thread, never from DBG directly.
extern "C" LLAMA_API int haruna_observed_flash(const llama_context * ctx) {
    const auto & p = ctx->get_cparams();
    return p.auto_fa ? -1 : (p.flash_attn ? 1 : 0);
}
extern "C" LLAMA_API int haruna_observed_gpu_layers(const llama_context * ctx) {
    const auto & model = ctx->get_model();
    int count = 0;
    for (uint32_t i = 0; i < model.hparams.n_layer(); ++i) {
        auto dev = model.dev_layer(i);
        if (dev && (ggml_backend_dev_type(dev) == GGML_BACKEND_DEVICE_TYPE_GPU || ggml_backend_dev_type(dev) == GGML_BACKEND_DEVICE_TYPE_IGPU)) ++count;
    }
    return count;
}
'''
        core.write_text(text)
    cpp = root / 'cpp/ai_chat.cpp'
    text = cpp.read_text()
    if '#include "haruna_metrics.h"' not in text:
        text = replace_once(text, 'static common_sampler                   * g_sampler;',
                            'static common_sampler                   * g_sampler;\n#include "haruna_metrics_build.h"\n#include "haruna_metrics.h"')
        text = replace_once(text, '    auto *context = llama_init_from_model(g_model, ctx_params);', '''    {
        std::lock_guard<std::mutex> guard(hm_lock);
        hm_runtime["kvK"] = ggml_type_name(ctx_params.type_k);
        hm_runtime["kvV"] = ggml_type_name(ctx_params.type_v);
        hm_runtime["flashRequested"] = llama_flash_attn_type_name(ctx_params.flash_attn_type);
    }
    auto *context = llama_init_from_model(g_model, ctx_params);''')
        text = replace_once(text, '    g_sampler = new_sampler(DEFAULT_SAMPLER_TEMP);',
                            '    g_sampler = new_sampler(DEFAULT_SAMPLER_TEMP);\n    hm_context();')
        text = replace_once(text, 'static void shift_context() {', 'static void shift_context() {\n    ++hm_shifts;')
        text = replace_once(text, '        if (decode_result) {', '''        if (decode_result == 0 && hm_stage.load() == 3) {
            hm_prefill_tokens += cur_batch_size;
            hm_occupied = start_pos + i + cur_batch_size;
        }
        if (decode_result) {''')
        text = replace_once(text, '    if (current_position >= stop_generation_position) return nullptr;',
                            '    if (current_position >= stop_generation_position) { hm_finish(2); return nullptr; }')
        text = replace_once(text, '    // Sample next token', '    HarunaDecodeTimer measured_step;\n    // Sample next token')
        text = replace_once(text, '    common_sampler_accept(g_sampler, new_token_id, true);', '''    if (hm_first_sample.load() < 0) hm_first_sample = hm_clock() - hm_start.load();
    common_sampler_accept(g_sampler, new_token_id, true);''')
        text = replace_once(text, '        LOGe("%s: llama_decode() failed for generated token", __func__);',
                            '        hm_finish(3);\n        LOGe("%s: llama_decode() failed for generated token", __func__);')
        text = replace_once(text, '    current_position++;', '    current_position++;\n    hm_occupied = current_position;')
        text = replace_once(text, '        common_chat_msg completed;', '        hm_finish(1);\n        common_chat_msg completed;')
        text = replace_once(text, '    if (haruna_output_tokens.load() >= 0) ++haruna_output_tokens;',
                            '    ++hm_tokens;\n    if (haruna_output_tokens.load() >= 0) ++haruna_output_tokens;')
        text = replace_once(text, '        result = env->NewStringUTF(cached_token_chars.c_str());',
                            '        result = env->NewStringUTF(cached_token_chars.c_str());\n        if (!cached_token_chars.empty()) hm_delta(cached_token_chars.size());')
        text = replace_once(text, '    llama_model_free(g_model);', '    llama_model_free(g_model);\n    hm_unloaded();')
        cpp.write_text(text)
    print('Patched baseline scalar runtime observers; inference configuration unchanged.')


if __name__ == '__main__':
    apply_metrics_patch()
