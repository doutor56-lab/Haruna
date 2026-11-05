package com.proxyslabs.haruna.image

import java.io.InputStream
import java.util.zip.ZipInputStream

/**
 * Non-destructive identification of image-model archives.
 *
 * Detection is separate from installation: Nezumi packages use their own engine.
 */
object ImageArchiveFormat {
    enum class Kind { HARUNA_SD15, NEZUMI_SD15, UNKNOWN }
    data class Inspection(val kind: Kind, val reason: String, val files: Set<String>)

    fun inspect(input: InputStream): Inspection {
        val entries = linkedSetOf<String>()
        ZipInputStream(input.buffered()).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                val path = entry.name.replace('\\', '/')
                if (path.startsWith("/") || path.split('/').any { it == ".." }) {
                    return Inspection(Kind.UNKNOWN, "Caminho inseguro no ZIP", entries)
                }
                if (!entry.isDirectory) {
                    if (!entries.add(path)) {
                        return Inspection(Kind.UNKNOWN, "Entrada duplicada no ZIP", entries)
                    }
                    if (entries.size > 128) {
                        return Inspection(Kind.UNKNOWN, "Entradas demais para identificação", entries)
                    }
                }
                zip.closeEntry()
            }
        }
        // Permit exactly one common directory prefix for detection, not extraction.
        val normalized = entries.let { files ->
            val prefixes = files.map { it.substringBefore('/', "") }.toSet()
            if (prefixes.size == 1 && prefixes.first().isNotEmpty() &&
                files.all { it.count { c -> c == '/' } == 1 }) {
                files.mapTo(linkedSetOf()) { it.substringAfter('/') }
            } else files
        }
        val haruna = setOf("haruna-image-model.json", "text_encoder.mnn",
            "unet.mnn", "vae_decoder.mnn", "tokenizer.mtok")
        if (normalized.containsAll(haruna)) {
            return Inspection(Kind.HARUNA_SD15, "Pacote Haruna SD1.5", normalized)
        }
        val clip = normalized.any { it in setOf("clip.mnn", "clip_v2.mnn", "clip_fp16.mnn", "clip1.mnn") }
        val unet = normalized.any { it in setOf("unet.mnn", "unet_asym_block32.mnn", "unet_min.bin") }
        val vae = normalized.any { it in setOf("vae_decoder.mnn", "vae_decoder_fp16.mnn", "vae_decoder_min.bin") }
        val tokenizer = "tokenizer.json" in normalized
        if (clip && unet && vae && tokenizer) {
            return Inspection(Kind.NEZUMI_SD15,
                "Pacote Nezumi SD1.5 identificado; instalação exige validação completa",
                normalized)
        }
        return Inspection(Kind.UNKNOWN, "Componentes de modelo não reconhecidos", normalized)
    }
}

