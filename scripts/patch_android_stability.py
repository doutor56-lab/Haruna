"""Ticketed cancellation and explicit native ownership on the same pinned SDK. No tuning."""
from pathlib import Path
import re
import shutil
from patch_android_metrics import replace_once


def apply_stability_patch():
    root = Path('third_party/llama.cpp/examples/llama.android/lib/src/main')
    for name in ('haruna_runtime_control.h', 'haruna_resources.h', 'haruna_strings.h'):
        shutil.copyfile('patches/llama-android/' + name, root / 'cpp' / name)
    api = root / 'java/com/arm/aichat/InferenceEngine.kt'
    text = api.read_text()
    if 'fun cancelGeneration(' not in text:
        text = replace_once(text, 'enableThinking: Boolean): Flow<String>', 'enableThinking: Boolean, requestSerial: Long): Flow<String>')
        text = replace_once(text, '    fun runtimeMetrics(): String', '    fun runtimeMetrics(): String\n    fun cancelGeneration(requestSerial: Long, reason: Int): Boolean')
        api.write_text(text)
    impl = root / 'java/com/arm/aichat/internal/InferenceEngineImpl.kt'
    text = impl.read_text()
    if '// Haruna stability ownership' not in text:
        text = text.replace('import kotlinx.coroutines.CancellationException', '''import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.ensureActive
import kotlin.coroutines.coroutineContext''', 1)
        for name in ('init', 'load', 'prepare', 'systemInfo', 'lastLoadError', 'benchModel', 'processSystemPrompt',
                     'processUserPrompt', 'processChatMessages', 'generateNextToken', 'unload', 'shutdown'):
            text = re.sub(r'    @FastNative\n(    private external fun ' + name + r'\b)', r'\1', text)
        text = replace_once(text, '    private external fun unload()', '    private external fun unload(): Int')
        text = replace_once(text, '    override external fun runtimeMetrics(): String', '''    override external fun runtimeMetrics(): String
    private external fun reserveGeneration(requestSerial: Long): Int
    override external fun cancelGeneration(requestSerial: Long, reason: Int): Boolean
    private external fun finishGeneration(requestSerial: Long): Int
    @FastNative
    private external fun nativeStopCode(): Int

    // Haruna stability ownership: JNI control is direct; weights/compute stay serialized.
    @Volatile private var activeGeneration = 0L
    @Volatile private var nativeReady = false''')
        text = replace_once(text, '            instance ?: synchronized(this) {',
                            '            instance ?: synchronized(this) {\n                instance?.let { return@synchronized it }')
        text = replace_once(text, '                init(nativeLibDir)', '                init(nativeLibDir)\n                nativeReady = true')
        text = replace_once(text, '                Log.e(TAG, "Failed to load native library", e)\n                throw e',
                            '                _state.value = InferenceEngine.State.Error(e)\n                Log.e(TAG, "Failed to initialize native library")')
        text = replace_once(text, '            } catch (e: Exception) {\n                _state.value = InferenceEngine.State.Error(e)\n                Log.e(TAG, "Failed to initialize native library")',
                            '            } catch (e: Throwable) {\n                _state.value = InferenceEngine.State.Error(IOException("Falha ao inicializar runtime nativo", e))\n                Log.e(TAG, "Failed to initialize native library")')
        text = replace_once(text, '                _state.value = InferenceEngine.State.Error(e)\n                throw e',
                            '                if (nativeReady) runCatching { unload() }\n                _readyForSystemPrompt = false\n                _state.value = InferenceEngine.State.Error(e)\n                throw e')
        text = replace_once(text, 'enableThinking: Boolean): Flow<String> = streamResponse {',
                            'enableThinking: Boolean, requestSerial: Long): Flow<String> = streamResponse(requestSerial) {')
        begin = text.index('    private fun streamResponse(')
        end = text.index('    }.flowOn(llamaDispatcher)', begin) + len('    }.flowOn(llamaDispatcher)')
        text = text[:begin] + '''    private fun streamResponse(requestSerial: Long? = null, prepareInput: () -> Int): Flow<String> = flow {
        check(_state.value is InferenceEngine.State.ModelReady) { "Model is not ready" }
        var armed = false
        var entered = false
        try {
            if (requestSerial != null) {
                check(reserveGeneration(requestSerial) == 0) { "Native generation is busy" }
                activeGeneration = requestSerial; armed = true
            }
            entered = true
            coroutineContext.ensureActive()
            _cancelGeneration = false; _readyForSystemPrompt = false
            _state.value = InferenceEngine.State.ProcessingUserPrompt
            val prepared = prepareInput()
            if (prepared != 0) {
                if (nativeStopCode() in listOf(5, 7, 8, 9)) throw CancellationException("Native generation cancelled")
                throw IOException("Falha nativa ao preparar entrada (fase ${nativeStopCode()}, código $prepared)")
            }
            _state.value = InferenceEngine.State.Generating
            while (!_cancelGeneration) {
                coroutineContext.ensureActive()
                val token = generateNextToken()
                if (token == null) {
                    when (val code = nativeStopCode()) {
                        1, 2 -> break
                        5, 7, 8, 9 -> throw CancellationException("Native generation cancelled")
                        else -> throw IOException("Inferência nativa interrompida por erro ou causa desconhecida (fase $code)")
                    }
                }
                if (token.isNotEmpty()) emit(token)
            }
            if (_cancelGeneration) throw CancellationException("Runtime unloaded")
        } catch (cancelled: CancellationException) {
            if (armed) cancelGeneration(requireNotNull(requestSerial), 5)
            throw cancelled
        } finally {
            withContext(NonCancellable + llamaDispatcher) {
                if (armed) {
                    val result = try { finishGeneration(requireNotNull(requestSerial)) }
                        finally { activeGeneration = 0L }
                    _state.value = when (result) {
                        0 -> InferenceEngine.State.ModelReady
                        2 -> InferenceEngine.State.Initialized
                        else -> InferenceEngine.State.Error(IOException("Native generation ownership mismatch"))
                    }
                } else if (entered) _state.value = InferenceEngine.State.ModelReady
            }
        }
    }.flowOn(llamaDispatcher)''' + text[end:]
        begin = text.index('    override fun cleanUp() {')
        end = text.index('    /**', begin)
        text = text[:begin] + '''    override fun cleanUp() {
        _cancelGeneration = true
        if (activeGeneration > 0) cancelGeneration(activeGeneration, 7)
        runBlocking(llamaDispatcher) {
            check(activeGeneration == 0L) { "Cancel and join the generation before cleanup" }
            _readyForSystemPrompt = false
            if (nativeReady) {
                check(unload() == 0) { "Native resources still in use" }
                _state.value = InferenceEngine.State.Initialized
            }
        }
    }

''' + text[end:]
        begin = text.index('    override fun destroy() {')
        text = text[:begin] + '''    override fun destroy() {
        synchronized(Companion) {
            if (instance !== this) return
            _cancelGeneration = true
            if (activeGeneration > 0) cancelGeneration(activeGeneration, 8)
            runBlocking(llamaDispatcher) {
                check(activeGeneration == 0L) { "Cancel and join the generation before destroy" }
                if (nativeReady) { check(unload() == 0); shutdown(); nativeReady = false }
                _readyForSystemPrompt = false
                _state.value = InferenceEngine.State.Uninitialized
            }
            llamaScope.cancel()
            instance = null
        }
    }
}
'''
        impl.write_text(text)

    cpp = root / 'cpp/ai_chat.cpp'
    text = cpp.read_text()
    if '// Haruna stability resource owner' not in text:
        text = replace_once(text, '#include "haruna_metrics.h"', '#include "haruna_metrics.h"\n#include "haruna_strings.h"\n// Haruna stability resource owner')
        text = replace_once(text, '    ggml_backend_load_all_from_path(path_to_backend);',
                            '    if (!hs_registry_loaded) { ggml_backend_load_all_from_path(path_to_backend); hs_registry_loaded = true; }')
        text = replace_once(text, '    llama_backend_init();', '    llama_backend_init();\n    hs_backend_ready = true;')
        begin = text.index('    // Set llama log handler to Android')
        end = text.index('\n}', begin)
        text = text[:begin] + '''    try {
        llama_log_set(haruna_load_log_callback, nullptr);
        const auto path = hs_from_java(env, nativeLibDir);
        if (!hs_registry_loaded) { ggml_backend_load_all_from_path(path.c_str()); hs_registry_loaded = true; }
        llama_backend_init(); hs_backend_ready = true;
    } catch (...) {
        auto type = env->FindClass("java/io/IOException");
        if (type) env->ThrowNew(type, "Native backend initialization failed");
    }''' + text[end:]
        text = replace_once(text, '    return env->NewStringUTF(g_last_load_error.c_str());',
                            '    return hs_utf8(g_last_load_error) == 0 ? hs_to_java(env, g_last_load_error) : env->NewStringUTF("Native diagnostic encoding unavailable");')
        # Load owns its model immediately; no overwriting a live global on recovery.
        begin = text.index('    const auto *model_path = env->GetStringUTFChars(jmodel_path, 0);')
        end = text.index('\nstatic llama_context *init_context(', begin)
        # Keep the loader diagnostic JNI function which lies between load and init_context.
        fn_end = text.index('\n}', begin) + 2
        text = text[:begin] + '''    if (g_model || g_context) return 2;
    try {
        const auto path = hs_from_java(env, jmodel_path);
        { std::lock_guard<std::mutex> lock(g_load_error_mutex); g_last_load_error.clear(); }
        auto * model = llama_model_load_from_file(path.c_str(), model_params);
        if (!model) return 1;
        g_model = model; hs_resources = 1; ++hs_loads;
        return 0;
    } catch (...) { haruna_release_resources(); return 1; }
}''' + text[fn_end:]
        text = replace_once(text, '    auto *context = llama_init_from_model(g_model, ctx_params);',
                            '    ctx_params.abort_callback = hs_abort;\n    ctx_params.abort_callback_data = nullptr;\n    auto *context = llama_init_from_model(g_model, ctx_params);')
        begin = text.index('    auto *context = init_context(g_model);')
        end = text.index('\n}', begin)
        text = text[:begin] + '''    try {
        auto *context = init_context(g_model);
        if (!context) { haruna_release_resources(); return 1; }
        g_context = context; hs_resources = 3;
        g_batch = common_batch(context); hs_resources = 11;
        g_chat_templates = common_chat_templates_init(g_model, "");
        g_sampler = new_sampler(DEFAULT_SAMPLER_TEMP);
        if (!g_chat_templates || !g_sampler) { haruna_release_resources(); return 1; }
        hs_resources = 15; hm_context();
        return 0;
    } catch (...) { haruna_release_resources(); return 1; }''' + text[end:]
        text = replace_once(text, '    if (clear_kv_cache)\n', '    if (clear_kv_cache && g_context)\n')
        text = replace_once(text, 'static int decode_tokens_in_batches(', '#include "haruna_resources.h"\n\nstatic int decode_tokens_in_batches(')
        text = replace_once(text, '        const int cur_batch_size =', '        if (hs_check_cancel()) return 5;\n        const int cur_batch_size =')
        # Existing unsigned-char scan could read beyond an incomplete UTF-8 token.
        begin = text.index('static bool is_valid_utf8(')
        end = text.index('extern "C"', begin)
        text = text[:begin] + text[end:]
        text = replace_once(text, '    // Check the budget before any context shifting.',
                            '    if (!g_model || !g_context || !g_sampler) { hm_finish(3); return nullptr; }\n    if (hs_check_cancel()) return nullptr;\n    // Check the budget before any context shifting.')
        text = replace_once(text, '    common_sampler_accept(g_sampler, new_token_id, true);', '''    if (new_token_id < 0 || new_token_id >= llama_vocab_n_tokens(llama_model_get_vocab(g_model))) {
        hm_finish(3); return nullptr;
    }
    if (hs_check_cancel()) return nullptr;
    if (hs_logit_checks.load() == 0) hs_logits_observed();
    common_sampler_accept(g_sampler, new_token_id, true);''')
        text = replace_once(text, '        hm_finish(3);\n        LOGe', '        if (!hs_check_cancel()) hm_finish(3);\n        LOGe')
        text = replace_once(text, '    ++hm_tokens;', '    hs_token_observed(new_token_id);\n    ++hm_tokens;')
        text = replace_once(text, '        hm_finish(1);',
                            '        if (!cached_token_chars.empty()) { hm_finish(10); return nullptr; }\n        hm_finish(1);')
        text = replace_once(text, '    if (is_valid_utf8(cached_token_chars.c_str())) {', '''    const int utf8_status = hs_utf8(cached_token_chars);
    if (utf8_status == 2) { hm_finish(10); return nullptr; }
    if (utf8_status == 0) {''')
        text = replace_once(text, '        result = env->NewStringUTF(cached_token_chars.c_str());',
                            '        result = hs_to_java(env, cached_token_chars);')
        begin = text.index('    if (!g_model || !g_context || !g_sampler) { hm_finish(3); return nullptr; }')
        end = text.index('\n}', begin)
        text = text[:begin] + '    try {\n' + text[begin:end] + '''
    } catch (...) { if (!hs_check_cancel()) hm_finish(3); return nullptr; }
''' + text[end:]
        begin = text.index('JNIEXPORT void JNICALL\nJava_com_arm_aichat_internal_InferenceEngineImpl_unload(')
        end = text.index('\nextern "C"', begin)
        text = text[:begin] + '''JNIEXPORT jint JNICALL
Java_com_arm_aichat_internal_InferenceEngineImpl_unload(JNIEnv *, jobject) {
    if (hs_ticket.load() != 0) return 1;
    haruna_release_resources();
    return 0;
}

''' + text[end:]
        text = replace_once(text, '    llama_backend_free();', '    haruna_release_resources();\n    llama_backend_free();\n    hs_backend_ready = false;')
        cpp.write_text(text)
    print('Patched JNI safety, ticket cancellation, idempotent resource cleanup and lossless UTF transport.')


if __name__ == '__main__':
    apply_stability_patch()
