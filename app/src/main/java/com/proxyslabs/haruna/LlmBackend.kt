package com.proxyslabs.haruna

interface LlmBackend {
    data class Status(val available: Boolean, val modelLoaded: Boolean, val state: String, val modelName: String? = null, val error: String? = null)
    fun status(): Status
    fun loadModel(localPath: String): Result<Unit>
    fun unloadModel(): Result<Unit>
    fun generate(requestId: String, payloadJson: String, onToken: (String) -> Unit, onComplete: (String) -> Unit, onError: (String, String) -> Unit)
    fun stop(requestId: String): Result<Unit>
}
