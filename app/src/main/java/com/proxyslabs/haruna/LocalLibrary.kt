package com.proxyslabs.haruna

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream

class LocalLibrary(private val context: Context) {
    companion object {
        const val PREFS = "haruna_runtime"
        const val PRIMARY_MODEL = "primary_model_path"
        const val LAST_MODEL = "last_model_path"
    }

    val modelsDir = File(context.filesDir, "models").apply { mkdirs() }
    val attachmentsDir = File(context.filesDir, "attachments").apply { mkdirs() }
    val documentsDir = File(context.filesDir, "documents").apply { mkdirs() }

    private val prefs get() = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun displayName(uri: Uri): String? {
        var c: android.database.Cursor? = null
        return try {
            c = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
            if (c != null && c.moveToFirst()) c.getString(0) else null
        } finally { c?.close() }
    }

    private fun safe(name: String) = name.replace(Regex("[^A-Za-z0-9._-]"), "_").take(180)

    fun importModel(uri: Uri): File {
        val name = displayName(uri) ?: "haruna-model.gguf"
        require(name.endsWith(".gguf", true)) { "Selecione um arquivo .gguf" }
        val target = uniqueTarget(modelsDir, safe(name))
        copyAtomic(uri, target)
        if (prefs.getString(PRIMARY_MODEL, null) == null) prefs.edit().putString(PRIMARY_MODEL, target.absolutePath).apply()
        return target
    }

    fun importAttachment(uri: Uri): File {
        val name = safe(displayName(uri) ?: "arquivo")
        val target = uniqueTarget(attachmentsDir, name)
        copyAtomic(uri, target)
        return target
    }

    private fun uniqueTarget(dir: File, name: String): File {
        var out = File(dir, name)
        if (!out.exists()) return out
        val dot = name.lastIndexOf('.')
        val stem = if (dot > 0) name.substring(0, dot) else name
        val ext = if (dot > 0) name.substring(dot) else ""
        var n = 2
        while (out.exists()) { out = File(dir, "${stem}_$n$ext"); n++ }
        return out
    }

    private fun copyAtomic(uri: Uri, target: File) {
        val tmp = File(target.parentFile, target.name + ".part")
        context.contentResolver.openInputStream(uri).use { input ->
            requireNotNull(input) { "Não foi possível abrir o arquivo" }
            FileOutputStream(tmp).use { out -> input.copyTo(out, 1024 * 1024) }
        }
        require(tmp.length() > 0) { "Arquivo vazio" }
        require(tmp.renameTo(target)) { "Não foi possível salvar o arquivo" }
    }

    fun modelsJson(activePath: String?): String {
        val primary = prefs.getString(PRIMARY_MODEL, null)
        val arr = JSONArray()
        modelsDir.listFiles()?.filter { it.isFile && it.extension.equals("gguf", true) }?.sortedBy { it.name.lowercase() }?.forEach { f ->
            arr.put(JSONObject().put("name", f.name).put("path", f.absolutePath).put("bytes", f.length()).put("primary", f.absolutePath == primary).put("active", f.absolutePath == activePath))
        }
        return JSONObject().put("models", arr).put("primaryPath", primary).toString()
    }

    fun setPrimary(path: String) {
        val f = File(path)
        require(f.parentFile?.canonicalFile == modelsDir.canonicalFile && f.isFile) { "Modelo inválido" }
        prefs.edit().putString(PRIMARY_MODEL, f.absolutePath).apply()
    }

    fun primaryModel(): File? = prefs.getString(PRIMARY_MODEL, null)?.let(::File)?.takeIf { it.isFile }

    fun rememberActive(file: File) = prefs.edit().putString(LAST_MODEL, file.absolutePath).apply()

    fun deleteModel(path: String) {
        val f = File(path)
        require(f.parentFile?.canonicalFile == modelsDir.canonicalFile && f.isFile) { "Modelo inválido" }
        val wasPrimary = prefs.getString(PRIMARY_MODEL, null) == f.absolutePath
        require(f.delete()) { "Não foi possível excluir o modelo" }
        if (wasPrimary) {
            val next = modelsDir.listFiles()?.firstOrNull { it.isFile && it.extension.equals("gguf", true) }
            prefs.edit().apply { if (next != null) putString(PRIMARY_MODEL, next.absolutePath) else remove(PRIMARY_MODEL) }.apply()
        }
    }
}