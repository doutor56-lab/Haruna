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

    override fun contextMetrics(): Map<String, Int> = runCatching {
        val values = engine.chatMetrics()
        val keys = listOf("inputTokens", "generatedTokens", "historyMessages", "ggufTemplate", "contextCapacity")
        keys.mapIndexedNotNull { i, key -> values.getOrNull(i)?.takeIf { it >= 0 }?.let { key to it } }.toMap()
    }.getOrDefault(emptyMap())

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
        // Identity and current profile are the system role of the complete chat request.
        // Do not prime a competing legacy template or call setSystemPrompt after a turn.
        Log.i(TAG, "total_prepare_ms=${System.currentTimeMillis() - totalStart}")
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
        // The next structured request clears KV/sampler state without reloading weights.
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
                    if (!engine.state.value.isModelLoaded || engine.state.value is InferenceEngine.State.Error) {
                        loading = true
                        try {
                            val file = File(requireNotNull(modelPath) { "Nenhum modelo carregado" })
                            validateModel(file); loadAndPrime(file)
                        } finally { loading = false }
                    }
                    val profile = options?.optString("essentialContext", "") ?: ""
                    require(profile.length <= 900) { "Perfil de contexto muito longo" }
                    val system = HarunaIdentity.systemPrompt(requireNotNull(modelName)) +
                        if (profile.isBlank()) "" else "\n" + profile
                    val roles = mutableListOf("system")
                    val contents = mutableListOf(system)
                    require(messages.length() in 1..17) { "Número de mensagens inválido" }
                    for (i in 0 until messages.length()) {
                        val message = messages.getJSONObject(i)
                        val role = message.optString("role")
                        require(role == "user" || role == "assistant") { "Papel de mensagem inválido" }
                        roles.add(role); contents.add(message.optString("content"))
                    }
                    require(roles.last() == "user" && contents.last().isNotBlank()) { "Mensagem atual vazia" }
                    conversationId = nextConversation
                    resetRequired = false
                    val predictLength = options?.optInt("maxTokens", 512)?.coerceIn(16, 1024) ?: 512
                    val generationStart = System.currentTimeMillis(); var firstTokenAt = 0L; val output = StringBuilder()
                    engine.sendChatMessages(roles.toTypedArray(), contents.toTypedArray(), predictLength, options?.optBoolean("enableThinking", true) ?: true).collect { token ->
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


