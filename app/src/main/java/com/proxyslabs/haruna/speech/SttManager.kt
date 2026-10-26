package com.proxyslabs.haruna.speech

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/** Serial model work; each capture/transcription is explicitly owned by a request ID. */
class SttManager(private val context: Context, private val emit: (JSONObject) -> Unit) : AutoCloseable {
    private val models = SttModelManager(context)
    private val engine: SttEngine = WhisperSttEngine()
    private val recorder = SttAudioRecorder()
    private val worker = Executors.newSingleThreadExecutor()
    private val generation = AtomicLong()
    private val installing = AtomicBoolean(false)
    private val closed = AtomicBoolean(false)
    private val active = AtomicBoolean(false)
    @Volatile private var state = "idle"
    @Volatile private var error: String? = null
    @Volatile private var requestId = ""
    @Volatile private var mode = "dictation"
    @Volatile private var copied = 0L
    @Volatile private var total: Long? = null
    init { worker.execute { models.cleanTemporary() } }
    fun status(): JSONObject = JSONObject().put("state", state).put("error", error)
        .put("installed", models.installed()).put("bytes", models.bytes()).put("busy", active.get()).put("requestId", requestId).put("mode", mode)
        .put("copiedBytes", copied).put("totalBytes", total).put("archiveBytes", SttModelManager.ARCHIVE_BYTES)
    private fun publish(next: String, failure: String? = null, text: String? = null) {
        state = next; error = failure
        val value = status(); if (text != null) value.put("text", text)
        emit(value)
    }
    fun fail(message: String, id: String = requestId) { requestId = id; publish("error", message) }
    fun start(captureMode: String, id: String) {
        require(!closed.get() && !installing.get()) { "Aguarde a instalação do reconhecimento de voz" }
        require(context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) { "Permita o microfone para usar a voz" }
        require(captureMode == "dictation" || captureMode == "call") { "Modo de captura inválido" }
        require(id.isNotBlank() && id.length <= 150) { "Pedido de captura inválido" }
        require(models.installed()) { "Reconhecimento de voz não instalado" }
        require(active.compareAndSet(false, true)) { "Aguarde a captura ou transcrição atual" }
        val ticket = generation.incrementAndGet()
        requestId = id; mode = captureMode; recorder.prepare(); publish("preparing")
        worker.execute {
            fun alive() = !closed.get() && generation.get() == ticket
            var samples = FloatArray(0)
            try {
                if (!alive()) return@execute
                samples = recorder.capture(::alive, { if (alive()) publish("listening") }) { level -> if (alive()) emit(status().put("level", level)) }
                if (!alive()) return@execute
                if (samples.isEmpty()) { publish("no_speech"); return@execute }
                require(models.installed()) { "Reconhecimento de voz não instalado" }
                publish("transcribing")
                val text = engine.transcribe(models.directory, samples)
                // The engine frees its sessions before returning text to the chat.
                if (alive()) publish(if (text.isBlank()) "no_speech" else "result", text = text)
            } catch (failure: Throwable) { if (alive()) publish("error", failure.message ?: "Falha no reconhecimento local") }
            finally { samples.fill(0f); active.set(false); if (!closed.get()) emit(status()) }
        }
    }
    fun finish() { if (state == "listening") recorder.finish() }
    fun stop() { generation.incrementAndGet(); recorder.cancel(); if (!installing.get()) publish("idle") }
    fun install(uri: Uri?) {
        require(!active.get()) { "Encerre a captura e aguarde a transcrição antes de instalar" }
        require(installing.compareAndSet(false, true)) { "Já existe uma instalação em andamento" }
        models.cancelled.set(false); copied = 0; total = if (uri == null) SttModelManager.ARCHIVE_BYTES else null
        publish(if (uri == null) "downloading" else "importing")
        worker.execute {
            try {
                if (!models.installed()) models.install(uri) { phase, count, length -> copied = count; total = length; publish(phase) }
                publish("installed")
            } catch (failure: Throwable) { publish(if (models.cancelled.get()) "cancelled" else "error", if (models.cancelled.get()) null else failure.message ?: "Falha ao instalar reconhecimento") }
            finally { installing.set(false); copied = 0; total = null; emit(status()) }
        }
    }
    fun cancelInstallation() { if (installing.get()) { models.cancel(); publish("cancelling") } }
    fun remove() {
        require(!installing.get() && !active.get()) { "Aguarde a operação atual" }
        stop()
        worker.execute { try { models.remove(); publish("idle") } catch (failure: Throwable) { publish("error", failure.message) } }
    }
    override fun close() { if (closed.compareAndSet(false, true)) { models.cancel(); stop(); worker.shutdown() } }
}
