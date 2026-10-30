package com.proxyslabs.haruna

interface LlmBackend {
    data class Status(
        val available: Boolean,
        val modelLoaded: Boolean,
        val state: String,
        val modelName: String? = null,
        val error: String? = null,
        val displayName: String? = null,
        val modelState: String? = null
    )

    fun status(): Status
    fun contextMetrics(): Map<String, Int> = emptyMap()
    fun runtimeMetrics(): String = "{}"
    fun installedModelPath(): String? = null
    fun modelManagement(): String = "{}"
    fun mayAutoLoadModel(): Boolean = true
    fun autoLoadModel(localPath: String): Result<Unit> = loadModel(localPath)
    fun renameModel(localPath: String, displayName: String): Result<Unit> = Result.failure(UnsupportedOperationException())
    fun deleteInstalledModel(localPath: String): Result<Unit> = Result.failure(UnsupportedOperationException())
    fun subscribeStatus(listener: () -> Unit): () -> Unit = {}
    fun loadModel(localPath: String): Result<Unit>
    fun unloadModel(): Result<Unit>
    fun resetConversation(): Result<Unit>
    fun generate(
        requestId: String,
        payloadJson: String,
        onToken: (String) -> Unit,
        onComplete: () -> Unit,
        onError: (String, String) -> Unit
    )
    fun stop(requestId: String): Result<Unit>
}

