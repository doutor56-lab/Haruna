package com.proxyslabs.haruna.speech

import android.util.Log
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
    private val voicePrefs = context.getSharedPreferences("haruna_recognition", Context.MODE_PRIVATE)
    private val models = SttModelManager(context)
    private val engine: SttEngine = WhisperSttEngine { emit(status()) }
    private val cppEngine: SttEngine = WhisperCppEngine { emit(status()) }
    private fun selectedEngine() = if (models.selected().engine == "cpp") cppEngine else engine
    private val recorder = SttAudioRecorder(context)
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
    init { SttDiagnostics.model(models.selected().title + " · " + if (models.selected().engine == "cpp") "whisper.cpp" else "sherpa-onnx INT8"); worker.execute { models.cleanTemporary() } }
    fun status(): JSONObject = JSONObject().put("state", state).put("error", error)
        .put("installed", models.installed()).put("bytes", models.bytes()).put("busy", active.get()).put("requestId", requestId).put("mode", mode)
        .put("copiedBytes", copied).put("totalBytes", total).put("archiveBytes", models.selected().archiveBytes)
        .put("catalog", org.json.JSONArray(WhisperModels.supported.map { model -> JSONObject().put("id", model.id).put("name", model.title).put("bytes", model.archiveBytes).put("engine", model.engine) }))
        .put("models", models.list()).put("selectedId", models.selected().id).put("modelName", models.selected().title)
        .put("loaded", (engine.loaded() || cppEngine.loaded())).put("activeModel", if ((engine.loaded() || cppEngine.loaded())) models.selected().title else JSONObject.NULL)
        .put("automaticPause", voicePrefs.getBoolean("automatic_pause", true))
        .put("vad", "silero")
        .put("diagnostics", SttDiagnostics.snapshot())
    private fun publish(next: String, failure: String? = null, text: String? = null) {
        state = next; error = failure
        val value = status(); if (text != null) value.put("text", text)
        emit(value)
    }
    fun fail(message: String, id: String = requestId) { requestId = id; publish("error", message) }
    @Synchronized fun start(captureMode: String, id: String) {
        require(!closed.get() && !installing.get()) { "Aguarde a instalação do reconhecimento de voz" }
        require(context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) { "Permita o microfone para usar a voz" }
        require(captureMode == "dictation" || captureMode == "call") { "Modo de captura inválido" }
        require(id.isNotBlank() && id.length <= 150) { "Pedido de captura inválido" }
        require(models.installed()) { "Reconhecimento de voz não instalado" }
        require(active.compareAndSet(false, true)) { "Aguarde a captura ou transcrição atual" }
        val ticket = generation.incrementAndGet()
        requestId = id; mode = captureMode; recorder.prepare(); SttDiagnostics.begin(); publish("preparing")
        worker.execute {
            fun alive() = !closed.get() && generation.get() == ticket
            var samples = FloatArray(0)
            try {
                if (!alive()) return@execute
                samples = recorder.capture(::alive, { if (alive()) publish("listening") }, { level -> if (alive()) emit(JSONObject().put("meter", true).put("state", "listening").put("requestId", requestId).put("level", level)) }, voicePrefs.getBoolean("automatic_pause", true))
                if (!alive()) return@execute
                SttDiagnostics.captured(samples.size)
                if (samples.isEmpty()) { SttDiagnostics.finished("no_speech"); publish("no_speech"); return@execute }
                require(models.installed()) { "Reconhecimento de voz não instalado" }
                publish("transcribing")
                val text = selectedEngine().transcribe(models.directory, samples, models.selected())
                // The engine frees its sessions before returning text to the chat.
                if (alive()) {
                    val accepted = SttResultPolicy.accept(text)
                    SttDiagnostics.finished(if (accepted != null) "success" else "invalid")
                    if (accepted == null) publish("no_speech") else publish("result", text = accepted)
                }
            } catch (failure: Throwable) { if (alive()) { SttDiagnostics.finished("error"); Log.w("HarunaSTT", "Local transcription failed", failure); publish("error", SttErrors.message(failure)) } }
            finally { if (!alive()) SttDiagnostics.finished("cancelled"); samples.fill(0f); active.set(false); if (!closed.get()) emit(status()) }
        }
    }
    fun configure(json: String) { val value = JSONObject(json); if (value.has("automaticPause")) voicePrefs.edit().putBoolean("automatic_pause", value.getBoolean("automaticPause")).apply(); emit(status()) }
    fun finish() { if (state == "listening") recorder.finish() }
    fun stop() { generation.incrementAndGet(); recorder.cancel(); if (!installing.get()) publish("idle") }
    @Synchronized fun install(uri: Uri?, id: String = "whisper-tiny-int8") {
        val requested = WhisperModels.byId(id)
        require(!active.get()) { "Encerre a captura e aguarde a transcrição antes de instalar" }
        require(installing.compareAndSet(false, true)) { "Já existe uma instalação em andamento" }
        models.cancelled.set(false); copied = 0; total = if (uri == null) requested.archiveBytes else null
        publish(if (uri == null) "downloading" else "importing")
        worker.execute {
            try {
                models.install(uri, { phase, count, length -> copied = count; total = length; publish(phase) }, id)
                SttDiagnostics.model(models.selected().title + " · " + if (models.selected().engine == "cpp") "whisper.cpp" else "sherpa-onnx INT8")
                publish("installed")
            } catch (failure: Throwable) { Log.w("HarunaSTT", "Model installation failed", failure); publish(if (models.cancelled.get()) "cancelled" else "error", if (models.cancelled.get()) null else SttErrors.message(failure)) }
            finally { installing.set(false); copied = 0; total = null; emit(status()) }
        }
    }
    fun cancelInstallation() { if (installing.get()) { models.cancel(); publish("cancelling") } }
    @Synchronized fun select(id: String) {
        require(!active.get() && installing.compareAndSet(false, true)) { "Aguarde a operação STT atual" }
        publish("selecting")
        worker.execute {
            try { models.select(id); SttDiagnostics.model(models.selected().title + " · " + if (models.selected().engine == "cpp") "whisper.cpp" else "sherpa-onnx INT8"); publish("idle") }
            catch (failure: Throwable) { publish("error", failure.message) }
            finally { installing.set(false); emit(status()) }
        }
    }
    @Synchronized fun remove(id: String = models.selected().id) {
        require(!active.get() && installing.compareAndSet(false, true)) { "Aguarde a operação STT atual" }
        publish("removing")
        worker.execute {
            try { models.remove(id); SttDiagnostics.model(models.selected().title + " · " + if (models.selected().engine == "cpp") "whisper.cpp" else "sherpa-onnx INT8"); publish("idle") }
            catch (failure: Throwable) { publish("error", failure.message) }
            finally { installing.set(false); emit(status()) }
        }
    }
    override fun close() { if (closed.compareAndSet(false, true)) { models.cancel(); stop(); worker.shutdown() } }
}
