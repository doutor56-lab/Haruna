package com.proxyslabs.haruna.image

import java.io.Closeable
import java.io.File

/**
 * Owns a single native SD1.5 or SDXL session.
 *
 * Call from a dedicated background thread. The caller must coordinate with
 * the app's GGUF/image memory lease before opening this engine.
 */
internal class SafetensorsSession private constructor(@Volatile private var handle: Long, val sdxl:Boolean) : Closeable {
    companion object {
        fun open(checkpoint: File, cancelled:()->Boolean={false}, onCreated:(SafetensorsSession)->Unit={}): SafetensorsSession {
            require(SafetensorsImageNative.available) {
                "Motor safetensors não incluído neste APK"
            }
            require(checkpoint.isFile && checkpoint.extension.equals("safetensors", true)) {
                "Selecione um arquivo .safetensors válido"
            }
            val inspection = SafetensorsInspector.inspect(checkpoint)
            require(inspection.sd15Compatible||inspection.sdxlCompatible) {
                "Checkpoint SD1.5/SDXL completo não identificado; carregamento bloqueado"
            }
            val id = SafetensorsImageNative.create()
            check(id != 0L) { SafetensorsImageNative.lastError() }
            val session=SafetensorsSession(id,inspection.sdxlCompatible)
            try {
                onCreated(session)
                check(!cancelled()){ "Carregamento cancelado" }
                check(SafetensorsImageNative.loadSd15(id, checkpoint.absolutePath,inspection.sdxlCompatible)) {
                    SafetensorsImageNative.lastError()
                }
                check(!cancelled()){ "Carregamento cancelado" }
                return session
            } catch (failure: Throwable) {
                session.close()
                throw failure
            }
        }
    }

    @Synchronized
    fun generate(
        prompt: String,
        negativePrompt: String,
        destination: File,
        width: Int = 512,
        height: Int = 512,
        steps: Int = 20,
        seed: Long = -1
    ) {
        check(handle != 0L) { "Sessão já encerrada" }
        require(prompt.isNotBlank()) { "Prompt vazio" }
        require(width in 256..1024 && width % 64 == 0 &&
            height in 256..1024 && height % 64 == 0) { "Resolução inválida" }
        require(steps in 1..50) { "Passos fora dos limites" }
        require(destination.parentFile?.isDirectory == true) { "Pasta de destino inexistente" }
        check(SafetensorsImageNative.generatePng(
            handle, prompt, negativePrompt, destination.absolutePath,
            width, height, steps, seed
        )) { SafetensorsImageNative.lastError() }
    }

    fun progress():IntArray {val id=handle;return if(id==0L)intArrayOf(0,0,0) else SafetensorsImageNative.progress(id)}

    // Native cancel must remain callable while generate() holds the session monitor.
    fun cancel() {
        val id = handle
        if (id != 0L) SafetensorsImageNative.cancel(id)
    }

    @Synchronized
    override fun close() {
        val id = handle
        handle = 0L
        if (id != 0L) SafetensorsImageNative.destroy(id)
    }
}
