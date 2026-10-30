package com.proxyslabs.haruna.speech

import java.nio.ByteBuffer
import java.nio.ByteOrder

/** A cheap check BEFORE copying. Complete official-file SHA-256 is required before native use. */
object WhisperFileHeader {
    fun family(bytes: ByteArray): String {
        require(bytes.size >= 48) { "O modelo parece estar incompleto ou corrompido." }
        val data = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        require(data.int == 0x67676d6c) { "Este arquivo não é um modelo de reconhecimento compatível. GGUF de LLM não é Whisper." }
        val h = IntArray(11) { data.int }
        val family = when (h[4]) { 4 -> "tiny"; 6 -> "base"; 12 -> "small"; else -> error("Nesta versão, importe Whisper Tiny, Base ou Small multilíngue.") }
        val width = when (family) { "tiny" -> 384; "base" -> 512; else -> 768 }
        val heads = width / 64
        require(h[0] == 51865 && h[1] == 1500 && h[2] == width && h[3] == heads &&
            h[5] == 448 && h[6] == width && h[7] == heads && h[8] == h[4] && h[9] == 80 &&
            h[10] % 1000 in setOf(1, 9)) { "Modelo Whisper incompatível. Use a versão multilíngue oficial F16 ou Q5_1; variantes .en não são suportadas." }
        return family
    }
}
