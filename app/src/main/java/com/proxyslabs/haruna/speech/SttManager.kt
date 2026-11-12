package com.proxyslabs.haruna.speech

import android.util.Log
import android.Manifest
import android.content.Context
import android.content.ComponentCallbacks2
import android.content.res.Configuration
import android.app.ActivityManager
import java.util.concurrent.TimeUnit
import java.util.concurrent.ScheduledThreadPoolExecutor
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.CancellationException
import android.content.pm.PackageManager
import android.net.Uri
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/** Serial model work; each capture/transcription is explicitly owned by a request ID. */
class SttManager(private val context: Context, private val emit: (JSONObject) -> Unit) : AutoCloseable, ComponentCallbacks2 {
    private val voicePrefs = context.getSharedPreferences("haruna_recognition", Context.MODE_PRIVATE)
    private val models = SttModelManager(context)
    private val engine: SttEngine = WhisperSttEngine { if (!closed.get()) emit(status()) }
    private val cppEngine: SttEngine = WhisperCppEngine { if (!closed.get()) emit(status()) }
    private val recorder = SttAudioRecorder(context)
    private val worker = Executors.newSingleThreadExecutor()
    private val modelWorker = ScheduledThreadPoolExecutor(1).apply { setExecuteExistingDelayedTasksAfterShutdownPolicy(false); setRemoveOnCancelPolicy(true) }
    @Volatile private var idleRelease: ScheduledFuture<*>? = null
    private fun releaseModels() { engine.close(); cppEngine.close() }
    private fun memory() = ActivityManager.MemoryInfo().also { (context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).getMemoryInfo(it) }
    private fun keepSession(model: WhisperModels.Model): Boolean {
        val info = memory()
        return model.family in setOf("tiny", "base") && !info.lowMemory && info.availMem >= 1024L*1024*1024 && !com.proxyslabs.haruna.image.ImageLease.active
    }
    fun canShareVoiceCache(): Boolean {
        val info = memory()
        return models.selected().family in setOf("tiny", "base") && !info.lowMemory && info.availMem >= 1536L*1024*1024 && !com.proxyslabs.haruna.image.ImageLease.active
    }
    private fun releaseIdle() { if (!closed.get()) runCatching { modelWorker.execute { if (!active.get()) releaseModels() } } }
    override fun onTrimMemory(level: Int) { if (level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW) releaseIdle() }
    override fun onLowMemory() = releaseIdle()
    override fun onConfigurationChanged(newConfig: Configuration) {}
    private fun finishSession(ticket: Long, model: WhisperModels.Model, failed: Boolean) {
        if (closed.get()) return
        runCatching { modelWorker.execute {
            if (generation.get() != ticket) return@execute
            if (failed || !keepSession(model)) releaseModels()
            else idleRelease = modelWorker.schedule({ if (generation.get() == ticket && !active.get()) releaseModels() }, 30, TimeUnit.SECONDS)
        } }
    }
    private val generation = AtomicLong()
    private val installing = AtomicBoolean(false)
    private val closed = AtomicBoolean(false)
    private val active = AtomicBoolean(false)
    @Volatile private var state = "idle"
    @Volatile private var error: String? = null
    @Volatile private var requestId = ""
    @Volatile private var mode = "dictation"
    @Volatile private var installationModel: String? = null
    @Volatile private var copied = 0L
    @Volatile private var total: Long? = null
    init { IdleSpeechSessions.register(this) { if (closed.get() || active.get()) null else modelWorker.submit { if (!active.get()) releaseModels() } }; context.registerComponentCallbacks(this); SttDiagnostics.model(models.selected().title + " · " + if (models.selected().engine == "cpp") "whisper.cpp" else "sherpa-onnx INT8"); worker.execute { models.cleanTemporary() } }
    fun status(): JSONObject = JSONObject().put("state", state).put("error", error)
        .put("installed", models.installed()).put("bytes", models.bytes()).put("busy", active.get()).put("requestId", requestId).put("mode", mode)
        .put("installingModel", installationModel ?: JSONObject.NULL).put("copiedBytes", copied).put("totalBytes", total).put("archiveBytes", models.selected().archiveBytes)
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
        val model = models.selected(); val directory = models.directory
        val selected = if (model.engine == "cpp") cppEngine else engine
        idleRelease?.cancel(false)
        requestId = id; mode = captureMode; recorder.prepare(); SttDiagnostics.begin(); publish("preparing")
        worker.execute {
            fun alive() = !closed.get() && generation.get() == ticket
            var samples = FloatArray(0)
            var failed = true
            try {
                if (!alive()) return@execute
                // The microphone starts while one serialized model worker prepares the recognizer.
                val prepared = modelWorker.submit {
                    if (alive()) {
                        check(!com.proxyslabs.haruna.image.ImageLease.active) { "Aguarde o motor de imagens ou visão" }
                        val info = memory(); val margin = maxOf(512L*1024*1024, model.archiveBytes*2); check(!info.lowMemory && info.availMem >= margin) { "Memória disponível insuficiente para transcrever agora" }
                        if (selected === cppEngine) engine.close() else cppEngine.close()
                        try { selected.prepare(directory, model) }
                        catch (failure: Throwable) { recorder.finish(); throw failure }
                    }
                }
                samples = recorder.capture(::alive, { if (alive()) publish("listening") }, { level -> if (alive()) emit(JSONObject().put("meter", true).put("state", "listening").put("requestId", requestId).put("level", level)) }, voicePrefs.getBoolean("automatic_pause", true))
                if (!alive()) return@execute
                SttDiagnostics.captured(samples.size)
                if (samples.isNotEmpty()) publish("transcribing")
                prepared.get()
                if (samples.isEmpty()) { failed = false; SttDiagnostics.finished("no_speech"); publish("no_speech"); return@execute }
                require(models.installed(model)) { "Reconhecimento de voz não instalado" }
                val text = modelWorker.submit<String> {
                    if (!alive()) throw CancellationException("Transcrição cancelada")
                    selected.transcribe(directory, samples, model)
                }.get()
                failed = false
                if (alive()) {
                    val accepted = SttResultPolicy.accept(text)
                    SttDiagnostics.finished(if (accepted != null) "success" else "invalid")
                    if (accepted == null) publish("no_speech") else publish("result", text = accepted)
                }
            } catch (failure: Throwable) { if (alive()) { SttDiagnostics.finished("error"); val cause = (failure as? java.util.concurrent.ExecutionException)?.cause ?: failure; Log.w("HarunaSTT", "Local transcription failed", cause); publish("error", SttErrors.message(cause)) } }
            finally { if (!alive()) SttDiagnostics.finished("cancelled"); samples.fill(0f); active.set(false); finishSession(ticket, model, failed); if (!closed.get()) emit(status()) }
        }
    }
    fun configure(json: String) { val value = JSONObject(json); if (value.has("automaticPause")) voicePrefs.edit().putBoolean("automatic_pause", value.getBoolean("automaticPause")).apply(); emit(status()) }
    fun finish() { if (state == "listening") recorder.finish() }
    fun stop() {
        val wasActive = active.get()
        val ticket = generation.incrementAndGet(); recorder.cancel(); engine.cancel(); cppEngine.cancel()
        idleRelease?.cancel(false)
        if (!installing.get()) publish("idle")
        if (!closed.get()) runCatching { modelWorker.execute { if (generation.get() == ticket) {
            if (wasActive || !keepSession(models.selected())) releaseModels()
            else idleRelease = modelWorker.schedule({ if (generation.get() == ticket && !active.get()) releaseModels() }, 30, TimeUnit.SECONDS)
        } } }
    }
    @Synchronized fun install(uri: Uri?, id: String = "whisper-tiny-int8") {
        val requested = WhisperModels.byId(id)
        require(!active.get()) { "Encerre a captura e aguarde a transcrição antes de instalar" }
        require(installing.compareAndSet(false, true)) { "Já existe uma instalação em andamento" }
        models.cancelled.set(false); installationModel = if (uri == null) requested.title else null; copied = 0; total = if (uri == null) requested.archiveBytes else null
        publish(if (uri == null) "downloading" else "importing")
        worker.execute {
            try {
                modelWorker.submit { releaseModels() }.get()
                var lastPhase = ""; var lastPublished = 0L
                models.install(uri, { phase, count, length ->
                    copied = count; total = length
                    val now = System.nanoTime()
                    if (phase != lastPhase || now - lastPublished >= 200_000_000L || (length != null && count == length)) {
                        lastPhase = phase; lastPublished = now; publish(phase)
                    }
                }, id)
                SttDiagnostics.model(models.selected().title + " · " + if (models.selected().engine == "cpp") "whisper.cpp" else "sherpa-onnx INT8")
                publish("installed")
            } catch (failure: Throwable) { Log.w("HarunaSTT", "Model installation failed", failure); publish(if (models.cancelled.get()) "cancelled" else "error", if (models.cancelled.get()) null else SttErrors.message(failure)) }
            finally { installing.set(false); installationModel = null; copied = 0; total = null; emit(status()) }
        }
    }
    fun cancelInstallation() { if (installing.get()) { models.cancel(); publish("cancelling") } }
    @Synchronized fun select(id: String) {
        require(!active.get() && installing.compareAndSet(false, true)) { "Aguarde a operação STT atual" }
        publish("selecting")
        worker.execute {
            try { modelWorker.submit { releaseModels() }.get(); models.select(id); SttDiagnostics.model(models.selected().title + " · " + if (models.selected().engine == "cpp") "whisper.cpp" else "sherpa-onnx INT8"); publish("idle") }
            catch (failure: Throwable) { publish("error", failure.message) }
            finally { installing.set(false); emit(status()) }
        }
    }
    @Synchronized fun remove(id: String = models.selected().id) {
        require(!active.get() && installing.compareAndSet(false, true)) { "Aguarde a operação STT atual" }
        publish("removing")
        worker.execute {
            try { modelWorker.submit { releaseModels() }.get(); models.remove(id); SttDiagnostics.model(models.selected().title + " · " + if (models.selected().engine == "cpp") "whisper.cpp" else "sherpa-onnx INT8"); publish("idle") }
            catch (failure: Throwable) { publish("error", failure.message) }
            finally { installing.set(false); emit(status()) }
        }
    }
    override fun close() {
        if (closed.compareAndSet(false, true)) {
            IdleSpeechSessions.unregister(this); context.unregisterComponentCallbacks(this); models.cancel(); idleRelease?.cancel(false); stop()
            modelWorker.execute { releaseModels() }; modelWorker.shutdown(); worker.shutdown()
        }
    }
}
