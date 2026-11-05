package com.proxyslabs.haruna.image

import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

class ImageArchiveFormatTest {
    private fun archive(vararg names: String): ByteArrayInputStream {
        val bytes = ByteArrayOutputStream()
        ZipOutputStream(bytes).use { zip ->
            names.forEach { name ->
                zip.putNextEntry(ZipEntry(name))
                zip.write(byteArrayOf(1))
                zip.closeEntry()
            }
        }
        return ByteArrayInputStream(bytes.toByteArray())
    }

    @Test fun detectsHarunaPackage() {
        val result = ImageArchiveFormat.inspect(archive(
            "haruna-image-model.json", "text_encoder.mnn", "unet.mnn",
            "vae_decoder.mnn", "tokenizer.mtok"))
        assertEquals(ImageArchiveFormat.Kind.HARUNA_SD15, result.kind)
    }

    @Test fun detectsNezumiPackageInFolder() {
        val result = ImageArchiveFormat.inspect(archive(
            "Anything-V5/clip_v2.mnn", "Anything-V5/unet.mnn",
            "Anything-V5/vae_decoder_fp16.mnn", "Anything-V5/tokenizer.json"))
        assertEquals(ImageArchiveFormat.Kind.NEZUMI_SD15, result.kind)
    }

    @Test fun rejectsUnsafePath() {
        val result = ImageArchiveFormat.inspect(archive(
            "../clip_v2.mnn", "unet.mnn", "vae_decoder_fp16.mnn", "tokenizer.json"))
        assertEquals(ImageArchiveFormat.Kind.UNKNOWN, result.kind)
    }
}
