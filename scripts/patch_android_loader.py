from pathlib import Path

cpp = Path('third_party/llama.cpp/examples/llama.android/lib/src/main/cpp/ai_chat.cpp')
text = cpp.read_text()

if '#include <mutex>' not in text:
    text = text.replace('#include <string>\n', '#include <string>\n#include <mutex>\n')

marker = 'static common_sampler                   * g_sampler;\n'
diagnostics = r'''
static std::mutex                        g_load_error_mutex;
static std::string                       g_last_load_error;

static void haruna_load_log_callback(enum ggml_log_level level, const char * text, void * /*user_data*/) {
    aichat_android_log_callback(level, text, nullptr);
    if (level == GGML_LOG_LEVEL_ERROR || level == GGML_LOG_LEVEL_WARN) {
        std::lock_guard<std::mutex> lock(g_load_error_mutex);
        if (text != nullptr) {
            g_last_load_error += text;
            if (!g_last_load_error.empty() && g_last_load_error.back() != '\n') g_last_load_error += '\n';
            constexpr size_t MAX_ERROR_CHARS = 12000;
            if (g_last_load_error.size() > MAX_ERROR_CHARS) {
                g_last_load_error.erase(0, g_last_load_error.size() - MAX_ERROR_CHARS);
            }
        }
    }
}
'''
if 'g_last_load_error' not in text:
    if marker not in text:
        raise SystemExit('Could not find llama.cpp sampler marker')
    text = text.replace(marker, marker + diagnostics)

text = text.replace(
    'llama_log_set(aichat_android_log_callback, nullptr);',
    'llama_log_set(haruna_load_log_callback, nullptr);'
)

load_line = '    auto *model = llama_model_load_from_file(model_path, model_params);'
if 'g_last_load_error.clear()' not in text:
    if load_line not in text:
        raise SystemExit('Could not find llama_model_load_from_file call')
    text = text.replace(
        load_line,
        '    { std::lock_guard<std::mutex> lock(g_load_error_mutex); g_last_load_error.clear(); }\n\n' + load_line,
        1,
    )

insertion = r'''
extern "C"
JNIEXPORT jstring JNICALL
Java_com_arm_aichat_internal_InferenceEngineImpl_lastLoadError(JNIEnv *env, jobject /*unused*/) {
    std::lock_guard<std::mutex> lock(g_load_error_mutex);
    return env->NewStringUTF(g_last_load_error.c_str());
}

'''
anchor = 'static llama_context *init_context('
if 'InferenceEngineImpl_lastLoadError' not in text:
    if anchor not in text:
        raise SystemExit('Could not find init_context anchor')
    text = text.replace(anchor, insertion + anchor, 1)
cpp.write_text(text)

kt = Path('third_party/llama.cpp/examples/llama.android/lib/src/main/java/com/arm/aichat/internal/InferenceEngineImpl.kt')
text = kt.read_text()
if 'private external fun lastLoadError()' not in text:
    needle = '    private external fun load(modelPath: String): Int\n'
    if needle not in text:
        raise SystemExit('Could not find Kotlin load JNI declaration')
    text = text.replace(
        needle,
        needle + '\n    @FastNative\n    private external fun lastLoadError(): String\n',
        1,
    )

old = '''                load(pathToModel).let {
                    // TODO-han.yin: find a better way to pass other error codes
                    if (it != 0) throw UnsupportedArchitectureException()
                }
'''
new = '''                load(pathToModel).let { code ->
                    if (code != 0) {
                        val nativeDetail = lastLoadError().trim()
                        val detail = if (nativeDetail.isNotEmpty()) nativeDetail else "llama_model_load_from_file returned null without a native diagnostic"
                        throw IOException("Falha nativa ao abrir o GGUF (load=$code): $detail")
                    }
                }
'''
if old in text:
    text = text.replace(old, new, 1)
elif 'Falha nativa ao abrir o GGUF' not in text:
    raise SystemExit('Expected upstream Kotlin load block not found')
kt.write_text(text)

print('Patched llama.cpp Android loader diagnostics.')

# Extend the same pinned binding; no separate backend or model-specific pipeline.
from patch_android_chat import apply_chat_patch
apply_chat_patch()
from patch_android_metrics import apply_metrics_patch
apply_metrics_patch()
from patch_android_stability import apply_stability_patch
apply_stability_patch()
from patch_android_prefix import apply_prefix_patch
apply_prefix_patch()



from patch_android_probes import apply_probe_patch
apply_probe_patch()

from patch_android_diag45 import apply_diag45_patch
apply_diag45_patch()

from patch_android_diag46 import apply_diag46_patch
apply_diag46_patch()

from patch_android_lab import apply_lab_patch
apply_lab_patch()

from patch_android_context_lab import apply_context_lab_patch
apply_context_lab_patch()

from patch_android_incremental import apply_incremental_patch
apply_incremental_patch()


from patch_android_vulkan_trace import apply_vulkan_trace_patch
apply_vulkan_trace_patch()
