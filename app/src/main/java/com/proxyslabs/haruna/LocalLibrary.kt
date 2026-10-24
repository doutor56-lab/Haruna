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

    data class CopyProgress(val copiedBytes: Long, val totalBytes: Long?)

    val modelsDir = File(context.filesDir, "models").apply { mkdirs() }
    val attachmentsDir = File(context.filesDir, "attachments").apply { mkdirs() }
    val documentsDir = File(context.filesDir, "documents").apply { mkdirs() }

    private val prefs get() = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun displayName(uri: Uri): String? {
        var cursor: android.database.Cursor? = null
        return try {
            cursor = context.contentResolver.query(
                uri,
                arrayOf(OpenableColumns.DISPLAY_NAME),
                null,
                null,
                null
            )
            if (cursor != null && cursor.moveToFirst()) cursor.getString(0) else null
        } finally {
            cursor?.close()
        }
    }

    fun contentLength(uri: Uri): Long? {
        var cursor: android.database.Cursor? = null
        return try {
            cursor = context.contentResolver.query(
                uri,
                arrayOf(OpenableColumns.SIZE),
                null,
                null,
                null
            )
            if (cursor != null && cursor.moveToFirst()) {
                cursor.getLong(0).takeIf { it >= 0 }
            } else {
                null
            }
        } catch (_: Exception) {
            null
        } finally {
            cursor?.close()
        }
    }

    private fun safe(name: String): String =
        name.replace(Regex("[^A-Za-z0-9._-]"), "_").take(180)

    private fun registerModel(target: File): File {
        if (prefs.getString(PRIMARY_MODEL, null) == null) {
            prefs.edit().putString(PRIMARY_MODEL, target.absolutePath).apply()
        }
        return target
    }

    fun importModel(uri: Uri, onProgress: ((CopyProgress) -> Unit)? = null): File {
        val name = displayName(uri) ?: "haruna-model.gguf"
        require(name.endsWith(".gguf", true)) { "Selecione um arquivo .gguf" }
        val target = uniqueTarget(modelsDir, safe(name))
        copyAtomic(uri, target, onProgress)
        return registerModel(target)
    }

    fun importDownloadedModel(
        name: String,
        input: java.io.InputStream,
        totalBytes: Long?,
        onProgress: ((CopyProgress) -> Unit)? = null
    ): File {
        require(name.endsWith(".gguf", true)) { "Modelo recomendado inválido" }
        val target = uniqueTarget(modelsDir, safe(name))
        val tmp = File(target.parentFile, target.name + ".part")

        try {
            FileOutputStream(tmp).use { out ->
                val buffer = ByteArray(1024 * 1024)
                var copied = 0L
                var lastPercent = -1

                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    out.write(buffer, 0, read)
                    copied += read

                    val percent = totalBytes
                        ?.takeIf { it > 0 }
                        ?.let { ((copied * 100) / it).toInt().coerceIn(0, 100) }

                    if (percent == null || percent != lastPercent) {
                        onProgress?.invoke(CopyProgress(copied, totalBytes))
                        if (percent != null) lastPercent = percent
                    }
                }
                out.fd.sync()
            }

            require(tmp.length() > 0) { "Download vazio" }
            require(tmp.renameTo(target)) { "Não foi possível instalar o modelo" }
            onProgress?.invoke(CopyProgress(target.length(), totalBytes ?: target.length()))
            return registerModel(target)
        } catch (e: Exception) {
            tmp.delete()
            throw e
        }
    }

    fun importAttachment(uri: Uri, onProgress: ((CopyProgress) -> Unit)? = null): File {
        val name = safe(displayName(uri) ?: "arquivo")
        val target = uniqueTarget(attachmentsDir, name)
        copyAtomic(uri, target, onProgress)
        return target
    }

    fun readTextAttachment(path: String): String {
        val file = File(path)
        require(file.parentFile?.canonicalFile == attachmentsDir.canonicalFile && file.isFile) {
            "Anexo inválido"
        }
        require(file.extension.lowercase() in setOf("txt", "md", "csv", "json", "log")) {
            "Este tipo de arquivo ainda não pode ser lido como texto"
        }
        return file.bufferedReader(Charsets.UTF_8).use { it.readText() }
    }

    fun deleteAttachment(path: String) {
        val file = File(path)
        require(file.parentFile?.canonicalFile == attachmentsDir.canonicalFile && file.isFile) {
            "Anexo inválido"
        }
        require(file.delete()) { "Não foi possível excluir o anexo" }
    }

    private fun uniqueTarget(dir: File, name: String): File {
        var out = File(dir, name)
        if (!out.exists()) return out

        val dot = name.lastIndexOf('.')
        val stem = if (dot > 0) name.substring(0, dot) else name
        val ext = if (dot > 0) name.substring(dot) else ""
        var number = 2

        while (out.exists()) {
            out = File(dir, "${stem}_$number$ext")
            number++
        }
        return out
    }

    private fun copyAtomic(
        uri: Uri,
        target: File,
        onProgress: ((CopyProgress) -> Unit)? = null
    ) {
        val tmp = File(target.parentFile, target.name + ".part")
        val total = contentLength(uri)

        try {
            context.contentResolver.openInputStream(uri).use { input ->
                requireNotNull(input) { "Não foi possível abrir o arquivo" }
                FileOutputStream(tmp).use { out ->
                    val buffer = ByteArray(1024 * 1024)
                    var copied = 0L
                    var lastPercent = -1

                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        out.write(buffer, 0, read)
                        copied += read

                        val percent = total
                            ?.takeIf { it > 0 }
                            ?.let { ((copied * 100) / it).toInt().coerceIn(0, 100) }

                        if (percent == null || percent != lastPercent) {
                            onProgress?.invoke(CopyProgress(copied, total))
                            if (percent != null) lastPercent = percent
                        }
                    }
                    out.fd.sync()
                }
            }

            require(tmp.length() > 0) { "Arquivo vazio" }
            require(tmp.renameTo(target)) { "Não foi possível salvar o arquivo" }
            onProgress?.invoke(CopyProgress(target.length(), total ?: target.length()))
        } catch (e: Exception) {
            tmp.delete()
            throw e
        }
    }

    fun modelsJson(activePath: String?): String {
        val primary = prefs.getString(PRIMARY_MODEL, null)
        val array = JSONArray()

        modelsDir.listFiles()
            ?.filter { it.isFile && it.extension.equals("gguf", true) }
            ?.sortedBy { it.name.lowercase() }
            ?.forEach { file ->
                array.put(
                    JSONObject()
                        .put("name", file.name)
                        .put("path", file.absolutePath)
                        .put("bytes", file.length())
                        .put("primary", file.absolutePath == primary)
                        .put("active", file.absolutePath == activePath)
                )
            }

        return JSONObject()
            .put("models", array)
            .put("primaryPath", primary)
            .toString()
    }

    fun setPrimary(path: String) {
        val file = File(path)
        require(file.parentFile?.canonicalFile == modelsDir.canonicalFile && file.isFile) {
            "Modelo inválido"
        }
        prefs.edit().putString(PRIMARY_MODEL, file.absolutePath).apply()
    }

    fun primaryModel(): File? =
        prefs.getString(PRIMARY_MODEL, null)?.let(::File)?.takeIf { it.isFile }

    fun rememberActive(file: File) {
        prefs.edit().putString(LAST_MODEL, file.absolutePath).apply()
    }

    fun deleteModel(path: String) {
        val file = File(path)
        require(file.parentFile?.canonicalFile == modelsDir.canonicalFile && file.isFile) {
            "Modelo inválido"
        }
        val wasPrimary = prefs.getString(PRIMARY_MODEL, null) == file.absolutePath
        require(file.delete()) { "Não foi possível excluir o modelo" }

        if (wasPrimary) {
            val next = modelsDir.listFiles()
                ?.firstOrNull { it.isFile && it.extension.equals("gguf", true) }
            prefs.edit().apply {
                if (next != null) putString(PRIMARY_MODEL, next.absolutePath)
                else remove(PRIMARY_MODEL)
            }.apply()
        }
    }
}
