package com.proxyslabs.haruna.speech

import android.net.Uri
import android.webkit.JavascriptInterface
import android.webkit.WebView
import com.proxyslabs.haruna.MainActivity
import org.json.JSONObject

/** Separate bridge: no dependency on the LLM or knowledge store. */
class SpeechBridge(private val activity: MainActivity, private val webView: WebView) : AutoCloseable {
    @Volatile private var closed = false
    private val manager = TtsManager(activity.applicationContext) { status ->
        if (!closed) webView.post { if (!closed) webView.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('haruna-tts-status',{detail:JSON.parse(${JSONObject.quote(status.toString())})}))", null) }
    }
    private fun command(action: () -> Unit): String = runCatching { action(); JSONObject().put("status", "ok").toString() }
        .getOrElse { JSONObject().put("status", "error").put("error", it.message ?: "Falha na voz local").toString() }
    @JavascriptInterface fun getStatus(): String = manager.status().toString()
    @JavascriptInterface fun configure(json: String): String = command { manager.configure(json) }
    @JavascriptInterface fun speak(text: String, messageId: String): String = command { activity.stopListening(); manager.speak(text, messageId) }
    @JavascriptInterface fun beginStream(messageId: String): String = command { activity.stopListening(); manager.beginStream(messageId) }
    @JavascriptInterface fun appendStream(messageId: String, text: String): String = command { manager.appendStream(messageId, text) }
    @JavascriptInterface fun endStream(messageId: String): String = command { manager.endStream(messageId) }
    @JavascriptInterface fun pause(): String = command { manager.pauseAudio() }
    @JavascriptInterface fun resume(): String = command { manager.resumeAudio() }
    @JavascriptInterface fun stop(): String = command { manager.stop() }
    @JavascriptInterface fun download(): String = command { manager.install(null) }
    @JavascriptInterface fun importModel(): String = command { activity.runOnUiThread { activity.pickVoiceModel() } }
    @JavascriptInterface fun cancelInstallation(): String = command { manager.cancelInstallation() }
    @JavascriptInterface fun removeModel(): String = command { manager.remove() }
    fun importModel(uri: Uri) { runCatching { manager.install(uri) }.onFailure { manager.reportError(it.message ?: "Falha na importação") } }
    fun suspendForBackground() { manager.stop("app_background") }
    fun prepareForListening(ready: () -> Unit) { manager.prepareForListening(ready) }
    fun selectionFailed(message: String) { manager.reportError(message) }
    fun selectionCancelled() { stop() }
    override fun close() { closed = true; manager.close() }
}
