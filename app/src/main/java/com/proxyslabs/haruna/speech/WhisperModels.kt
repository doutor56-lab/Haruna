package com.proxyslabs.haruna.speech

/** Supported exported format, not a promise about arbitrary Whisper/ONNX/GGUF files. */
object WhisperModels {
    data class Model(val family: String, val title: String, val archiveBytes: Long, val engine: String = "sherpa", val filename: String = "", val sha256: String = "") {
        val id get() = if (engine == "sherpa") "whisper-$family-int8" else "whisper-cpp-$family-" + if (filename.contains("q5_1")) "q5_1" else "f16"
        val files get() = if (engine == "cpp") listOf("model.bin") else listOf("$family-encoder.int8.onnx", "$family-decoder.int8.onnx", "$family-tokens.txt")
        val archive get() = "sherpa-onnx-whisper-$family.tar.bz2"
        val url get() = if (engine == "cpp") "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/$filename" else "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/$archive"
    }
    val onnx = listOf(Model("tiny", "Whisper Tiny", 116204861), Model("base", "Whisper Base", 207557382), Model("small", "Whisper Small", 639387718))
    val cpp = listOf(
        Model("base", "Whisper Base · Q5_1", 59707625, "cpp", "ggml-base-q5_1.bin", "422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898"),
        Model("base", "Whisper Base · F16", 147951465, "cpp", "ggml-base.bin", "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe"),
        Model("small", "Whisper Small · Q5_1", 190085487, "cpp", "ggml-small-q5_1.bin", "ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb"),
        Model("small", "Whisper Small · F16", 487601967, "cpp", "ggml-small.bin", "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b"),
        Model("tiny", "Whisper Tiny · Q5_1", 32152673, "cpp", "ggml-tiny-q5_1.bin", "818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7"),
        Model("tiny", "Whisper Tiny · F16", 77691713, "cpp", "ggml-tiny.bin", "be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21")
    )
    val supported = onnx + cpp
    fun byId(id: String): Model = supported.firstOrNull { it.id == id } ?: error("Modelo STT não suportado: use um Whisper multilíngue compatível instalado")
    fun detect(names: Set<String>): Model {
        val found = onnx.filter { names.containsAll(it.files) }
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
