package com.proxyslabs.haruna.speech

import android.net.Uri
import android.webkit.JavascriptInterface
import android.webkit.WebView
import com.proxyslabs.haruna.MainActivity
import org.json.JSONObject

class RecognitionBridge(private val activity: MainActivity, private val webView: WebView) : AutoCloseable {
    @Volatile private var closed = false
    @Volatile private var expected = ""
    private val manager = SpeechRuntime.stt(activity.applicationContext)
    private val unsubscribe = SpeechRuntime.subscribeStt { status ->
        if (!closed) webView.post { if (!closed) webView.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('haruna-stt-status',{detail:JSON.parse(${JSONObject.quote(status.toString())})}))", null) }
    }
    private fun command(action: () -> Unit): String = runCatching { action(); JSONObject().put("status", "ok").toString() }
        .getOrElse { JSONObject().put("status", "error").put("error", it.message ?: "Falha no reconhecimento local").toString() }
    @JavascriptInterface fun configure(json: String): String = command { manager.configure(json) }
    @JavascriptInterface fun getStatus(): String = manager.status().toString()
    @JavascriptInterface fun start(mode: String, id: String): String = command {
        require(!closed) { "Reconhecimento encerrado" }
        require(!manager.status().optBoolean("busy")) { "Aguarde a transcrição anterior finalizar" }
        require(mode == "dictation" || mode == "call") { "Modo de voz inválido" }
        require(id.isNotBlank() && id.length <= 150) { "Pedido de voz inválido" }
        require(manager.status().optBoolean("installed")) { "Instale o reconhecimento local primeiro" }
        expected = id
        activity.runOnUiThread { if (expected == id) activity.requestVoicePermission(mode, id) }
    }
    fun permitted(mode: String, id: String) {
        if (closed || expected != id) return
        if (mode == "call") {
            try { activity.ensureBackgroundVoiceCall() }
            catch (failure: Exception) { manager.fail("Não foi possível iniciar a chamada em segundo plano. Mantenha a Haruna aberta e tente novamente.", id); return }
        }
        activity.prepareToListen(keepVoiceWarm = manager.canShareVoiceCache()) {
            if (!closed && expected == id) runCatching { manager.start(mode, id) }.onFailure { manager.fail(it.message ?: "Não foi possível iniciar o microfone", id) }
        }
    }
    fun permissionFailed(message: String, id: String) { if (expected == id) { expected = ""; manager.fail(message, id) } }
    fun denied(id: String) { if (expected == id) { expected = ""; manager.fail("Permissão de microfone negada. Você pode habilitá-la nas configurações do Android.", id) } }
    @JavascriptInterface fun finish(): String = command { manager.finish() }
    @JavascriptInterface fun stop(): String = command { expected = ""; manager.stop() }
    @JavascriptInterface fun selectModel(id: String): String = command { manager.select(id) }
    @JavascriptInterface fun removeInstalledModel(id: String): String = command { manager.remove(id) }
    @JavascriptInterface fun downloadModel(id: String): String = command { manager.install(null, id) }
    @JavascriptInterface fun download(): String = command { manager.install(null) }
    @JavascriptInterface fun importModel(): String = command { activity.runOnUiThread { activity.pickRecognitionModel() } }
    @JavascriptInterface fun cancelInstallation(): String = command { manager.cancelInstallation() }
    @JavascriptInterface fun removeModel(): String = command { manager.remove() }
    fun importModel(uri: Uri) { runCatching { manager.install(uri) }.onFailure { manager.fail(it.message ?: "Falha na importação") } }
    fun selectionFailed(message: String) { manager.fail(message) }
    override fun close() { closed = true; expected = ""; unsubscribe(); manager.stop() }
}
