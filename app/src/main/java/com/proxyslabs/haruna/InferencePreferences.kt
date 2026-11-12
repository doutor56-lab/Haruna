package com.proxyslabs.haruna

import org.json.JSONObject

/** Per-model settings; separate from DEBUG experiments and the assistant identity. */
object InferencePreferences {
    fun resolve(identity: String, saved: JSONObject? = null): JSONObject {
        val smol = Regex("smol[ _-]?lm[ _-]?3", RegexOption.IGNORE_CASE).containsMatchIn(identity)
        val defaults = JSONObject().put("profile", if (smol) "smollm3" else "haruna")
            .put("temperature", if (smol) 0.6 else 0.3).put("topK", 40).put("topP", 0.95).put("minP", 0.05)
            .put("repeat", 1.0).put("presence", 0.0).put("frequency", 0.0).put("seed", -1L)
            .put("maxTokens", 1024).put("threads", 0).put("threadsBatch", 0)
            .put("nCtx", 8192).put("nBatch", 512).put("nUbatch", 512).put("flashAttention", "auto")
        if (saved != null) {
            val valid = validate(saved)
            valid.keys().forEach { key -> defaults.put(key, valid.get(key)) }
            defaults.put("profile", "custom")
        }
        return defaults
    }
    fun validate(value: JSONObject): JSONObject {
        val result = JSONObject()
        fun number(key: String, min: Double, max: Double, integer: Boolean = false): Double {
            val raw = value.get(key)
            require(raw is Number) { "$key deve ser numérico" }
            val n = raw.toDouble()
            require(n.isFinite() && n >= min && n <= max && (!integer || n == kotlin.math.floor(n))) { "Valor inválido: $key" }
            result.put(key, if (integer) n.toLong() else n)
            return n
        }
        number("temperature", 0.0, 2.0); number("topK", 0.0, 1000.0, true)
        number("topP", 0.0001, 1.0); number("minP", 0.0, 1.0)
        number("repeat", 0.5, 2.0); number("presence", -2.0, 2.0); number("frequency", -2.0, 2.0)
        number("seed", -1.0, 4294967294.0, true); number("maxTokens", 16.0, 4096.0, true)
        number("threads", 0.0, 16.0, true); number("threadsBatch", 0.0, 16.0, true)
        val ctx = number("nCtx", 1024.0, 8192.0, true).toInt()
        require(ctx in setOf(1024, 2048, 4096, 8192)) { "Contexto não suportado" }
        require(value.getInt("maxTokens") <= ctx - 256) { "Reserve ao menos 256 tokens de contexto para a entrada; reduza a saída ou aumente o contexto" }
        val batch = number("nBatch", 32.0, 1024.0, true)
        val ubatch = number("nUbatch", 32.0, 512.0, true)
        require(ubatch <= batch && batch <= ctx) { "Use microbatch ≤ batch ≤ contexto" }
        val flash = value.getString("flashAttention")
        require(flash in setOf("auto", "off", "on")) { "Flash Attention inválida" }
        result.put("flashAttention", flash)
        return result
    }
}
