package com.proxyslabs.haruna.speech

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream
import org.json.JSONObject
import java.io.Closeable
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.security.MessageDigest
import java.util.concurrent.CancellationException
import java.util.concurrent.atomic.AtomicBoolean

class SttModelManager(private val context: Context) {
    companion object {
        const val ARCHIVE = "sherpa-onnx-whisper-tiny.tar.bz2"
        const val URL_OFFICIAL = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/$ARCHIVE"
        const val ARCHIVE_BYTES = 116204861L
        const val SHA256 = "c46116994e539aa165266d96b325252728429c12535eb9d8b6a2b10f129e66b1"
        // SHA-256 recorded from the official release asset, not published by that old release.
        val FILES = listOf("tiny-encoder.int8.onnx", "tiny-decoder.int8.onnx", "tiny-tokens.txt")
    }
    private val root = File(context.filesDir, "stt").apply { mkdirs() }
    val directory = File(root, "whisper-tiny-int8")
    private val stage = File(root, ".whisper-stage")
    private val archive = File(root, ".whisper.tar.bz2.part")
    val cancelled = AtomicBoolean(false)
    @Volatile private var stream: Closeable? = null
    @Volatile private var connection: HttpURLConnection? = null

    fun installed(): Boolean = runCatching {
        val manifest = JSONObject(File(directory, "installed.json").readText())
        manifest.getString("sha256") == SHA256 && FILES.all { name ->
            val f = File(directory, name)
            f.isFile && f.length() == manifest.getJSONObject("files").getLong(name)
        }
    }.getOrDefault(false)
    fun bytes(): Long = if (installed()) FILES.sumOf { File(directory, it).length() } else 0L
    fun cancel() { cancelled.set(true); runCatching { stream?.close() }; connection?.disconnect() }
    private fun check() { if (cancelled.get()) throw CancellationException("Instalação cancelada") }
    fun cleanTemporary() { stage.deleteRecursively(); archive.delete() }

    fun install(uri: Uri?, progress: (String, Long, Long?) -> Unit) {
        cleanTemporary()
        try {
            check()
            require(root.usableSpace > 450L * 1024 * 1024) { "Espaço insuficiente. Libere aproximadamente 450 MB para instalar a voz." }
            val total: Long?
            val input = if (uri != null) {
                var size: Long? = null
                context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
                    if (c.moveToFirst()) {
                        require(c.getString(0).endsWith(".tar.bz2", true)) { "Selecione o pacote .tar.bz2 do Whisper Tiny multilíngue" }
                        if (!c.isNull(1)) size = c.getLong(1).takeIf { it > 0 }
                    }
                }
                total = size
                requireNotNull(context.contentResolver.openInputStream(uri)) { "Não foi possível abrir o pacote" }
            } else {
                val conn = URI(URL_OFFICIAL).toURL().openConnection() as HttpURLConnection
                connection = conn
                conn.connectTimeout = 20000; conn.readTimeout = 30000; conn.instanceFollowRedirects = true
                conn.connect()
                require(conn.responseCode in 200..299) { "Falha no download (${conn.responseCode})" }
                total = conn.contentLengthLong.takeIf { it > 0 } ?: ARCHIVE_BYTES
                conn.inputStream
            }
            val phase = if (uri == null) "downloading" else "importing"
            progress(phase, 0, total)
            val digest = MessageDigest.getInstance("SHA-256")
            stream = input
            input.use { source -> archive.outputStream().use { out ->
                val buffer = ByteArray(128 * 1024); var count = 0L; var notified = 0L
                while (true) {
                    check(); val n = source.read(buffer); if (n < 0) break
                    count += n
                    require(count <= ARCHIVE_BYTES) { "Pacote diferente do Whisper Tiny multilíngue esperado" }
                    out.write(buffer, 0, n); digest.update(buffer, 0, n)
                    if (count - notified >= 512 * 1024) { progress(phase, count, total); notified = count }
                }
                require(count == ARCHIVE_BYTES) { "Arquivo incompleto: esperado $ARCHIVE_BYTES bytes, recebido $count" }
                progress(phase, count, count)
            } }
            stream = null
            check()
            require(digest.digest().joinToString("") { "%02x".format(it) } == SHA256) { "O pacote falhou na verificação SHA-256. Use o arquivo oficial indicado." }
            progress("extracting", 0, null)
            stage.mkdirs()
            var expanded = 0L
            BZip2CompressorInputStream(archive.inputStream().buffered()).use { bz -> TarArchiveInputStream(bz).use { tar ->
                while (true) {
                    check(); val entry = tar.nextEntry ?: break
                    require(!entry.isSymbolicLink && !entry.isLink) { "Pacote contém links não permitidos" }
                    require(!entry.name.startsWith("/") && entry.name.split('/').none { it == ".." }) { "Caminho inválido no pacote" }
                    if (entry.isDirectory) continue
                    val name = entry.name.substringAfterLast('/')
                    if (name !in FILES) continue
                    val target = File(stage, name)
                    require(!target.exists() && entry.size > 0 && entry.size <= 512L * 1024 * 1024) { "Arquivo inválido no pacote: $name" }
                    target.outputStream().use { out ->
                        val buffer = ByteArray(128 * 1024); var count = 0L
                        while (true) { check(); val n = tar.read(buffer); if (n < 0) break; count += n; expanded += n
                            require(expanded <= 512L * 1024 * 1024) { "Pacote expandido excede o limite" }; out.write(buffer, 0, n) }
                        require(count == entry.size) { "Extração incompleta de $name" }
                    }
                }
            } }
            check()
            require(FILES.all { File(stage, it).isFile && File(stage, it).length() > 0 }) { "Faltam componentes do Whisper Tiny" }
            val lengths = JSONObject(); FILES.forEach { lengths.put(it, File(stage, it).length()) }
            File(stage, "installed.json").writeText(JSONObject().put("sha256", SHA256).put("language", "pt").put("files", lengths).toString())
            check()
            require(!directory.exists() || directory.deleteRecursively()) { "Não foi possível substituir a instalação de voz" }
            require(stage.renameTo(directory)) { "Não foi possível finalizar a instalação" }
            progress("installed", 0, null)
        } finally { stream = null; connection?.disconnect(); connection = null; cleanTemporary() }
    }
    fun remove() { require(!directory.exists() || directory.deleteRecursively()) { "Não foi possível remover a voz" }; cleanTemporary() }
}
