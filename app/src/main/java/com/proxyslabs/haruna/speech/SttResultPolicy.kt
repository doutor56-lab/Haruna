package com.proxyslabs.haruna.speech

/** Reject only structurally unusable output. This is NOT a confidence/semantic accuracy score. */
object SttResultPolicy {
    fun accept(raw: String): String? {
        val text = raw.trim()
        if (text.isEmpty() || text.length > 2000 || !text.any { it.isLetterOrDigit() }) return null
        if (text.any { it.isISOControl() && !it.isWhitespace() } || text.contains("<|")) return null
        val words = text.lowercase().split(Regex("[\\s\\p{Punct}]+" )).filter { it.isNotEmpty() }
        // Eight consecutive identical words is pathological output, not proof of recognition quality.
        if (words.windowed(8).any { segment -> segment.all { it == segment.first() } }) return null
        for (size in 2..6) {
            if (words.windowed(size * 5).any { segment -> (size until segment.size).all { segment[it] == segment[it % size] } }) return null
        }
        return text
    }
}
