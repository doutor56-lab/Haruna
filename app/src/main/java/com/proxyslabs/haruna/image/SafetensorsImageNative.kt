package com.proxyslabs.haruna.image

/**
 * Optional CPU backend for SD 1.5 safetensors checkpoints.
 *
 * The native library is deliberately NOT bundled until the Android ARM64
 * stable-diffusion.cpp build and its dependencies have been verified.
 * Existing MNN / Nezumi engines must remain independent.
 */
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
}
