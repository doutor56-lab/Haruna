package com.proxyslabs.haruna

import android.content.Context
import com.arm.aichat.AiChat
import com.arm.aichat.InferenceEngine
import com.arm.aichat.isModelLoaded
import kotlinx.coroutines.CancellationException
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
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val engine: InferenceEngine = AiChat.getInferenceEngine(context.applicationContext)
    private val jobs = ConcurrentHashMap<String, Job>()

    @Volatile private var loading = false
    @Volatile private var modelName: String? = null
    @Volatile private var lastError: String? = null

    override fun status(): LlmBackend.Status {
        val engineState = engine.state.value
        val loaded = engineState.isModelLoaded
        val state = when {
            loading || engineState is InferenceEngine.State.LoadingModel -> "loading"
            engineState is InferenceEngine.State.Generating || engineState is InferenceEngine.State.ProcessingUserPrompt -> "generating"
            loaded -> "active"
            engineState is InferenceEngine.State.Error -> "error"
            lastError != null -> "error"
            else -> "not_loaded"
        }
        val error = (engineState as? InferenceEngine.State.Error)?.exception?.message ?: lastError
        return LlmBackend.Status(true, loaded, state, modelName, error)
    }

    private suspend fun waitUntilInitialized(timeoutMs: Long = 15000L) {
        val started = System.currentTimeMillis()
        while (true) {
            when (val state = engine.state.value) {
                is InferenceEngine.State.Initialized -> return
                is InferenceEngine.State.ModelReady -> return
                is InferenceEngine.State.Error -> throw state.exception
                else -> {
                    if (System.currentTimeMillis() - started >= timeoutMs) {
                        throw IllegalStateException("Timeout aguardando inicialização do llama.cpp (${state.javaClass.simpleName})")
                    }
                    delay(50)
                }
            }
        }
    }

    override fun loadModel(localPath: String): Result<Unit> = runCatching {
        check(jobs.isEmpty()) { "Há uma geração em andamento" }
        val file = File(localPath)
        require(file.isFile && file.extension.equals("gguf", ignoreCase = true)) { "Arquivo GGUF inválido" }
        require(file.length() > 0L) { "Arquivo GGUF vazio" }

        loading = true
        lastError = null

        runBlocking(Dispatchers.IO) {
            // InferenceEngineImpl initializes its JNI/native backend asynchronously.
            // Calling loadModel immediately can hit State.Initializing or a previous Error.
            if (engine.state.value is InferenceEngine.State.Error || engine.state.value.isModelLoaded) {
                engine.cleanUp()
            }
            waitUntilInitialized()
            engine.loadModel(file.absolutePath)
        }

        check(engine.state.value.isModelLoaded) {
            val state = engine.state.value
            val detail = (state as? InferenceEngine.State.Error)?.exception?.message
            detail ?: "O llama.cpp não confirmou o carregamento do modelo (${state.javaClass.simpleName})"
        }
        modelName = file.name
    }.onFailure {
        modelName = null
        lastError = buildString {
            append(it.message ?: it.javaClass.simpleName)
            val cause = it.cause
            if (cause != null && cause.message != null && cause.message != it.message) {
                append(" | Causa: ").append(cause.message)
            }
        }
    }.also {
        loading = false
    }

    override fun unloadModel(): Result<Unit> = runCatching {
        jobs.values.forEach { it.cancel() }
        jobs.clear()
        val state = engine.state.value
        if (state.isModelLoaded || state is InferenceEngine.State.Error) engine.cleanUp()
        modelName = null
        lastError = null
    }

    override fun generate(
        requestId: String,
        payloadJson: String,
        onToken: (String) -> Unit,
        onComplete: (String) -> Unit,
        onError: (String, String) -> Unit
    ) {
        if (!engine.state.value.isModelLoaded) {
            onError("model_not_loaded", "Nenhum modelo GGUF carregado")
            return
        }
        if (jobs.containsKey(requestId)) {
            onError("duplicate_request", "Esta geração já está em andamento")
            return
        }

        val job = scope.launch {
            try {
                val root = JSONObject(payloadJson)
                val messages = root.optJSONArray("messages")
                var prompt = ""
                if (messages != null) {
                    for (i in 0 until messages.length()) {
                        val message = messages.getJSONObject(i)
                        if (message.optString("role") == "user") prompt = message.optString("content")
                    }
                }
                require(prompt.isNotBlank()) { "Prompt vazio" }

                val predictLength = root.optJSONObject("options")
                    ?.optInt("maxTokens", InferenceEngine.DEFAULT_PREDICT_LENGTH)
                    ?.coerceIn(16, 2048)
                    ?: InferenceEngine.DEFAULT_PREDICT_LENGTH

                val output = StringBuilder()
                engine.sendUserPrompt(prompt, predictLength).collect { token ->
                    output.append(token)
                    withContext(Dispatchers.Main) { onToken(token) }
                }
                withContext(Dispatchers.Main) { onComplete(output.toString()) }
            } catch (e: CancellationException) {
                withContext(Dispatchers.Main) { onError("cancelled", "Geração interrompida") }
                throw e
            } catch (e: Throwable) {
                lastError = e.message ?: e.javaClass.simpleName
                withContext(Dispatchers.Main) {
                    onError("generation_failed", lastError ?: "Falha na inferência local")
                }
            } finally {
                jobs.remove(requestId)
            }
        }
        jobs[requestId] = job
    }

    override fun stop(requestId: String): Result<Unit> = runCatching {
        jobs.remove(requestId)?.cancel()
    }

    fun destroy() {
        jobs.values.forEach { it.cancel() }
        jobs.clear()
        engine.destroy()
        scope.cancel()
    }
}
