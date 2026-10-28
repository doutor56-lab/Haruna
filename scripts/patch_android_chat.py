"""Small role-preserving extension to the exact llama.android binding used by Haruna.

Called by the existing loader patch, before Gradle configuration. No model files change.
"""
from pathlib import Path
import shutil


def apply_chat_patch():
    root = Path('third_party/llama.cpp/examples/llama.android/lib/src/main')
    api = root / 'java/com/arm/aichat/InferenceEngine.kt'
    text = api.read_text()
    if 'fun sendChatMessages(' not in text:
        anchor = '    fun sendUserPrompt(message: String, predictLength: Int = DEFAULT_PREDICT_LENGTH): Flow<String>\n'
        if anchor not in text:
            raise SystemExit('Unsupported llama.android chat API revision')
        text = text.replace(anchor, anchor + '''
    /** Complete structured conversation; the model's own template is applied natively. */
    fun sendChatMessages(roles: Array<String>, contents: Array<String>, predictLength: Int,
                         enableThinking: Boolean): Flow<String>
    /** Scalar counters only; no content, template source text or model loading. */
    fun chatMetrics(): IntArray
''', 1)
        api.write_text(text)

    impl = root / 'java/com/arm/aichat/internal/InferenceEngineImpl.kt'
    text = impl.read_text()
    if 'private external fun processChatMessages(' not in text:
        anchor = '    private external fun processUserPrompt(userPrompt: String, predictLength: Int): Int\n'
        if anchor not in text:
            raise SystemExit('Unsupported llama.android JNI revision')
        text = text.replace(anchor, anchor + '''
    @FastNative
    private external fun processChatMessages(roles: Array<String>, contents: Array<String>,
                                            predictLength: Int, enableThinking: Boolean): Int
    @FastNative
    override external fun chatMetrics(): IntArray
''', 1)
    if 'private fun streamResponse(' not in text:
        anchor = '''    ): Flow<String> = flow {
        require(message.isNotEmpty()) { "User prompt discarded due to being empty!" }
'''
        replacement = '''    ): Flow<String> = streamResponse {
        require(message.isNotEmpty()) { "User prompt discarded due to being empty!" }
        processUserPrompt(message, predictLength)
    }

    override fun sendChatMessages(roles: Array<String>, contents: Array<String>, predictLength: Int,
                                  enableThinking: Boolean): Flow<String> = streamResponse {
        require(roles.size == contents.size && roles.size in 2..18) { "Invalid structured conversation" }
        processChatMessages(roles, contents, predictLength, enableThinking)
    }

    private fun streamResponse(prepareInput: () -> Int): Flow<String> = flow {
'''
        if anchor not in text:
            raise SystemExit('Unsupported llama.android streaming flow')
        text = text.replace(anchor, replacement, 1)
        old = '''            processUserPrompt(message, predictLength).let { result ->
                if (result != 0) {
                    Log.e(TAG, "Failed to process user prompt: $result")
                    return@flow
                }
            }'''
        new = '''            prepareInput().let { result ->
                if (result != 0) throw IOException("Não foi possível preparar o contexto do chat (código $result). Verifique o template GGUF e o tamanho da entrada.")
            }'''
        if old not in text:
            raise SystemExit('Unsupported llama.android input processing block')
        text = text.replace(old, new, 1)
    impl.write_text(text)

    cpp = root / 'cpp/ai_chat.cpp'
    text = cpp.read_text()
    if '#include "haruna_chat.h"' not in text:
        anchor = 'extern "C"\nJNIEXPORT jint JNICALL\nJava_com_arm_aichat_internal_InferenceEngineImpl_processSystemPrompt('
        if anchor not in text:
            raise SystemExit('Unsupported llama.android native decode helper')
        text = text.replace(anchor, '#include "haruna_chat.h"\n\n' + anchor, 1)
        # A token budget counts output tokens, never another copy of the input length.
        text = text.replace('stop_generation_position = current_position + user_prompt_size + n_predict;',
                            'stop_generation_position = current_position + n_predict;', 1)
        start = text.index('    // Infinite text generation via context shifting')
        end = text.index('    // Sample next token', start)
        text = text[:start] + '''    // Check the budget before any context shifting. Structured requests reserve
    // the entire generation budget, so their identity/profile cannot be shifted out.
    if (current_position >= stop_generation_position) return nullptr;
    if (current_position >= DEFAULT_CONTEXT_SIZE - OVERFLOW_HEADROOM) shift_context();

''' + text[end:]
        text = text.replace('        chat_add_and_format(ROLE_ASSISTANT, assistant_ss.str());', '''        common_chat_msg completed;
        completed.role = ROLE_ASSISTANT; completed.content = assistant_ss.str();
        chat_msgs.push_back(std::move(completed));''', 1)
        text = text.replace('    // If not EOG, convert to text',
                            '    if (haruna_output_tokens.load() >= 0) ++haruna_output_tokens;\n\n    // If not EOG, convert to text', 1)
    # Upstream logs contain entire prompts, formatted conversations and token pieces.
    # Remove at the source, not from generated output or the UI.
    lines = text.splitlines(keepends=True)
    text = ''.join(line for line in lines if not any(marker in line for marker in (
        'System prompt received:', 'User prompt received:', 'Formatted and added',
        'LOGv(',
    )))
    cpp.write_text(text)
    shutil.copyfile('patches/llama-android/haruna_chat.h', root / 'cpp/haruna_chat.h')
    print('Patched Android structured chat input and content-safe streaming logs.')


if __name__ == '__main__':
    apply_chat_patch()
