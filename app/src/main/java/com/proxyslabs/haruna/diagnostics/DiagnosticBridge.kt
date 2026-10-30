package com.proxyslabs.haruna.diagnostics

import android.webkit.JavascriptInterface
import android.webkit.WebView
import com.proxyslabs.haruna.LlmBackend
import com.proxyslabs.haruna.LlamaCppBackend
import com.proxyslabs.haruna.MainActivity
import org.json.JSONObject
import java.io.File
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/** Read-only snapshots plus an explicitly requested, isolated, idle-only experimental A/B API. */
class DiagnosticBridge(
    activity: MainActivity, private val webView: WebView, private val backend: LlmBackend,
    private val modelFile: () -> File?, private val sttStatus: () -> String, private val ttsStatus: () -> String
) : AutoCloseable {
    private val app = activity.applicationContext
    private val lab = InferenceLab(activity.applicationContext, backend) { value -> webView.post { if (!closed.get()) webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('haruna-lab-result',{detail:JSON.parse(${JSONObject.quote(value.toString())})}))", null) } }
    @JavascriptInterface fun labAvailable(): Boolean = com.proxyslabs.haruna.BuildConfig.DEBUG
    @JavascriptInterface fun labRun(config: String): String = lab.run(config)
    @JavascriptInterface fun labCancel() { lab.cancel() }
    private val metrics = AndroidMetricsCollector(activity.applicationContext)
    private val pending = AtomicBoolean(false)
    private val closed = AtomicBoolean(false)
    private val worker = ThreadPoolExecutor(0, 1, 30, TimeUnit.SECONDS, ArrayBlockingQueue<Runnable>(1))
    private var lastReply = -5_000L
    private var cached: JSONObject? = null
    init { DiagnosticSession.clock() }

    // Two acknowledgements per request at most (first non-placeholder DOM text / final DOM).
    // Scalars only. Receipt is an upper bound on the DOM timestamp, never proof of pixels.
    @JavascriptInterface fun observePresentation(id: String, payload: String) {
        if (closed.get() || id.length > 160 || payload.length > 1200) return
        runCatching { DiagnosticSession.presentation(id, JSONObject(payload)) }
    }

    // A/B settings only. No reload/unload, prompt, model download or app termination here.
    @JavascriptInterface fun configureExperiment(ticket: Int, options: String) {
        if (closed.get() || options.length > 180) return
        runCatching { worker.execute {
            if (closed.get()) return@execute
            val result = runCatching {
                val value = JSONObject(options)
                require(value.keys().asSequence().all { it in setOf("fixedSeed", "flashOff", "conservativeCpu") })
                val runtime = backend as? LlamaCppBackend ?: error("Runtime indisponível")
                runtime.configureDiagnostic(value.getBoolean("fixedSeed"), value.getBoolean("flashOff"),
                    value.getBoolean("conservativeCpu")).getOrThrow()
            }
            val reply = JSONObject().put("ticket", ticket).put("ok", result.isSuccess)
                .put("message", if (result.isSuccess) "Aplicado: seed na próxima geração; FA após descarregar/carregar; CPU após forçar parada e reabrir. Nenhuma recarga automática."
                    else "Não aplicado integralmente. Aguarde o runtime ocioso, confira a ABI e tente novamente.")
            webView.post { if (!closed.get()) webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('haruna-dbg-experiment',{detail:JSON.parse(${JSONObject.quote(reply.toString())})}))", null) }
        } }
    }

    @JavascriptInterface fun requestSnapshot(ticket: Int) {
        if (closed.get() || !pending.compareAndSet(false, true)) return
        runCatching { worker.execute {
            try {
                if (closed.get()) return@execute
                val now = android.os.SystemClock.elapsedRealtime()
                if (cached == null || now - lastReply >= 5_000) {
                    val snapshot = metrics.snapshot().put("session", DiagnosticSession.snapshot())
                    runCatching {
                        val status = backend.status()
                        val file = if (status.modelLoaded) modelFile() else null
                        snapshot.put("llm", JSONObject().put("loaded", status.modelLoaded)
                            .put("state", status.state).put("name", status.modelName?.let { File(it).name.take(180) } ?: JSONObject.NULL)
                            .put("fileBytes", file?.takeIf { it.isFile }?.length() ?: JSONObject.NULL)
                            .put("backend", backend.javaClass.simpleName)
                            .put("context", JSONObject(backend.contextMetrics()))
                            .put("observation", JSONObject(backend.runtimeMetrics())))
                    }
                    fun voice(source: () -> String): JSONObject = runCatching {
                        val value = JSONObject(source())
                        val result = JSONObject().put("state", value.optString("state", "unknown"))
                            .put("installed", value.optBoolean("installed"))
                            .put("fileBytes", if (value.has("bytes")) value.optLong("bytes") else JSONObject.NULL)
                        value.optJSONObject("diagnostics")?.let { source ->
                            val recognition = JSONObject()
                            for (key in listOf("sampleRate", "audioMs", "decodeMs", "rtf", "attempts", "successes")) {
                                val number = source.optDouble(key, Double.NaN)
                                if (number.isFinite() && number >= 0) recognition.put(key, number)
                            }
                            for (key in listOf("engine", "model", "language")) if (source.has(key)) recognition.put(key, source.optString(key).take(80))
                            val outcome = source.optString("outcome")
                            if (outcome in setOf("success", "no_speech", "invalid", "error", "cancelled")) recognition.put("outcome", outcome)
                            result.put("recognition", recognition)
                        }
                        result
                    }.getOrElse { JSONObject().put("state", "unknown") }
                    snapshot.put("stt", voice(sttStatus)).put("tts", voice(ttsStatus))
                    cached = snapshot; lastReply = now
                }
                val result = JSONObject(cached.toString()).put("ticket", ticket).put("snapshotAgeMs", now - lastReply)
                webView.post {
                    if (!closed.get()) webView.evaluateJavascript(
                        "window.dispatchEvent(new CustomEvent('haruna-dbg-snapshot',{detail:JSON.parse(${JSONObject.quote(result.toString())})}))", null)
                }
            } catch (_: Exception) {
                // Optional diagnostics must never interrupt a subsystem or expose exception contents.
                webView.post { if (!closed.get()) webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('haruna-dbg-snapshot',{detail:{ticket:$ticket,unavailable:true}}))", null) }
            } finally { pending.set(false) }
        } }.onFailure { pending.set(false) }
    }

    override fun close() { lab.cancel(); closed.set(true); worker.shutdownNow() }
}



