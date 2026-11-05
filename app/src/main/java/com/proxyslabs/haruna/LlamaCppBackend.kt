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
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.CopyOnWriteArraySet
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

class LlamaCppBackend(context: Context) : LlmBackend {
    companion object {
        private const val TAG = "HarunaLLM"
        private val serials = AtomicLong()
    }

    private val appContext = context.applicationContext
    private val diagnosticPrefs = appContext.getSharedPreferences("haruna_runtime_diagnostic", Context.MODE_PRIVATE)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val engine: InferenceEngine = AiChat.getInferenceEngine(context.applicationContext)
    private class Request(val serial: Long) {
        lateinit var job: Job
        val cancelled = AtomicBoolean(false)
        val finishing = AtomicBoolean(false)
        val started = AtomicBoolean(false)
    }
    private val jobs = ConcurrentHashMap<String, Request>()
    private val lifecycle = com.proxyslabs.haruna.image.ImageLease.lock
    private val statusListeners = CopyOnWriteArraySet<() -> Unit>()
    @Volatile private var destroyed = false
    @Volatile private var loading = false
    @Volatile private var modelName: String? = null
    @Volatile private var modelPath: String? = null
    @Volatile private var lastError: String? = null
    @Volatile private var resetRequired = false
    @Volatile private var conversationId: String? = null
    @Volatile private var conversationRevision = 0L

    override fun contextMetrics(): Map<String, Int> = runCatching {
        val values = engine.chatMetrics()
        val keys = listOf("inputTokens", "generatedTokens", "historyMessages", "ggufTemplate", "contextCapacity")
        keys.mapIndexedNotNull { i, key -> values.getOrNull(i)?.takeIf { it >= 0 }?.let { key to it } }.toMap()
    }.getOrDefault(emptyMap())

    override fun runtimeMetrics(): String = runCatching {
        JSONObject(engine.runtimeMetrics()).put("debugControls", JSONObject()
            .put("cpuConservativePending", diagnosticPrefs.getBoolean("cpuConservative", false))
            .put("cpuConservativeAvailable", File(appContext.applicationInfo.nativeLibraryDir, "libggml-cpu-android_armv8.0_1.so").isFile))
            .put("owner", JSONObject()
            .put("scope", "process").put("destroyed", destroyed).put("maintenance", loading)
            .put("requestsActive", jobs.size)).toString()
    }.getOrDefault("{}")
    /** Temporary DBG-only controls. No live registry/model/context swap; no normal setting. */
    fun configureDiagnostic(fixedSeed: Boolean, flashOff: Boolean, conservativeCpu: Boolean): Result<Unit> = runCatching {
        lifecycle.withLock {
            check(!destroyed) { "Runtime encerrado" }
            synchronized(jobs) {
                check(!loading && jobs.isEmpty()) { "Aguarde a operação atual terminar" }
                loading = true
            }
            try {
                if (conservativeCpu) check(File(appContext.applicationInfo.nativeLibraryDir,
                    "libggml-cpu-android_armv8.0_1.so").isFile) { "Variante conservadora não instalada nesta ABI" }
                runBlocking(Dispatchers.IO) { engine.configureDiagnosticOptions(fixedSeed, flashOff) }
                check(diagnosticPrefs.edit().putBoolean("cpuConservative", conservativeCpu).commit()) {
                    "Não foi possível salvar a seleção de CPU para o próximo processo"
                }
            } finally { loading = false; notifyStatus() }
        }
    }

    override fun installedModelPath(): String? = modelPath.takeIf { !loading && engine.state.value.isModelLoaded }
    fun incrementalConversation(): Boolean = runCatching {
        val runtime = JSONObject(engine.runtimeMetrics()).optJSONObject("runtime")
        status().modelLoaded && runtime?.optString("architecture") == "qwen35" && runtime.optBoolean("modelHybrid")
    }.getOrDefault(false)
    override fun subscribeStatus(listener: () -> Unit): () -> Unit {
        statusListeners.add(listener)
        return { statusListeners.remove(listener) }
    }
    private fun notifyStatus() { statusListeners.forEach { runCatching { it() } } }

    private fun cancel(request: Request, reason: Int) {
        request.cancelled.set(true)
        // Signal directly, not through the dispatcher currently occupied by prefill/decode.
        runCatching { engine.cancelGeneration(request.serial, reason) }
        request.job.cancel()
    }

    private fun maintenance(reason: Int, action: () -> Unit) {
        val active = synchronized(jobs) { loading = true; jobs.values.toList() }
        try {
            active.forEach { cancel(it, reason) }
            runBlocking { active.forEach { it.job.cancelAndJoin() } }
            action()
        } finally { loading = false; notifyStatus() }
    }

    override fun status(): LlmBackend.Status {
        val engineState = engine.state.value
        val loaded = engineState.isModelLoaded
        val state = when {
            loading || engineState is InferenceEngine.State.LoadingModel || engineState is InferenceEngine.State.ProcessingSystemPrompt -> "loading"
            jobs.values.any { !it.cancelled.get() && !it.finishing.get() } || engineState is InferenceEngine.State.Generating || engineState is InferenceEngine.State.ProcessingUserPrompt -> "generating"
            loaded -> "active"
            engineState is InferenceEngine.State.Error -> "error"
            lastError != null -> "error"
            else -> "not_loaded"
        }
        val error = (engineState as? InferenceEngine.State.Error)?.exception?.let(::friendlyLoadError) ?: lastError
        return LlmBackend.Status(!destroyed, loaded, state, modelName, error)
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
        lifecycle.withLock {
            check(!destroyed) { "Runtime encerrado" }
            check(!com.proxyslabs.haruna.image.ImageLease.active) { "Descarregue o modelo de imagens antes de carregar o GGUF" }
            val file = File(localPath); validateModel(file)
            if (modelPath == file.absolutePath && engine.state.value.isModelLoaded) return@withLock
            maintenance(7) {
                lastError = null
                runBlocking(Dispatchers.IO) { loadAndPrime(file) }
                modelName = file.name; modelPath = file.absolutePath
                conversationId = null; resetRequired = false
            }
        }
    }.onFailure {
        if (!engine.state.value.isModelLoaded) { modelName = null; modelPath = null }
        lastError = friendlyLoadError(it)
        notifyStatus()
    }

    /** Explicit DEBUG action only. One-shot offload request; subsequent normal loads remain CPU. */
    fun labReloadOffload(layers: Int): Result<Unit> = runCatching {
        check(!com.proxyslabs.haruna.image.ImageLease.active) { "Descarregue o modelo de imagens" }
        check(BuildConfig.DEBUG && layers in setOf(0,8,99)) { "Offload experimental somente DEBUG" }
        lifecycle.withLock {
            check(!destroyed) { "Runtime encerrado" }
            check(!com.proxyslabs.haruna.image.ImageLease.active) { "Descarregue o modelo de imagens" }
            val file=File(requireNotNull(modelPath) { "Carregue primeiro o modelo que será testado" });validateModel(file)
            maintenance(7) {
                runBlocking(Dispatchers.IO) {
                    engine.cleanUp();waitUntilInitialized();engine.configureOffload(layers);loadAndPrime(file)
                }
                modelName=file.name;modelPath=file.absolutePath;lastError=null;conversationId=null;resetRequired=false
            }
        }
    }.onFailure { lastError=friendlyLoadError(it);notifyStatus() }

    override fun resetConversation(): Result<Unit> = runCatching {
        lifecycle.withLock {
            check(!destroyed) { "Runtime encerrado" }
            maintenance(5) {
                validateModel(File(requireNotNull(modelPath) { "Nenhum modelo carregado" }))
                resetRequired = true; lastError = null
                conversationRevision++
                runBlocking(Dispatchers.IO) { engine.invalidatePrefixCache() }
            }
        }
    }

    override fun unloadModel(): Result<Unit> = runCatching {
        lifecycle.withLock {
            check(!destroyed) { "Runtime encerrado" }
            maintenance(7) {
                val state = engine.state.value
                if (state.isModelLoaded || state is InferenceEngine.State.Error || state is InferenceEngine.State.Initialized) engine.cleanUp()
                modelName = null; modelPath = null; lastError = null
                conversationId = null; resetRequired = false
            }
        }
    }

    override fun generate(requestId: String, payloadJson: String, onToken: (String) -> Unit, onComplete: () -> Unit, onError: (String, String) -> Unit) {
        if (!engine.state.value.isModelLoaded && !resetRequired) { onError("model_not_loaded", "Nenhum modelo GGUF carregado"); return }
        synchronized(jobs) {
            if (com.proxyslabs.haruna.image.ImageLease.active || destroyed || loading || jobs.size >= 4 || jobs.values.any { !it.cancelled.get() && !it.finishing.get() }) {
                onError("generation_busy", "Há uma operação em andamento"); return
            }
            val predecessors = jobs.values.toList()
            // Reserve the request before starting it, including very short generations.
            val request = Request(serials.incrementAndGet())
            val job = scope.launch(start = CoroutineStart.LAZY) {
                request.started.set(true)
                try {
                    // A new request may arrive just after Parar/terminal callback. Join the old
                    // owner before reserving another native ticket; never run two contexts.
                    predecessors.forEach { it.job.join() }
                    val root = JSONObject(payloadJson)
                    val messages = requireNotNull(root.optJSONArray("messages")) { "Prompt vazio" }
                    val options = root.optJSONObject("options")
                    val nextConversation = options?.optString("conversationId")?.takeIf { it.isNotBlank() } ?: ""
                    if (!engine.state.value.isModelLoaded || engine.state.value is InferenceEngine.State.Error) {
                        loading = true
                        try {
                            val file = File(requireNotNull(modelPath) { "Nenhum modelo carregado" })
                            validateModel(file); loadAndPrime(file)
                        } finally { loading = false }
                    }
                    val profile = options?.optString("essentialContext", "") ?: ""
                    require(profile.length <= 900) { "Perfil de contexto muito longo" }
                    val stableSystem = HarunaIdentity.systemPrompt(requireNotNull(modelName))
                    val originalSystem = stableSystem +
                        if (profile.isBlank()) "" else "\n" + profile
                    val labVariant = options?.optString("labSystemPromptVariant", "current") ?: "current"
                    val labAuthorized = BuildConfig.DEBUG && requestId.startsWith("lab-") &&
                        options?.optString("labConfig", "")?.takeIf { it.isNotEmpty() }?.let {
                            JSONObject(it).optString("systemPromptVariant", "current") == labVariant
                        } == true
                    val system = com.proxyslabs.haruna.diagnostics.LabSystemPrompt.apply(originalSystem, labVariant, labAuthorized)
                    val roles = mutableListOf("system")
                    val contents = mutableListOf(system)
                    require(messages.length() in 1..(if(incrementalConversation()) 127 else 17)) { "Número de mensagens inválido" }
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
                    val generationStart = System.currentTimeMillis(); var firstTokenAt = 0L; var outputChars = 0L
                    engine.sendChatMessages(roles.toTypedArray(), contents.toTypedArray(), predictLength, options?.optBoolean("enableThinking", true) ?: true, request.serial, nextConversation, conversationRevision, if (BuildConfig.DEBUG) options?.optString("labConfig", "")?.takeIf { it.isNotEmpty() } ?: if (options?.optBoolean("labInspector", false) == true) "{\"inspectOnly\":true}" else "" else "", stableSystem).collect { token ->
                        if (firstTokenAt == 0L) { firstTokenAt = System.currentTimeMillis(); Log.i(TAG, "first_token_ms=${firstTokenAt - generationStart}") }
                        outputChars += token.length
                        // The bridge owns a bounded ordered buffer; no Main-thread hop per delta.
                        if (!request.cancelled.get() && jobs[requestId] === request) onToken(token)
                    }
                    Log.i(TAG, "generation_ms=${System.currentTimeMillis() - generationStart} chars=$outputChars")
                    request.finishing.set(true)
                    withContext(Dispatchers.Main) {
                        if (!request.cancelled.get() && jobs[requestId] === request) onComplete()
                    }
                } catch (e: CancellationException) {
                    request.finishing.set(true)
                    resetRequired = true
                    withContext(NonCancellable + Dispatchers.Main) { onError("cancelled", "Geração interrompida") }
                    throw e
                } catch (e: Throwable) {
                    request.finishing.set(true)
                    resetRequired = true
                    lastError = e.message ?: e.javaClass.simpleName
                    withContext(Dispatchers.Main) { onError("generation_failed", lastError ?: "Falha na inferência local") }
                } finally { jobs.remove(requestId, request); notifyStatus() }
            }
            request.job = job
            jobs[requestId] = request
            job.invokeOnCompletion { cause ->
                jobs.remove(requestId, request)
                if (cause is CancellationException && !request.started.get()) {
                    scope.launch(Dispatchers.Main) { onError("cancelled", "Geração interrompida antes da entrada no runtime") }
                }
            }
            job.start()
        }
    }

    override fun stop(requestId: String): Result<Unit> = runCatching { jobs[requestId]?.let { cancel(it, 5) } }

    fun detachRequest(requestId: String) { jobs[requestId]?.let { cancel(it, 9) } }

    fun destroy() = lifecycle.withLock {
        if (!destroyed) {
            maintenance(8) { engine.destroy(); destroyed = true; scope.cancel(); modelPath = null; modelName = null }
        }
    }
}




