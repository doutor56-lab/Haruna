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

/** Explicit adb instrumentation only. No Activity, chat, database, preference writes or user prompts. */
class CanonicalRunner : Instrumentation() {
    private lateinit var options: Bundle
    override fun onCreate(arguments: Bundle?) { super.onCreate(arguments); options = arguments ?: Bundle(); start() }
    override fun onStart() {
        val output = File(targetContext.cacheDir, "diagnostic45")
        var success = false
        try {
            if (output.exists()) check(output.deleteRecursively())
            check(output.mkdirs())
            val root = targetContext.filesDir.canonicalFile
            val relative = requireNotNull(options.getString("model")) { "model is required" }.removePrefix("files/")
            val model = File(root, relative).canonicalFile
            require(model.path.startsWith(root.path + File.separator) && model.isFile && model.extension.equals("gguf", true))
            val probes = options.getString("probes", "").split(',').filter { it.isNotBlank() }.map { it.toInt() }.distinct().toIntArray()
            require(probes.size <= 2 && probes.all { it in 1..512 })
            val hash = MessageDigest.getInstance("SHA-256")
            model.inputStream().buffered().use { input ->
                val buffer = ByteArray(1024 * 1024)
                while (true) { val count = input.read(buffer); if (count < 0) break; hash.update(buffer, 0, count) }
            }
            val info = JSONObject().put("schema", 45).put("modelFile", model.name).put("modelBytes", model.length())
                .put("modelSha256", hash.digest().joinToString("") { "%02x".format(it.toInt() and 255) })
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
            if (output.isDirectory) File(output, "result.json").writeText(JSONObject().put("ok", false)
                .put("schema", 45).put("errorClass", failure.javaClass.simpleName).toString())
        }
        finish(if (success) Activity.RESULT_OK else Activity.RESULT_CANCELED,
            Bundle().apply { putString("stream", "HARUNA_DIAGNOSTIC_45 ${if (success) "OK" else "FAILED"}; export cache/diagnostic45") })
    }
}
