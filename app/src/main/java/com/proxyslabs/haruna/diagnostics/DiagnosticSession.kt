package com.proxyslabs.haruna.diagnostics

import android.os.SystemClock
import org.json.JSONObject

/** Bounded, process-local counters. Never retains prompts, output, audio or document content. */
object DiagnosticSession {
    private data class Generation(val started: Long, var first: Long? = null,
        var events: Long = 0, var firstSent: Long? = null, var finished: Long? = null,
        var firstDomAck: Long? = null, var finalDomAck: Long? = null,
        var visual: JSONObject? = null)
    private data class Voice(var loaded: Boolean = false, var count: Long = 0,
                             var totalMs: Double = 0.0, var lastMs: Double? = null)
    private val lock = Any()
    private val generations = linkedMapOf<String, Generation>()
    private var lastGeneration: Pair<String, Generation>? = null
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
    fun llmEventSent(id: String) { synchronized(lock) {
        val g = generations[id] ?: lastGeneration?.takeIf { it.first == id }?.second ?: return
        g.events++; if (g.firstSent == null) g.firstSent = clock()
    } }
    fun presentation(id: String, value: JSONObject) { synchronized(lock) {
        val g = generations[id] ?: lastGeneration?.takeIf { it.first == id }?.second ?: return
        val phase = value.optString("phase")
        if (phase == "first") { if (g.firstDomAck != null) return; g.firstDomAck = clock() }
        else if (phase == "final") { if (g.finalDomAck != null) return; g.finalDomAck = clock() }
        else return
        val safe = JSONObject()
        for (key in listOf("contextMs", "clientFirstDeltaMs", "clientFirstDomMs", "clientFirstVisibleMs",
                "clientTotalMs", "presentationSpanMs", "visualUpdates", "receivedDeltas", "outputUtf16")) {
            val n = value.optDouble(key, Double.NaN)
            if (n.isFinite() && n >= 0 && n <= 1e12) safe.put(key, n)
        }
        g.visual = safe
    } }
    fun llmFinished(id: String, success: Boolean, cancelled: Boolean = false) {
        runCatching { synchronized(lock) {
            val generation = generations.remove(id)
            if (generation != null) { generation.finished = clock(); lastGeneration = id to generation }
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
        val current = generations.values.lastOrNull()
        val g = current ?: lastGeneration?.second
        val pipeline = JSONObject().put("active", current != null)
        if (g != null) {
            fun since(t: Long?): Any = t?.let { (it - g.started) / 1e6 } ?: JSONObject.NULL
            pipeline.put("bridgeEvents", g.events).put("bridgeFirstDeltaMs", since(g.first))
                .put("firstWebViewSendMs", since(g.firstSent)).put("firstDomAckMs", since(g.firstDomAck))
                .put("finalDomAckMs", since(g.finalDomAck)).put("elapsedMs", ((g.finished ?: clock()) - g.started) / 1e6)
                .put("firstDomAckBootUs", g.firstDomAck?.div(1000) ?: JSONObject.NULL)
                .put("firstWebViewSendBootUs", g.firstSent?.div(1000) ?: JSONObject.NULL)
                .put("bridgeStartBootUs", g.started / 1000)
                .put("visual", g.visual ?: JSONObject())
        }
        JSONObject().put("sessionUptimeMs", SystemClock.elapsedRealtime() - started)
            .put("responsesCompleted", completed).put("firstOutputMs", firstMs ?: JSONObject.NULL)
            .put("generationMs", generationMs ?: JSONObject.NULL).put("lastOutcome", outcome ?: JSONObject.NULL)
            .put("stt", voice(stt)).put("tts", voice(tts)).put("pipeline", pipeline)
    }
}
