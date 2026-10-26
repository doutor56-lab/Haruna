package com.proxyslabs.haruna.speech

import android.content.Context
import android.net.Uri
import org.json.JSONObject
import java.util.concurrent.CancellationException
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

class TtsManager(context: Context, private val emit: (JSONObject) -> Unit) : AutoCloseable {
    private val prefs = context.getSharedPreferences("haruna_speech", Context.MODE_PRIVATE)
    private val models = TtsModelManager(context)
    private val worker = java.util.concurrent.ScheduledThreadPoolExecutor(1).apply { setExecuteExistingDelayedTasksAfterShutdownPolicy(false) }
    private val audioWorker = Executors.newSingleThreadExecutor()
    private val generation = AtomicLong()
    private val installing = AtomicBoolean(false)
    private val closed = AtomicBoolean(false)
    private val normalizer = TtsTextNormalizer()
    private val engine: TtsEngine = SupertonicTtsEngine()
    private val player = TtsAudioPlayer(context) { stop("audio_focus_lost") }
    @Volatile private var state = "idle"
    @Volatile private var error: String? = null
    @Volatile private var copied = 0L
    @Volatile private var total: Long? = null
    @Volatile private var messageId = ""

    init { worker.execute { models.cleanTemporary() } }
    fun status(): JSONObject = JSONObject().put("state", state).put("error", error)
        .put("installed", models.installed()).put("bytes", models.bytes()).put("speakers", models.speakers())
        .put("speaker", prefs.getInt("speaker", -1)).put("speed", prefs.getFloat("speed", 1f).toDouble())
        .put("pronunciations", JSONObject(prefs.getString("pronunciations", "{}") ?: "{}"))
        .put("copiedBytes", copied).put("totalBytes", total).put("messageId", messageId)
        .put("archiveBytes", TtsModelManager.ARCHIVE_BYTES)
        // Verified byte-for-byte against official F1..F5/M1..M5 styles for the pinned archive.
        .put("voiceLabels", org.json.JSONArray((0 until models.speakers()).map { sid ->
            if (sid < 5) "F${sid + 1} • feminina (speaker $sid)" else "M${sid - 4} • masculina (speaker $sid)"
        }))
    private fun publish(next: String, failure: String? = null, reason: String? = null) { state = next; error = failure; val value = status(); if (reason != null) value.put("reason", reason); emit(value) }
    fun configure(json: String) {
        val value = JSONObject(json); val count = models.speakers()
        if (value.has("speaker")) {
            val sid = value.getInt("speaker")
            require(sid in 0 until count) { "Selecione um speaker disponível" }
            prefs.edit().putInt("speaker", sid).apply()
        }
        if (value.has("speed")) {
            val speed = value.getDouble("speed")
            require(speed.isFinite() && speed in 0.7..1.4) { "Velocidade inválida" }
            prefs.edit().putFloat("speed", speed.toFloat()).apply()
        }
        if (value.has("pronunciations")) {
            val dictionary = value.getJSONObject("pronunciations")
            require(dictionary.length() <= 50 && dictionary.toString().length <= 10000) { "Dicionário de pronúncia muito grande" }
            prefs.edit().putString("pronunciations", dictionary.toString()).apply()
        }
        emit(status())
    }
    fun speak(text: String, id: String) {
        require(text.length <= 100000) { "Texto muito longo para uma única leitura" }
        require(!installing.get()) { "Aguarde a instalação da voz" }
        require(models.installed()) { "Voz local não instalada" }
        val speaker = prefs.getInt("speaker", -1)
        require(speaker in 0 until models.speakers()) { "Escolha e teste uma voz em Configurações" }
        val prepared = normalizer.normalize(text, JSONObject(prefs.getString("pronunciations", "{}") ?: "{}"))
        require(prepared.isNotBlank()) { "Esta mensagem não contém texto para leitura" }
        val segments = normalizer.chunks(prepared)
        val ticket = generation.incrementAndGet()
        player.stop(); messageId = id; publish("preparing")
        val speed = prefs.getFloat("speed", 1f)
        worker.execute {
            fun alive() = !closed.get() && generation.get() == ticket
            if (!alive()) return@execute
            try {
                require(models.installed()) { "Voz local não instalada" }
                val count = engine.load(models.directory)
                require(speaker < count) { "Speaker indisponível neste modelo" }
                var playback: java.util.concurrent.Future<*>? = null
                var started = false
                for (segment in segments) {
                    if (!alive()) break
                    val audio = engine.synthesize(segment, speaker, speed)
                    if (!alive()) break
                    require(audio.samples.isNotEmpty()) { "O motor não gerou áudio" }
                    playback?.get()
                    if (!alive()) break
                    if (!started) { player.begin(audio.sampleRate); publish("playing"); started = true }
                    playback = audioWorker.submit { player.write(audio.samples, ::alive) }
                }
                playback?.get(); player.drain(::alive)
            } catch (failure: Throwable) {
                if (alive()) publish("error", failure.message ?: "Falha no motor de voz")
            } finally {
                player.stop()
                if (alive() && state != "error") publish("idle")
                if (!closed.get()) runCatching { worker.schedule({ if (generation.get() == ticket) engine.close() }, 30, TimeUnit.SECONDS) }
            }
        }
    }
    fun stop(reason: String? = null) {
        val ticket = generation.incrementAndGet(); player.stop(); if (!installing.get()) publish("idle", reason = reason)
        if (!closed.get()) runCatching { worker.schedule({ if (generation.get() == ticket) engine.close() }, 30, TimeUnit.SECONDS) }
    }
    fun reportError(message: String) { publish("error", message) }
    fun prepareForListening(ready: () -> Unit) {
        stop()
        worker.execute { engine.close(); if (!closed.get()) ready() }
    }
    fun cancelInstallation() { if (installing.get()) { models.cancel(); publish("cancelling") } }
    fun install(uri: Uri?) {
        require(installing.compareAndSet(false, true)) { "Já existe uma instalação em andamento" }
        stop(); models.cancelled.set(false); copied = 0; total = if (uri == null) TtsModelManager.ARCHIVE_BYTES else null; publish(if (uri == null) "downloading" else "importing")
        worker.execute {
            try {
                engine.close()
                if (!models.installed()) models.install(uri) { phase, count, length ->
                    copied = count; total = length; publish(phase)
                }
                // No speaker is automatically presented as the user's final choice.
                publish("installed")
            } catch (failure: Throwable) {
                if (models.cancelled.get() || failure is CancellationException) publish("cancelled")
                else publish("error", failure.message ?: "Não foi possível instalar a voz")
            } finally { installing.set(false); copied = 0; total = null; emit(status()) }
        }
    }
    fun remove() {
        require(!installing.get()) { "Cancele ou aguarde a instalação" }
        stop()
        worker.execute { try { engine.close(); models.remove(); prefs.edit().remove("speaker").apply(); publish("idle") } catch (failure: Throwable) { publish("error", failure.message) } }
    }
    override fun close() {
        if (!closed.compareAndSet(false, true)) return
        models.cancel(); generation.incrementAndGet(); player.stop()
        worker.execute { engine.close() }; worker.shutdown(); audioWorker.shutdown()
    }
}
