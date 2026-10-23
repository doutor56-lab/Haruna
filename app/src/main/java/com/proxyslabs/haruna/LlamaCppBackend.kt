package com.proxyslabs.haruna

import android.content.Context
import com.arm.aichat.AiChat
import com.arm.aichat.InferenceEngine
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

class LlamaCppBackend(context: Context) : LlmBackend {
    private val engine: InferenceEngine = AiChat.getInferenceEngine(context.applicationContext)
    private val cancelled = ConcurrentHashMap<String, AtomicBoolean>()
    @Volatile private var loadedModel: String? = null
    @Volatile private var lastError: String? = null

    override fun status() = LlmBackend.Status(true, loadedModel != null, if (loadedModel != null) "active" else "not_loaded", loadedModel?.let(::File)?.name, lastError)

    override fun loadModel(localPath: String): Result<Unit> = runCatching {
        require(File(localPath).isFile) { "Arquivo GGUF não encontrado." }
        runBlocking {
            engine.loadModel(localPath)
            engine.setSystemPrompt("Você é Haruna, uma assistente local, útil e direta. Responda em português quando o usuário falar português.")
        }
        loadedModel = localPath
        lastError = null
    }.onFailure { lastError = it.message ?: it.javaClass.simpleName }

    override fun unloadModel(): Result<Unit> = runCatching {
        engine.cleanUp(); loadedModel = null; cancelled.clear(); lastError = null
    }.onFailure { lastError = it.message ?: it.javaClass.simpleName }

    override fun generate(requestId: String, payloadJson: String, onToken: (String) -> Unit, onComplete: (String) -> Unit, onError: (String, String) -> Unit) {
        if (loadedModel == null) { onError("model_not_loaded", "Selecione e carregue um modelo GGUF primeiro."); return }
        val flag = AtomicBoolean(false); cancelled[requestId] = flag; val output = StringBuilder()
        try {
            val payload = JSONObject(payloadJson); val messages = payload.optJSONArray("messages"); var prompt = ""
            if (messages != null) for (i in messages.length() - 1 downTo 0) {
                val item = messages.optJSONObject(i) ?: continue
                if (item.optString("role") == "user") { prompt = item.optString("content"); break }
            }
            require(prompt.isNotBlank()) { "Mensagem do usuário vazia." }
            val maxTokens = payload.optJSONObject("options")?.optInt("maxTokens", 512) ?: 512
            runBlocking { engine.sendUserPrompt(prompt, maxTokens.coerceIn(32, 1024)).collect { token ->
                if (flag.get()) throw CancellationException("generation_stopped")
                output.append(token); onToken(token)
            } }
            if (flag.get()) onError("generation_stopped", "Geração interrompida.") else onComplete(output.toString())
        } catch (_: CancellationException) { onError("generation_stopped", "Geração interrompida.") }
        catch (t: Throwable) { lastError = t.message ?: t.javaClass.simpleName; onError("generation_failed", lastError!!) }
        finally { cancelled.remove(requestId) }
    }

    override fun stop(requestId: String): Result<Unit> = runCatching { cancelled[requestId]?.set(true) }
    fun destroy() = engine.destroy()
}
