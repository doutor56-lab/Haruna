package com.proxyslabs.haruna

import java.util.ArrayDeque

/** One ordered delivery in flight. No Android objects, response-wide builder or per-token timer. */
internal class StreamDelivery(
    private val clock: () -> Long,
    private val schedule: (Long, () -> Unit) -> (() -> Unit),
    private val send: (Batch, (Boolean) -> Unit) -> Unit,
    private val observed: (Stats) -> Unit,
    private val overflow: () -> Unit,
    private val retired: () -> Unit
) {
    companion object {
        const val WINDOW_MS = 45L
        const val SINGLE_DELTA_WAIT_MS = 350L
        const val BATCH_CHARS = 4096
        const val BACKLOG_CHARS = 256 * 1024
    }
    data class End(val code: String? = null, val message: String? = null)
    data class Batch(val sequence: Long, val text: String, val deltas: Int, val end: End?)
    data class Stats(val acceptedDeltas: Long, val batches: Long, val textBatches: Long, val acknowledged: Long,
        val charsSent: Long, val maxBatchChars: Int, val maxBatchDeltas: Int,
        val forcedFinal: Long, val peakBacklog: Int, val droppedDeltas: Long,
        val discardedChars: Long, val deliveryFailed: Boolean, val terminalDelivered: Boolean,
        val backlogLimitReached: Boolean)
    private class Piece(val text: String, var offset: Int = 0)
    private val lock = Any()
    private val pieces = ArrayDeque<Piece>()
    private var chars = 0
    private var firstPending = 0L
    private var accepting = true
    private var closed = false
    private var end: End? = null
    private var inFlight: Batch? = null
    private var cancelTimer: (() -> Unit)? = null
    private var dueAt: Long? = null
    private var timerVersion = 0L
    private var accepted = 0L; private var batches = 0L; private var acknowledged = 0L
    private var textBatches = 0L
    private var sent = 0L; private var maxChars = 0; private var maxDeltas = 0
    private var forced = 0L; private var peak = 0; private var dropped = 0L
    private var discarded = 0L; private var failed = false; private var delivered = false
    private var overflowed = false

    fun offer(text: String) {
        if (text.isEmpty()) return
        var stop = false
        synchronized(lock) {
            if (closed || !accepting) { dropped++; return }
            accepted++
            if (pieces.isEmpty()) firstPending = clock()
            pieces.addLast(Piece(text)); chars += text.length
            peak = maxOf(peak, chars + (inFlight?.text?.length ?: 0))
            // Retain the crossing delta, then stop admission and inference. Never silently drop it.
            if (chars >= BACKLOG_CHARS) {
                accepting = false; stop = true; forced++; overflowed = true
                end = End("stream_backlog", "A apresentação não acompanhou a geração. O texto recebido foi preservado.")
            }
            arrangeLocked()
        }
        if (stop) overflow()
    }

    /** Freeze admission at Parar; already accepted text must still precede the terminal event. */
    fun stopInput() = synchronized(lock) {
        accepting = false
        if (end?.code == null && end != null) end = End("cancelled", "Geração interrompida")
        arrangeLocked()
    }

    fun finish(value: End) = synchronized(lock) {
        if (closed) return@synchronized
        accepting = false
        if (end == null) { end = value; forced++ }
        arrangeLocked()
    }

    private fun arrangeLocked() {
        if (closed || inFlight != null) return
        if (pieces.isEmpty() && end == null) return
        val elapsed = clock() - firstPending
        val delay = when {
            !accepting || end != null || batches == 0L || chars >= BATCH_CHARS -> 0L
            pieces.size >= 2 -> maxOf(0L, WINDOW_MS - elapsed)
            else -> maxOf(0L, SINGLE_DELTA_WAIT_MS - elapsed)
        }
        // At most one relevant runnable; a second delta can advance the single-delta deadline.
        val due = clock() + delay
        if (dueAt?.let { it <= due } == true) return
        cancelTimer?.invoke(); dueAt = due
        val version = ++timerVersion
        cancelTimer = schedule(delay) { pump(version) }
    }

    private fun pump(version: Long) {
        val batch = synchronized(lock) {
            if (version != timerVersion || closed) return
            cancelTimer = null; dueAt = null
            if (closed || inFlight != null || (pieces.isEmpty() && end == null)) return
            val text = StringBuilder(); var deltas = 0
            while (pieces.isNotEmpty() && text.length < BATCH_CHARS) {
                val piece = pieces.first
                var count = minOf(BATCH_CHARS - text.length, piece.text.length - piece.offset)
                if (count < piece.text.length - piece.offset &&
                    Character.isHighSurrogate(piece.text[piece.offset + count - 1])) count--
                if (count == 0) break
                text.append(piece.text, piece.offset, piece.offset + count)
                piece.offset += count; chars -= count
                if (piece.offset == piece.text.length) { pieces.removeFirst(); deltas++ }
            }
            Batch(++batches, text.toString(), deltas, if (pieces.isEmpty()) end else null).also {
                inFlight = it; sent += it.text.length
                if (it.text.isNotEmpty()) textBatches++
                maxChars = maxOf(maxChars, it.text.length); maxDeltas = maxOf(maxDeltas, deltas)
            }
        }
        observe()
        try { send(batch) { ok -> acknowledge(batch, ok) } }
        catch (_: Exception) { acknowledge(batch, false) }
    }

    private fun acknowledge(batch: Batch, ok: Boolean) {
        var done = false; var abort = false
        synchronized(lock) {
            if (closed || inFlight !== batch) return
            inFlight = null
            if (!ok) {
                failed = true; discarded += batch.text.length; abort = true; closeLocked(); done = true
            } else {
                acknowledged++
                if (batch.end != null) { delivered = true; closeLocked(); done = true }
                else arrangeLocked()
            }
        }
        observe()
        if (abort) overflow()
        if (done) retired()
    }

    private fun closeLocked() {
        closed = true; accepting = false
        timerVersion++; cancelTimer?.invoke(); cancelTimer = null; dueAt = null
        discarded += chars; chars = 0; pieces.clear(); inFlight = null
    }
    fun close() {
        synchronized(lock) {
            if (closed) return
            discarded += inFlight?.text?.length ?: 0
            closeLocked()
        }
        observe()
    }
    private fun observe() { runCatching { observed(snapshot()) } }
    fun snapshot(): Stats = synchronized(lock) {
        Stats(accepted, batches, textBatches, acknowledged, sent, maxChars, maxDeltas, forced, peak,
            dropped, discarded, failed, delivered, overflowed)
    }
}
