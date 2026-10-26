package com.proxyslabs.haruna.speech

import org.json.JSONObject

/** Speech-only transforms: the visible message and stored chat are never rewritten. */
class TtsTextNormalizer {
    fun normalize(original: String, dictionary: JSONObject): String {
        var text = original.replace(Regex("<think>[\\s\\S]*?(</think>|$)", RegexOption.IGNORE_CASE), " ")
            .replace(Regex("```[\\s\\S]*?```"), " Trecho de código. ")
            .replace(Regex("!?\\[([^]]+)]\\([^)]*\\)"), "$1")
            .replace(Regex("https?://\\S+"), " link ")
            .replace(Regex("(?m)^\\s{0,3}[#>*]+\\s*"), "")
            .replace(Regex("[*_`~]"), "")
        dictionary.keys().asSequence().toList().sortedByDescending { it.length }.forEach { word ->
            val spoken = dictionary.optString(word).trim()
            if (word.isNotBlank() && spoken.isNotBlank()) text = text.replace(Regex("(?<![\\p{L}\\p{N}_])${Regex.escape(word)}(?![\\p{L}\\p{N}_])", RegexOption.IGNORE_CASE)) { spoken }
        }
        return text.replace(Regex("\\s+"), " ").trim()
    }
    fun chunks(text: String): List<String> {
        val result = mutableListOf<String>(); var rest = text.trim()
        while (rest.isNotEmpty()) {
            var end = minOf(rest.length, 240)
            if (end < rest.length) {
                val window = rest.take(end)
                val punctuation = Regex("[.!?;:]\\s").findAll(window).lastOrNull()?.range?.last
                val boundary = punctuation ?: window.lastIndexOf(' ')
                if (boundary > 40) end = boundary + 1
                if (end < rest.length && Character.isHighSurrogate(rest[end - 1])) end--
            }
            result.add(rest.take(end).trim()); rest = rest.drop(end).trim()
        }
        return result.filter { it.isNotBlank() }
    }
}
