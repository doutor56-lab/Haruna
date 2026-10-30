package com.proxyslabs.haruna.speech

/** Supported exported format, not a promise about arbitrary Whisper/ONNX/GGUF files. */
object WhisperModels {
    data class Model(val family: String, val title: String, val archiveBytes: Long) {
        val id get() = "whisper-$family-int8"
        val files get() = listOf("$family-encoder.int8.onnx", "$family-decoder.int8.onnx", "$family-tokens.txt")
        val archive get() = "sherpa-onnx-whisper-$family.tar.bz2"
        val url get() = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/$archive"
    }
    val supported = listOf(Model("tiny", "Whisper Tiny", 116204861), Model("base", "Whisper Base", 207557382), Model("small", "Whisper Small", 639387718))
    fun byId(id: String): Model = supported.firstOrNull { it.id == id } ?: error("Modelo STT não suportado: use Whisper Tiny, Base ou Small multilíngue ONNX INT8 para sherpa-onnx")
    fun detect(names: Set<String>): Model {
        val found = supported.filter { names.containsAll(it.files) }
        require(found.size == 1) { "O pacote precisa conter um par encoder/decoder INT8 e tokens de um único Whisper Tiny, Base ou Small multilíngue" }
        return found.single()
    }
    fun hasPortuguese(tokens: String): Boolean {
        // Exporters may store special tokens literally or as base64 bytes.
        val pt = tokens.contains("<|pt|>") || tokens.lineSequence().any { it.substringBefore(' ') == "PHxwdHw+" }
        val start = tokens.contains("<|startoftranscript|>") || tokens.contains("PHxzdGFydG9mdHJhbnNjcmlwdHw+")
        if (pt && start) return true
        // Official export-onnx.py copies multilingual.tiktoken mergeable ranks only;
        // language special tokens are model metadata, not necessarily lines in this file.
        val ids = BooleanArray(50257); var count = 0
        val encoded = Regex("[A-Za-z0-9+/]+={0,2}")
        for (line in tokens.lineSequence()) {
            if (line.isBlank()) continue
            val rank = line.substringAfterLast(' ').toIntOrNull() ?: return false
            if (rank !in ids.indices || ids[rank]) return false
            if (!line.substringBefore(' ').matches(encoded)) return false
            ids[rank] = true; count++
        }
        return count == ids.size
    }
}
