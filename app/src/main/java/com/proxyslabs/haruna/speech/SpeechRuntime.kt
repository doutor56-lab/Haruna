package com.proxyslabs.haruna.speech

import android.content.Context
import org.json.JSONObject
import java.util.concurrent.CopyOnWriteArraySet

/** Application owners: leaving/recreating a screen must not cancel an installation. */
object SpeechRuntime {
    private var recognition: SttManager? = null
    private var speech: TtsManager? = null
    private val sttListeners = CopyOnWriteArraySet<(JSONObject) -> Unit>()
    private val ttsListeners = CopyOnWriteArraySet<(JSONObject) -> Unit>()
    @Synchronized fun stt(context: Context): SttManager = recognition ?: context.applicationContext.let { app ->
        SttManager(app, { active -> if (active) SpeechDownloadService.begin(app, "stt") else SpeechDownloadService.finish("stt") }) { value ->
            SpeechDownloadService.progress("stt", value)
            sttListeners.forEach { runCatching { it(value) } }
        }.also { recognition = it }
    }
    @Synchronized fun tts(context: Context): TtsManager = speech ?: context.applicationContext.let { app ->
        TtsManager(app, { active -> if (active) SpeechDownloadService.begin(app, "tts") else SpeechDownloadService.finish("tts") }) { value ->
            SpeechDownloadService.progress("tts", value)
            ttsListeners.forEach { runCatching { it(value) } }
        }.also { speech = it }
    }
    fun subscribeStt(listener: (JSONObject) -> Unit): () -> Unit { sttListeners.add(listener); return { sttListeners.remove(listener) } }
    fun subscribeTts(listener: (JSONObject) -> Unit): () -> Unit { ttsListeners.add(listener); return { ttsListeners.remove(listener) } }
    @Synchronized fun cancelDownloads() { recognition?.cancelInstallation(); speech?.cancelInstallation() }
}
