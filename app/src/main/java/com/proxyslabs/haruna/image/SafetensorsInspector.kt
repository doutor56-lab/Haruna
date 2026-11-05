package com.proxyslabs.haruna.image

import org.json.JSONObject
import java.io.File
import java.io.RandomAccessFile
import java.nio.charset.StandardCharsets

/**
 * Safetensors metadata inspection only. This does not load tensors or imply
 * that the installed image engine can execute the checkpoint.
 *
 * Format: 8-byte little-endian unsigned JSON header length, UTF-8 JSON
 * header, then a contiguous binary tensor data region.
 */
object SafetensorsInspector {
    private const val MAX_HEADER_BYTES = 16L * 1024 * 1024
    data class Result(val tensorCount: Int, val tensorBytes: Long, val fileBytes: Long)

    fun inspect(file: File): Result {
        require(file.isFile && file.length() >= 10) { "Arquivo safetensors vazio ou inválido" }
        RandomAccessFile(file, "r").use { raf ->
            val length = file.length()
            val lengthBytes = ByteArray(8)
            raf.readFully(lengthBytes)
            // Reject unsigned lengths that cannot fit in a positive signed Long.
            require((lengthBytes[7].toInt() and 0x80) == 0) { "Cabeçalho inválido" }
            var headerLength = 0L
            for (i in 0..7) headerLength = headerLength or
                ((lengthBytes[i].toLong() and 255L) shl (i * 8))
            require(headerLength in 2..MAX_HEADER_BYTES && headerLength <= length - 8) {
                "Cabeçalho safetensors inválido ou muito grande"
            }
            val header = ByteArray(headerLength.toInt())
            raf.readFully(header)
            val json = JSONObject(String(header, StandardCharsets.UTF_8))
            val dataLength = length - 8 - headerLength
            var tensorCount = 0
            var maxEnd = 0L
            for (name in json.keys()) {
                if (name == "__metadata__") continue
                val tensor = json.getJSONObject(name)
                require(tensor.getString("dtype").isNotBlank()) { "Tensor sem tipo" }
                val shape = tensor.getJSONArray("shape")
                for (i in 0 until shape.length()) require(shape.getLong(i) >= 0) { "Dimensão inválida" }
                val offsets = tensor.getJSONArray("data_offsets")
                require(offsets.length() == 2) { "Offsets inválidos" }
                val start = offsets.getLong(0)
                val end = offsets.getLong(1)
                require(start >= 0 && end >= start && end <= dataLength) {
                    "Tensor fora dos limites do arquivo"
                }
                if (end > maxEnd) maxEnd = end
                tensorCount++
            }
            require(tensorCount > 0) { "Nenhum tensor encontrado" }
            return Result(tensorCount, maxEnd, length)
        }
    }
}
