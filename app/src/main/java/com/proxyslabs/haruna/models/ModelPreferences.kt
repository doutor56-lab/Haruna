package com.proxyslabs.haruna.models

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/** One atomic journal in the existing preference namespace; no chat/document storage. */
class ModelPreferences(context: Context) : ModelStore {
    private val contextFiles = context.applicationContext.filesDir
    private val prefs = context.applicationContext.getSharedPreferences("haruna_runtime", Context.MODE_PRIVATE)
    private val cache = ConcurrentHashMap<String, Pair<String, ModelDescriptor>>()

    override fun read(): ModelRecord {
        val raw = prefs.getString("model_session_v1", null) ?: run {
            val path = prefs.getString("last_model_path", null) ?: prefs.getString("primary_model_path", null)
            val file = path?.let(::File)
            val previous = file?.takeIf { it.isFile && it.parentFile?.canonicalFile == File(contextFiles, "models").canonicalFile }
                ?.let { ModelDescriptor(it.canonicalPath, it.name, it.name.substringBeforeLast('.').take(40), it.length()) }
            return ModelRecord(selected = previous, lastSuccessful = previous)
        }
        return runCatching {
            val json = JSONObject(raw)
            ModelRecord(json.optJSONObject("selected")?.let(::descriptor), json.optJSONObject("lastSuccessful")?.let(::descriptor),
                json.optJSONObject("pending")?.let(::descriptor), json.stringOrNull("blockedPath"),
                json.stringOrNull("error"), json.optBoolean("autoload", true))
        }.getOrElse { ModelRecord(blockedPath = "recovery", error = "Estado de modelos ilegível. Escolha um modelo para continuar.") }
    }

    override fun write(record: ModelRecord) {
        val value = JSONObject().put("selected", record.selected?.let(::json)).put("lastSuccessful", record.lastSuccessful?.let(::json))
            .put("pending", record.pending?.let(::json)).put("blockedPath", record.blockedPath).put("error", record.error).put("autoload", record.autoload)
        val editor = prefs.edit().putString("model_session_v1", value.toString())
        record.lastSuccessful?.let { editor.putString("last_model_path", it.path) }
        check(editor.commit()) { "Não foi possível persistir o estado dos modelos" }
    }

    fun describe(file: File): ModelDescriptor {
        val key = file.canonicalPath
        val custom = prefs.getString("model_display:$key", null)
        val signature = "${file.length()}:${file.lastModified()}:$custom"
        cache[key]?.takeIf { it.first == signature }?.let { return it.second }
        val metadata = GgufMetadata.read(file)
        val profile = ModelProfiles.resolve(metadata, file.name, custom)
        val value = ModelDescriptor(key, file.name, profile.displayName, file.length(), metadata["general.architecture"],
            ModelProfiles.quantization(metadata["general.file_type"]), profile.key)
        cache[key] = signature to value
        return value
    }

    fun rename(file: File, name: String) {
        require(name.isNotBlank() && name.length <= 40 && name.none { it.isISOControl() }) { "Use um nome de 1 a 40 caracteres" }
        check(prefs.edit().putString("model_display:${file.canonicalPath}", name.trim()).commit()) { "Não foi possível salvar o nome" }
        cache.remove(file.canonicalPath)
    }

    companion object {
        fun json(value: ModelDescriptor): JSONObject = JSONObject().put("path", value.path).put("fileName", value.fileName)
            .put("displayName", value.displayName).put("bytes", value.bytes).put("architecture", value.architecture)
            .put("quantization", value.quantization).put("profile", value.profile)
        private fun descriptor(json: JSONObject) = ModelDescriptor(json.getString("path"), json.getString("fileName"),
            json.getString("displayName"), json.optLong("bytes"), json.stringOrNull("architecture"), json.stringOrNull("quantization"), json.optString("profile", "generic"))
    }
}

private fun JSONObject.stringOrNull(key: String) = if (isNull(key)) null else optString(key).takeIf { it.isNotBlank() }
