package com.proxyslabs.haruna.image

import org.json.JSONObject
import java.io.File
import java.io.RandomAccessFile
import java.nio.charset.StandardCharsets

/**
 * Bounded, metadata-only validation of a safetensors file.
 * This does not load model weights or establish SD1.5 compatibility.
 */
object SafetensorsInspector {
    private const val MAX_HEADER_BYTES = 16L * 1024 * 1024
    data class Result(val tensorCount: Int, val tensorBytes: Long, val fileBytes: Long)
    private data class Span(val start: Long, val end: Long)

    private val bitsPerElement = mapOf(
        "BOOL" to 8, "U8" to 8, "I8" to 8, "F8_E5M2" to 8,
        "F8_E4M3" to 8, "F8_E8M0" to 8,
        "I16" to 16, "U16" to 16, "F16" to 16, "BF16" to 16,
        "I32" to 32, "U32" to 32, "F32" to 32,
        "I64" to 64, "U64" to 64, "F64" to 64,
        "F4" to 4, "F6_E2M3" to 6, "F6_E3M2" to 6
    )

    fun inspect(file: File): Result {
        require(file.isFile && file.length() >= 10) { "Arquivo safetensors vazio ou inválido" }
        RandomAccessFile(file, "r").use { raf ->
            val fileBytes = raf.length()
            val lengthBytes = ByteArray(8)
            raf.readFully(lengthBytes)
            require((lengthBytes[7].toInt() and 0x80) == 0) { "Cabeçalho inválido" }
            var headerBytes = 0L
            for (i in 0..7) {
                headerBytes = headerBytes or ((lengthBytes[i].toLong() and 255L) shl (8 * i))
            }
            require(headerBytes in 2..MAX_HEADER_BYTES && headerBytes <= fileBytes - 8) {
                "Cabeçalho safetensors inválido ou muito grande"
            }
            val header = ByteArray(headerBytes.toInt())
            raf.readFully(header)
            val json = JSONObject(String(header, StandardCharsets.UTF_8))
            val dataBytes = fileBytes - 8 - headerBytes
            val spans = mutableListOf<Span>()
            for (name in json.keys()) {
                if (name == "__metadata__") {
                    json.getJSONObject(name)
                    continue
                }
                val tensor = json.getJSONObject(name)
                val bits = bitsPerElement[tensor.getString("dtype")]
                    ?: throw IllegalArgumentException("Tipo de tensor não reconhecido")
                val shape = tensor.getJSONArray("shape")
                var elements = 1L
                for (i in 0 until shape.length()) {
                    val dimension = shape.getLong(i)
                    require(dimension >= 0) { "Dimensão inválida" }
                    elements = Math.multiplyExact(elements, dimension)
                }
                val expectedBits = Math.multiplyExact(elements, bits.toLong())
                val expectedBytes = Math.addExact(expectedBits, 7) / 8
                val offsets = tensor.getJSONArray("data_offsets")
                require(offsets.length() == 2) { "Offsets inválidos" }
                val start = offsets.getLong(0)
                val end = offsets.getLong(1)
                require(start >= 0 && end >= start && end <= dataBytes) {
                    "Tensor fora dos limites do arquivo"
                }
                require(end - start == expectedBytes) { "Tamanho do tensor não corresponde ao formato" }
                spans.add(Span(start, end))
            }
            require(spans.isNotEmpty()) { "Nenhum tensor encontrado" }
            spans.sortWith(compareBy<Span> { it.start }.thenBy { it.end })
            var cursor = 0L
            for (span in spans) {
                require(span.start == cursor) { "Tensores sobrepostos ou dados não contíguos" }
                cursor = span.end
            }
            require(cursor == dataBytes) { "Dados extras ou truncados no arquivo" }
            return Result(spans.size, dataBytes, fileBytes)
        }
    }
}
