package com.proxyslabs.haruna.diagnostic45

import android.app.Activity
import android.app.Instrumentation
import android.os.Build
import android.os.Bundle
import com.arm.aichat.AiChat
import com.arm.aichat.InferenceEngine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.util.UUID

/** Explicit adb instrumentation only. No Activity, chat, database, preference writes or user prompts. */
class CanonicalRunner : Instrumentation() {
    private lateinit var options: Bundle
    override fun onCreate(arguments: Bundle?) { super.onCreate(arguments); options = arguments ?: Bundle(); start() }
    override fun onStart() {
        val runId = options.getString("runId") ?: UUID.randomUUID().toString()
        require(runId.matches(Regex("[A-Za-z0-9_-]{1,80}")))
        val output = File(targetContext.cacheDir, "diagnostic46/$runId")
        var success = false
        var outputOwned = false
        try {
            check(!output.exists()) { "Evidence directory already exists" }
            check(output.mkdirs())
            outputOwned = true
            val root = targetContext.filesDir.canonicalFile
            val relative = requireNotNull(options.getString("model")) { "model is required" }
            require(relative == "diagnostic45.gguf")
            val expectedSha = requireNotNull(options.getString("expectedSha256")).lowercase()
            require(expectedSha.matches(Regex("[0-9a-f]{64}")))
            val expectedBytes = requireNotNull(options.getString("expectedBytes")).toLong()
            require(expectedBytes > 1024 * 1024)
            val model = File(root, relative).canonicalFile
            require(model.path.startsWith(root.path + File.separator) && model.isFile && model.extension.equals("gguf", true))
            require(model.length() == expectedBytes)
            model.inputStream().use { require(it.read() == 71 && it.read() == 71 && it.read() == 85 && it.read() == 70) }
            val probes = options.getString("probes", "").split(',').filter { it.isNotBlank() }.map { it.toInt() }.distinct().toIntArray()
            require(probes.size <= 2 && probes.all { it in 1..512 })
            val hash = MessageDigest.getInstance("SHA-256")
            model.inputStream().buffered().use { input ->
                val buffer = ByteArray(1024 * 1024)
                while (true) { val count = input.read(buffer); if (count < 0) break; hash.update(buffer, 0, count) }
            }
            val observedSha = hash.digest().joinToString("") { "%02x".format(it.toInt() and 255) }
            require(observedSha == expectedSha) { "GGUF SHA mismatch: no inference started" }
            fun fileSha(file: File): String {
                val digest = MessageDigest.getInstance("SHA-256")
                file.inputStream().buffered().use { input -> val buffer = ByteArray(131072); while (true) { val n = input.read(buffer); if (n < 0) break; digest.update(buffer, 0, n) } }
                return digest.digest().joinToString("") { "%02x".format(it.toInt() and 255) }
            }
            val info = JSONObject().put("schema", 45).put("modelFile", model.name).put("modelBytes", model.length())
                .put("modelSha256", observedSha).put("expectedModelSha256", expectedSha).put("expectedModelBytes", expectedBytes)
                .put("apkSha256", fileSha(File(targetContext.applicationInfo.sourceDir)))
                .put("testApkSha256", fileSha(File(context.applicationInfo.sourceDir)))
                .put("runId", runId)
                .put("manufacturer", Build.MANUFACTURER).put("deviceModel", Build.MODEL)
                .put("androidApi", Build.VERSION.SDK_INT).put("abis", Build.SUPPORTED_ABIS.joinToString(","))
            File(output, "runner.json").writeText(info.toString(2))
            val engine = AiChat.getInferenceEngine(targetContext.applicationContext)
            val result = runBlocking {
                val state = withTimeout(30_000) { engine.state.first { it is InferenceEngine.State.Initialized || it is InferenceEngine.State.Error } }
                check(state is InferenceEngine.State.Initialized)
                JSONObject(engine.runDiagnostic45(model.path, output.path, probes))
            }
            File(output, "result.json").writeText(result.toString(2))
            success = result.optBoolean("ok")
        } catch (failure: Throwable) {
            // Only a class name; exception messages can contain private file paths.
            if (outputOwned && output.isDirectory) File(output, "result.json").writeText(JSONObject().put("ok", false)
                .put("schema", 45).put("errorClass", failure.javaClass.simpleName).toString())
        }
        finish(if (success) Activity.RESULT_OK else Activity.RESULT_CANCELED,
            Bundle().apply { putString("stream", "HARUNA_DIAGNOSTIC_45 ${if (success) "OK" else "FAILED"}; export cache/diagnostic46/$runId") })
    }
}
