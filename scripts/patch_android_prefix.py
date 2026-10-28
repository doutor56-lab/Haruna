"""Exact token-prefix reconciliation on the existing pinned, ticketed Android binding."""
from pathlib import Path
import shutil
from patch_android_metrics import replace_once


def apply_prefix_patch():
    root = Path('third_party/llama.cpp/examples/llama.android/lib/src/main')
    for name in ('haruna_prefix_ledger.h', 'haruna_prefix_cache.h'):
        shutil.copyfile('patches/llama-android/' + name, root / 'cpp' / name)
    api = root / 'java/com/arm/aichat/InferenceEngine.kt'
    text = api.read_text()
    if 'conversationRevision: Long' not in text:
        text = replace_once(text, 'requestSerial: Long): Flow<String>',
                            'requestSerial: Long, conversationKey: String, conversationRevision: Long): Flow<String>')
        text = replace_once(text, '    fun runtimeMetrics(): String',
                            '    fun runtimeMetrics(): String\n    suspend fun invalidatePrefixCache()')
        api.write_text(text)
    impl = root / 'java/com/arm/aichat/internal/InferenceEngineImpl.kt'
    text = impl.read_text()
    if '// Haruna exact prefix cache' not in text:
        text = replace_once(text, 'predictLength: Int, enableThinking: Boolean): Int',
                            'predictLength: Int, enableThinking: Boolean, conversationKey: String, conversationRevision: Long): Int')
        text = replace_once(text, 'requestSerial: Long): Flow<String> = streamResponse(requestSerial)',
                            'requestSerial: Long, conversationKey: String, conversationRevision: Long): Flow<String> = streamResponse(requestSerial)')
        text = replace_once(text, '        processChatMessages(roles, contents, predictLength, enableThinking)',
                            '        // Haruna exact prefix cache: identity is separate from model input.\n        processChatMessages(roles, contents, predictLength, enableThinking, conversationKey, conversationRevision)')
        text = replace_once(text, '    private external fun reserveGeneration(requestSerial: Long): Int', '''    private external fun reserveGeneration(requestSerial: Long): Int
    private external fun invalidatePrefix(): Int
    override suspend fun invalidatePrefixCache() = withContext(llamaDispatcher) {
        check(activeGeneration == 0L) { "Cancel and join before invalidating context" }
        val code = invalidatePrefix()
        if (code == 2) _state.value = InferenceEngine.State.Initialized
        check(code == 0) { "Could not invalidate native prefix ($code)" }
    }''')
        impl.write_text(text)
    cpp = root / 'cpp/ai_chat.cpp'
    text = cpp.read_text()
    if '// Haruna exact prefix cache' not in text:
        text = replace_once(text, '#include "haruna_strings.h"',
                            '#include "haruna_strings.h"\n#include "haruna_prefix_cache.h"\n// Haruna exact prefix cache')
        text = replace_once(text, '    if (clear_kv_cache && g_context)\n',
                            '    if (clear_kv_cache) hk_invalidate(HkReason::legacy_reset,false);\n    if (clear_kv_cache && g_context)\n')
        text = replace_once(text, 'static void shift_context() {',
                            'static void shift_context() {\n    hk_invalidate(HkReason::context_shift,false);')
        text = replace_once(text, '        const bool compute_last_logit = false) {',
                            '        const bool compute_last_logit = false,\n        const int token_offset = 0) {')
        text = replace_once(text, '    for (int i = 0; i < (int) tokens.size(); i += BATCH_SIZE) {',
                            '    for (int i = token_offset; i < (int) tokens.size(); i += BATCH_SIZE) {')
        text = replace_once(text, '            hm_prefill_tokens += cur_batch_size;',
                            '            hk_confirm_prefill(tokens, static_cast<size_t>(i), static_cast<size_t>(cur_batch_size));\n            hm_prefill_tokens += cur_batch_size;')
        text = replace_once(text, '    current_position++;',
                            '    hk_confirm_decode(new_token_id,current_position);\n    current_position++;')
        cpp.write_text(text)
    print('Patched model/conversation-owned exact token prefix cache, pruning and confirmed-batch rollback.')


if __name__ == '__main__':
    apply_prefix_patch()
