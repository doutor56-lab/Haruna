package com.proxyslabs.haruna.image

/** Independent CPU-only stable-diffusion.cpp JNI; no shared GGML with GGUF/STT. */
internal object SafetensorsImageNative {
    val available: Boolean by lazy {
        runCatching {
            System.loadLibrary("haruna_sd_safetensors")
            true
        }.getOrDefault(false)
    }

    /** Returns 0 on failure; the caller owns and must destroy the handle. */
    external fun create(): Long
    external fun loadSd15(handle: Long, checkpointPath: String): Boolean
    external fun generatePng(
        handle: Long,
        prompt: String,
        negativePrompt: String,
        outputPath: String,
        width: Int,
        height: Int,
        steps: Int,
        seed: Long
    ): Boolean
    external fun cancel(handle: Long)
    external fun destroy(handle: Long)
    external fun lastError(): String
    external fun progress(handle: Long): IntArray
}
