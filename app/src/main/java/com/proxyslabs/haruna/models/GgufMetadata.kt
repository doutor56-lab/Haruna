package com.proxyslabs.haruna.models

import java.io.File
import java.io.RandomAccessFile

/** Reads a bounded metadata prefix only. Does not allocate tensors, tokenizer arrays or weights. */
object GgufMetadata {
    private const val LIMIT = 16L * 1024 * 1024
    fun read(file: File): Map<String, String> = runCatching {
        RandomAccessFile(file, "r").use { input ->
            fun u32(): Long = Integer.reverseBytes(input.readInt()).toLong() and 0xffffffffL
            fun u64(): Long = java.lang.Long.reverseBytes(input.readLong()).also { require(it >= 0) }
            fun skip(bytes: Long) {
                require(bytes >= 0 && bytes <= LIMIT && input.filePointer <= minOf(LIMIT, input.length()) - bytes)
                input.seek(input.filePointer + bytes)
            }
            fun string(max: Int, keep: Boolean): String {
                val length = u64()
                require(length <= LIMIT)
                if (!keep || length > max) { skip(length); return "" }
                require(input.filePointer + length <= minOf(LIMIT, input.length()))
                return ByteArray(length.toInt()).also { input.readFully(it) }.toString(Charsets.UTF_8)
            }
            fun width(type: Long): Int = when (type.toInt()) { 0, 1, 7 -> 1; 2, 3 -> 2; 4, 5, 6 -> 4; 10, 11, 12 -> 8; else -> error("Tipo GGUF não escalar") }
            require(input.readInt() == 0x47475546) { "Cabeçalho GGUF inválido" }
            require(u32() in 2L..3L) { "Versão GGUF não suportada para metadados" }
            u64() // tensors, not read
            val count = u64(); require(count <= 100_000)
            val wanted = setOf("general.name", "general.basename", "general.architecture", "general.size_label", "general.file_type")
            val result = linkedMapOf<String, String>()
            for (index in 0 until count) {
                if (input.filePointer > LIMIT - 16) break
                try {
                    val key = string(512, true); val type = u32()
                    when (type.toInt()) {
                        8 -> { val value = string(4096, key in wanted); if (key in wanted && value.isNotBlank()) result[key] = value }
                        9 -> {
                            val element = u32(); val size = u64(); require(size <= LIMIT)
                            if (element == 8L) repeat(size.toInt()) { string(0, false) }
                            else { val bytes = Math.multiplyExact(size, width(element).toLong()); skip(bytes) }
                        }
                        else -> {
                            val bytes = width(type)
                            if (key == "general.file_type" && type == 4L) result[key] = u32().toString() else skip(bytes.toLong())
                        }
                    }
                } catch (_: Exception) { break } // Later metadata may exceed the observation budget.
            }
            result
        }
    }.getOrDefault(emptyMap())
}

/** Centralized naming/capabilities. Reference families are not an allowlist. */
object ModelProfiles {
    data class Profile(val displayName: String, val key: String,
        val maxTokens: Int? = null, val thinking: Boolean? = null)

    fun defaults(key: String): Profile = when (key) {
        "qwen35" -> Profile("Qwen3.5", key)
        "phi4-mini" -> Profile("Phi-4", key)
        else -> Profile("Modelo local", "generic")
    }

    fun resolve(metadata: Map<String, String>, fileName: String, custom: String? = null): Profile {
        fun normalized(value: String) = value.lowercase().filter { it.isLetterOrDigit() }
        val architecture = normalized(metadata["general.architecture"].orEmpty())
        val names = listOfNotNull(metadata["general.name"], metadata["general.basename"]).map(::normalized)
        val profile = when {
            architecture in setOf("qwen35", "qwen35moe") || names.any { it.startsWith("qwen35") } -> defaults("qwen35")
            names.any { it.startsWith("phi4mini") || it.startsWith("microsoftphi4mini") } -> defaults("phi4-mini")
            else -> Profile((metadata["general.name"] ?: metadata["general.basename"] ?: fileName.substringBeforeLast('.')).take(40), "generic")
        }
        val name = (custom?.takeIf { it.isNotBlank() } ?: profile.displayName).filterNot { it.isISOControl() }.trim().take(40)
        return profile.copy(displayName = name.ifBlank { "Modelo local" })
    }

    // Public llama_ftype constants in the pinned llama.h. Unknown types remain explicit numbers.
    fun quantization(type: String?): String? = when (type?.toIntOrNull()) {
        null -> null; 0 -> "F32"; 1 -> "F16"; 2 -> "Q4_0"; 3 -> "Q4_1"; 7 -> "Q8_0"
        8 -> "Q5_0"; 9 -> "Q5_1"; 10 -> "Q2_K"; 11 -> "Q3_K_S"; 12 -> "Q3_K_M"; 13 -> "Q3_K_L"
        14 -> "Q4_K_S"; 15 -> "Q4_K_M"; 16 -> "Q5_K_S"; 17 -> "Q5_K_M"; 18 -> "Q6_K"
        else -> "Tipo GGUF $type"
    }
}
