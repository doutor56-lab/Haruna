package com.proxyslabs.haruna.diagnostics

import android.os.SystemClock
import org.json.JSONObject

/** Bounded, process-local counters. Never retains prompts, output, audio or document content. */
object DiagnosticSession {
    private data class Generation(val started: Long, var first: Long? = null)
    private data class Voice(var loaded: Boolean = false, var count: Long = 0,
                             var totalMs: Double = 0.0, var lastMs: Double? = null)
    private val lock = Any()
    private val generations = linkedMapOf<String, Generation>()
    private val stt = Voice()
    private val tts = Voice()
    private var completed = 0L
    private var firstMs: Double? = null
    private var generationMs: Double? = null
    private var outcome: String? = null
    private val started = SystemClock.elapsedRealtime()

    fun clock(): Long = SystemClock.elapsedRealtimeNanos()
    fun llmStarted(id: String) { runCatching { synchronized(lock) {
        if (generations.size >= 4) generations.remove(generations.keys.first())
        generations[id] = Generation(clock())
    } } }
    fun llmFirstOutput(id: String) { runCatching { synchronized(lock) {
        generations[id]?.let { if (it.first == null) it.first = clock() }
    } } }
    fun llmFinished(id: String, success: Boolean, cancelled: Boolean = false) {
        runCatching { synchronized(lock) {
            val generation = generations.remove(id)
            if (success) completed++
            firstMs = generation?.first?.let { (it - generation.started) / 1e6 }
            generationMs = generation?.let { (clock() - it.started) / 1e6 }
            outcome = if (success) "completed" else if (cancelled) "cancelled" else "error"
        } }
    }
    fun voiceLoaded(kind: String, loaded: Boolean) { runCatching { synchronized(lock) {
        (if (kind == "stt") stt else tts).loaded = loaded
    } } }
    fun voiceOperation(kind: String, since: Long) { runCatching { synchronized(lock) {
        val elapsed = (clock() - since) / 1e6
        if (elapsed >= 0 && elapsed.isFinite()) {
            val value = if (kind == "stt") stt else tts
            value.count++; value.totalMs += elapsed; value.lastMs = elapsed
        }
    } } }
    fun snapshot(): JSONObject = synchronized(lock) {
        fun voice(value: Voice) = JSONObject().put("loaded", value.loaded)
            .put("samples", value.count).put("lastMs", value.lastMs ?: JSONObject.NULL)
            .put("meanMs", if (value.count > 0) value.totalMs / value.count else JSONObject.NULL)
        JSONObject().put("sessionUptimeMs", SystemClock.elapsedRealtime() - started)
            .put("responsesCompleted", completed).put("firstOutputMs", firstMs ?: JSONObject.NULL)
            .put("generationMs", generationMs ?: JSONObject.NULL).put("lastOutcome", outcome ?: JSONObject.NULL)
            .put("stt", voice(stt)).put("tts", voice(tts))
    }
}
