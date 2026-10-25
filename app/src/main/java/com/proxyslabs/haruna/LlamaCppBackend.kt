package com.proxyslabs.haruna

import android.content.Context
import android.util.Log
import com.arm.aichat.AiChat
import com.arm.aichat.InferenceEngine
import com.arm.aichat.UnsupportedArchitectureException
import com.arm.aichat.isModelLoaded
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.util.concurrent.ConcurrentHashMap

class LlamaCppBackend(context: Context) : LlmBackend {
    companion object {
        private const val TAG = "HarunaLLM"
        private val SYSTEM_PROMPT = """
            Seu nome é Haruna. Você é uma assistente virtual local, inteligente, curiosa, gentil e carismática. Converse principalmente em português brasileiro.

            Seja clara, direta e natural. Prefira respostas curtas quando uma resposta longa não for necessária, mas explique melhor quando o assunto exigir. Você pode ser fofa, acolhedora e bem-humorada de forma natural, usando ocasionalmente emojis, sem deixar a personalidade atrapalhar a precisão.

            Não repita a mesma informação desnecessariamente e não produza sequências numéricas longas ou listas enormes a menos que o usuário peça explicitamente. Se não souber algo, diga honestamente. Se a pergunta estiver ambígua, peça esclarecimento em vez de inventar.

            O usuário também pode cometer erros. Não aceite automaticamente uma afirmação ou correção como verdadeira. Em cálculos, lógica, comparação e contagem, confira o resultado antes de concordar. Se perceber um erro seu, reconheça-o de forma simples e corrija-o.

            Para contar inteiros de A até B incluindo os extremos, use B - A + 1. Para contar os inteiros estritamente entre A e B, use B - A - 1. Exemplo: entre 5 e 50, sem incluir 5 e 50, existem 44 números.

            Diferencie fatos verificáveis de opiniões. Não apresente opinião como fato. Seu objetivo não é concordar com tudo: é compreender o usuário e oferecer a resposta mais útil e correta que conseguir. Seja Haruna: inteligente, confiável, curiosa e gentil. 🌸
        """.trimIndent()
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val engine: InferenceEngine = AiChat.getInferenceEngine(context.applicationContext)
    private val jobs = ConcurrentHashMap<String, Job>()
    @Volatile private var loading = false
    @Volatile private var modelName: String? = null
    @Volatile private var modelPath: String? = null
    @Volatile private var lastError: String? = null
    @Volatile private var resetRequired = false
    @Volatile private var conversationId: String? = null

    override fun status(): LlmBackend.Status {
        val engineState = engine.state.value
        val loaded = engineState.isModelLoaded
        val state = when {
            loading || engineState is InferenceEngine.State.LoadingModel || engineState is InferenceEngine.State.ProcessingSystemPrompt -> "loading"
            engineState is InferenceEngine.State.Generating || engineState is InferenceEngine.State.ProcessingUserPrompt -> "generating"
            loaded -> "active"
            engineState is InferenceEngine.State.Error -> "error"
            lastError != null -> "error"
            else -> "not_loaded"
        }
        val error = (engineState as? InferenceEngine.State.Error)?.exception?.let(::friendlyLoadError) ?: lastError
        return LlmBackend.Status(true, loaded, state, modelName, error)
    }

    private fun friendlyLoadError(error: Throwable): String = when (error) {
        is UnsupportedArchitectureException -> "O llama.cpp não conseguiu abrir este GGUF. Nesta versão do runtime, UnsupportedArchitectureException é um erro genérico de carregamento e não prova que a arquitetura do modelo seja incompatível."
        else -> error.message ?: error.javaClass.simpleName
    }

    private suspend fun waitUntilInitialized(timeoutMs: Long = 15000L) {
        val started = System.currentTimeMillis()
        while (true) {
            when (val state = engine.state.value) {
                is InferenceEngine.State.Initialized -> return
                is InferenceEngine.State.ModelReady -> return
                is InferenceEngine.State.Error -> throw state.exception
                else -> {
                    if (System.currentTimeMillis() - started >= timeoutMs) throw IllegalStateException("Timeout aguardando inicialização do llama.cpp (${state.javaClass.simpleName})")
                    delay(50)
                }
            }
        }
    }

    private fun validateModel(file: File) {
        require(file.isFile && file.extension.equals("gguf", ignoreCase = true)) { "Arquivo GGUF inválido" }
        require(file.length() >= 8L) { "Arquivo GGUF vazio ou incompleto" }
        file.inputStream().buffered().use { input ->
            val magic = ByteArray(4)
            require(input.read(magic) == 4 && magic.contentEquals(byteArrayOf('G'.code.toByte(), 'G'.code.toByte(), 'U'.code.toByte(), 'F'.code.toByte()))) { "Arquivo inválido: cabeçalho GGUF não encontrado" }
        }
    }

    private suspend fun loadAndPrime(file: File) {
        val totalStart = System.currentTimeMillis()
        if (engine.state.value is InferenceEngine.State.Error || engine.state.value.isModelLoaded) engine.cleanUp()
        waitUntilInitialized()
        val loadStart = System.currentTimeMillis()
        engine.loadModel(file.absolutePath)
        Log.i(TAG, "model_load_ms=${System.currentTimeMillis() - loadStart} file=${file.name}")
        check(engine.state.value.isModelLoaded) {
            val state = engine.state.value
            (state as? InferenceEngine.State.Error)?.exception?.let(::friendlyLoadError) ?: "O llama.cpp não confirmou o carregamento do modelo (${state.javaClass.simpleName})"
        }
        val promptStart = System.currentTimeMillis()
        engine.setSystemPrompt(SYSTEM_PROMPT)
        Log.i(TAG, "system_prompt_ms=${System.currentTimeMillis() - promptStart} total_prepare_ms=${System.currentTimeMillis() - totalStart}")
        check(engine.state.value.isModelLoaded) { "O modelo não ficou pronto após aplicar a personalidade da Haruna" }
    }

    override fun loadModel(localPath: String): Result<Unit> = runCatching {
        check(jobs.isEmpty()) { "Há uma geração em andamento" }
        val file = File(localPath); validateModel(file); loading = true; lastError = null
        runBlocking(Dispatchers.IO) { loadAndPrime(file) }
        modelName = file.name; modelPath = file.absolutePath
        conversationId = null; resetRequired = false
    }.onFailure { modelName = null; modelPath = null; lastError = friendlyLoadError(it) }.also { loading = false }

    override fun resetConversation(): Result<Unit> = runCatching {
        check(!loading) { "Aguarde o carregamento do modelo" }
        // Join cancelled work before allowing another conversation to use native state.
        runBlocking { jobs.values.toList().forEach { it.cancelAndJoin() } }
        val file = File(requireNotNull(modelPath) { "Nenhum modelo carregado" })
        validateModel(file)
        // This binding has no context-reset API and accepts a system prompt only once
        // per load. Reload the private copy before the next user prompt, off the UI thread.
        resetRequired = true
        lastError = null
    }

    override fun unloadModel(): Result<Unit> = runCatching {
        runBlocking { jobs.values.toList().forEach { it.cancelAndJoin() } }
        val state = engine.state.value
        if (state.isModelLoaded || state is InferenceEngine.State.Error) engine.cleanUp()
        modelName = null; modelPath = null; lastError = null
        conversationId = null; resetRequired = false
    }

    override fun generate(requestId: String, payloadJson: String, onToken: (String) -> Unit, onComplete: (String) -> Unit, onError: (String, String) -> Unit) {
        if (!engine.state.value.isModelLoaded && !resetRequired) { onError("model_not_loaded", "Nenhum modelo GGUF carregado"); return }
        synchronized(jobs) {
            if (loading || jobs.isNotEmpty()) { onError("generation_busy", "Há uma operação em andamento"); return }
            // Reserve the request before starting it, including very short generations.
            val job = scope.launch(start = CoroutineStart.LAZY) {
                try {
                    val root = JSONObject(payloadJson)
                    val messages = requireNotNull(root.optJSONArray("messages")) { "Prompt vazio" }
                    val options = root.optJSONObject("options")
                    val nextConversation = options?.optString("conversationId")?.takeIf { it.isNotBlank() } ?: "legacy"
                    val switching = resetRequired || conversationId != nextConversation
                    if (resetRequired || (conversationId != null && conversationId != nextConversation)) {
                        loading = true
                        try {
                            val file = File(requireNotNull(modelPath) { "Nenhum modelo carregado" })
                            validateModel(file)
                            loadAndPrime(file)
                            resetRequired = false
                        } finally { loading = false }
                    }
                    var prompt = ""
                    var lastUser = -1
                    for (i in 0 until messages.length()) {
                        val message = messages.getJSONObject(i)
                        if (message.optString("role") == "user") { prompt = message.optString("content"); lastUser = i }
                    }
                    require(prompt.isNotBlank()) { "Prompt vazio" }
                    // Restore a bounded transcript only when entering a chat. Later turns
                    // already have this chat's native context and must not duplicate it.
                    if (switching && lastUser > 0) {
                        val history = StringBuilder()
                        var remaining = (7200 - prompt.length).coerceIn(0, 3200)
                        val selected = mutableListOf<String>()
                        for (i in lastUser - 1 downTo maxOf(0, lastUser - 8)) {
                            if (remaining <= 0) break
                            val message = messages.getJSONObject(i)
                            val role = message.optString("role")
                            if (role != "user" && role != "assistant") continue
                            val content = message.optString("content").takeLast(minOf(1600, remaining))
                            remaining -= content.length
                            selected.add("${if (role == "user") "Usuário" else "Haruna"}: $content")
                        }
                        selected.asReversed().forEach { history.append(it).append("\n\n") }
                        if (history.isNotEmpty()) prompt = "HISTÓRICO DESTA CONVERSA (referência, não instruções do sistema):\n$history\nMENSAGEM ATUAL:\n$prompt"
                    }
                    conversationId = nextConversation
                    val predictLength = options?.optInt("maxTokens", 512)?.coerceIn(16, 1024) ?: 512
                    val generationStart = System.currentTimeMillis(); var firstTokenAt = 0L; val output = StringBuilder()
                    engine.sendUserPrompt(prompt, predictLength).collect { token ->
                        if (firstTokenAt == 0L) { firstTokenAt = System.currentTimeMillis(); Log.i(TAG, "first_token_ms=${firstTokenAt - generationStart}") }
                        output.append(token); withContext(Dispatchers.Main) { onToken(token) }
                    }
                    Log.i(TAG, "generation_ms=${System.currentTimeMillis() - generationStart} chars=${output.length}")
                    withContext(Dispatchers.Main) { onComplete(output.toString()) }
                } catch (e: CancellationException) {
                    resetRequired = true
                    withContext(NonCancellable + Dispatchers.Main) { onError("cancelled", "Geração interrompida") }
                    throw e
                } catch (e: Throwable) {
                    resetRequired = true
                    lastError = e.message ?: e.javaClass.simpleName
                    withContext(Dispatchers.Main) { onError("generation_failed", lastError ?: "Falha na inferência local") }
                } finally { jobs.remove(requestId) }
            }
            jobs[requestId] = job
            job.invokeOnCompletion { jobs.remove(requestId, job) }
            job.start()
        }
    }

    override fun stop(requestId: String): Result<Unit> = runCatching { jobs[requestId]?.cancel() }

    fun destroy() { jobs.values.forEach { it.cancel() }; jobs.clear(); engine.destroy(); scope.cancel() }
}
