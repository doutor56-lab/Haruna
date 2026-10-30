package com.proxyslabs.haruna.speech

import java.util.ArrayDeque

/** Text only. A waiting consumer sleeps; the LLM producer is never blocked by playback. */
class SpeechTextQueue(private val maxChars: Int = 16384, private val maxChunks: Int = 64) {
    private val monitor = Object()
    private val chunks = ArrayDeque<String>()
    private var chars = 0
    private var ended = false
    private var cancelled = false
    fun offer(text: String) = synchronized(monitor) {
        check(!ended && !cancelled) { "Fila de fala encerrada" }
        require(text.isNotBlank() && text.length <= 480) { "Trecho de fala inválido" }
        check(chunks.size < maxChunks && chars + text.length <= maxChars) { "Fila de fala cheia; a resposta continua disponível no chat" }
        chunks.addLast(text); chars += text.length; monitor.notifyAll()
    }
    fun take(): String? = synchronized(monitor) {
        while (chunks.isEmpty() && !ended && !cancelled) monitor.wait()
        if (cancelled || chunks.isEmpty()) null else chunks.removeFirst().also { chars -= it.length }
    }
    fun finish() = synchronized(monitor) { ended = true; monitor.notifyAll() }
    fun cancel() = synchronized(monitor) { cancelled = true; chunks.clear(); chars = 0; monitor.notifyAll() }
}
