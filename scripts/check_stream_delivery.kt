@file:JvmName("StreamDeliveryCheck")
package com.proxyslabs.haruna

// Focused controller checks, no GGUF, Android inference or performance claims.
private class FakeTime {
    data class Task(val due: Long, val action: () -> Unit, var cancelled: Boolean = false)
    var now = 0L
    val tasks = mutableListOf<Task>()
    fun schedule(delay: Long, action: () -> Unit): () -> Unit {
        val task = Task(now + delay, action); tasks.add(task)
        return { task.cancelled = true }
    }
    fun advance(to: Long) {
        while (true) {
            val task = tasks.filter { !it.cancelled && it.due <= to }.minByOrNull { it.due } ?: break
            tasks.remove(task); now = task.due; task.action()
        }
        now = to
    }
}
private class Harness {
    val time = FakeTime()
    val sent = mutableListOf<StreamDelivery.Batch>()
    val acks = ArrayDeque<(Boolean) -> Unit>()
    var retired = 0; var aborted = 0
    val stream = StreamDelivery({ time.now }, time::schedule,
        { batch, ack -> check(acks.isEmpty()); sent.add(batch); acks.addLast(ack) },
        {}, { aborted++ }, { retired++ })
    fun ack(ok: Boolean = true) { acks.removeFirst()(ok); time.advance(time.now) }
    fun drain() {
        time.advance(time.now)
        while (acks.isNotEmpty()) ack()
    }
    fun text() = sent.joinToString("") { it.text }
}
fun main() {
    Harness().apply {
        stream.offer("Olá 🌸"); stream.finish(StreamDelivery.End()); drain()
        check(text() == "Olá 🌸" && sent.single().end != null && retired == 1)
    }
    Harness().apply {
        stream.offer("primeiro"); time.advance(0)
        repeat(256) { stream.offer("$it:🌸|") }
        check(sent.size == 1) // No second evaluate while its ACK is withheld.
        stream.finish(StreamDelivery.End()); drain()
        check(text() == "primeiro" + (0..255).joinToString("") { "$it:🌸|" })
        check(sent.size < 256 && sent.count { it.end != null } == 1)
        check(sent.map { it.sequence } == (1L..sent.size.toLong()).toList())
    }
    Harness().apply {
        stream.offer("a"); time.advance(0); ack()
        time.advance(280); stream.offer("b"); time.advance(560); stream.offer("c"); time.advance(560)
        check(sent.last().text == "bc") // Slow producer: bounded wait coalesces two deltas.
        ack(); stream.finish(StreamDelivery.End()); drain(); check(text() == "abc")
    }
    Harness().apply {
        stream.stopInput(); stream.finish(StreamDelivery.End("cancelled")); drain()
        check(text().isEmpty() && sent.single().end?.code == "cancelled")
    }
    Harness().apply {
        stream.offer("parcial"); time.advance(0)
        stream.offer(" aceito"); stream.stopInput(); stream.offer(" tardio")
        stream.finish(StreamDelivery.End("cancelled")); drain()
        check(text() == "parcial aceito" && stream.snapshot().droppedDeltas == 1L)
        check(sent.last().end?.code == "cancelled")
    }
    Harness().apply {
        stream.offer("antes do erro"); stream.finish(StreamDelivery.End("generation_failed")); drain()
        check(text() == "antes do erro" && sent.last().end?.code == "generation_failed")
    }
    Harness().apply {
        val huge = "x" + "🌸".repeat(5000)
        stream.offer(huge); stream.finish(StreamDelivery.End()); drain()
        check(text() == huge)
        check(sent.all { it.text.length <= StreamDelivery.BATCH_CHARS &&
            (it.text.isEmpty() || !Character.isHighSurrogate(it.text.last())) })
    }
    Harness().apply {
        val huge = "x".repeat(StreamDelivery.BACKLOG_CHARS + 10)
        stream.offer(huge); stream.offer("recusado"); drain()
        check(aborted == 1 && text() == huge && sent.last().end?.code == "stream_backlog")
        check(stream.snapshot().discardedChars == 0L && stream.snapshot().backlogLimitReached)
    }
    Harness().apply {
        stream.offer("old"); time.advance(0); stream.offer("pending")
        stream.close(); ack(); time.advance(1000)
        check(sent.size == 1 && stream.snapshot().discardedChars == 10L)
    }
    Harness().apply {
        stream.offer("a"); time.advance(0); ack(false)
        check(aborted == 1 && retired == 1 && stream.snapshot().deliveryFailed)
    }
    // A stale scheduled callback cannot flush or clear a newer timer.
    Harness().apply {
        stream.offer("a"); time.advance(0); ack()
        stream.offer("b"); val stale = time.tasks.last().action
        time.advance(45); stream.offer("c"); stale(); time.advance(45)
        check(sent.last().text == "bc"); ack()
        stream.finish(StreamDelivery.End()); drain(); check(text() == "abc")
    }
    println("PASS: ordered batches, ACK backpressure, final/error/cancel drain, bounds, Unicode and retired timers.")
}
