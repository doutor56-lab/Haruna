package com.proxyslabs.haruna.image

/** CPU-only JNI adapter to the separately linked, LGPL Nezumi engine. */
internal object NezumiImageNative {
    val available: Boolean = runCatching {
        System.loadLibrary("haruna_nezumi_image")
        true
    }.getOrDefault(false)

    /** Returns an opaque native engine handle, or 0 on failure. */
    external fun create(): Long
    external fun destroy(handle: Long)

    /** CPU-only for the initial integration; never enable OpenCL implicitly. */
    external fun loadCpu(handle: Long, modelDirectory: String): Boolean
    external fun unload(handle: Long)
    external fun isLoaded(handle: Long): Boolean

    /**
     * Generate an RGB888 image (512 x 512) and return bytes; null on failure.
     * The native adapter must free MnnSdImage exactly once before returning.
     */
    external fun generateRgb(
        handle: Long,
        prompt: String,
        negativePrompt: String,
        steps: Int,
        seed: Long
    ): ByteArray?

    external fun cancel(handle: Long)
    external fun lastError(): String
    external fun progress(handle: Long): IntArray
    external fun validateFiles(paths: Array<String>): Boolean
}

