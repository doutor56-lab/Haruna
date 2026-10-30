package com.proxyslabs.haruna.speech

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream
import org.json.JSONArray
import org.json.JSONObject
import java.io.Closeable
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.security.MessageDigest
import java.util.concurrent.CancellationException
import java.util.concurrent.atomic.AtomicBoolean

/** Extends the existing private STT installation; recognizers remain short-lived. */
class SttModelManager(private val context: Context) {
    companion object {
        const val ARCHIVE = "sherpa-onnx-whisper-tiny.tar.bz2"
        const val URL_OFFICIAL = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/$ARCHIVE"
        const val ARCHIVE_BYTES = 116204861L
        const val SHA256 = "c46116994e539aa165266d96b325252728429c12535eb9d8b6a2b10f129e66b1"
        val FILES = WhisperModels.supported.first().files
    }
    private val root = File(context.filesDir, "stt").apply { mkdirs() }
    private val prefs = context.getSharedPreferences("haruna_recognition", Context.MODE_PRIVATE)
    private val stage = File(root, ".whisper-stage")
    private val archive = File(root, ".whisper.tar.bz2.part")
    val cancelled = AtomicBoolean(false)
    @Volatile private var stream: Closeable? = null
    @Volatile private var connection: HttpURLConnection? = null
    fun selected(): WhisperModels.Model = runCatching { WhisperModels.byId(prefs.getString("selected_model", "whisper-tiny-int8")!!) }.getOrDefault(WhisperModels.supported.first())
    val directory: File get() = File(root, selected().id)
    fun installed(model: WhisperModels.Model = selected()): Boolean = runCatching {
        val dir = File(root, model.id)
        val manifest = JSONObject(File(dir, "installed.json").readText())
        // The pre-stage-6 Tiny manifest is recognized in place, without migration/copy.
        val legacy = model.family == "tiny" && manifest.optString("sha256") == SHA256
        (legacy || manifest.optString("modelId") == model.id) && model.files.all {
            val file = File(dir, it); file.isFile && file.length() == manifest.getJSONObject("files").getLong(it)
        }
    }.getOrDefault(false)
    fun bytes(): Long = if (installed()) selected().files.sumOf { File(directory, it).length() } else 0L
    fun list(): JSONArray = JSONArray().also { list -> WhisperModels.supported.filter { File(root, it.id).isDirectory }.forEach { model ->
        val dir = File(root, model.id)
        list.put(JSONObject().put("id", model.id).put("name", model.title).put("format", "sherpa-onnx · ONNX INT8 multilíngue")
            .put("installed", installed(model)).put("selected", model.id == selected().id).put("bytes", model.files.sumOf { File(dir, it).length() }))
    } }
    fun select(id: String) {
        val model = WhisperModels.byId(id); require(installed(model)) { "Modelo STT não instalado" }
        check(prefs.edit().putString("selected_model", id).commit()) { "Não foi possível salvar a seleção STT" }
    }
    fun cancel() { cancelled.set(true); runCatching { stream?.close() }; connection?.disconnect() }
    private fun check() { if (cancelled.get()) throw CancellationException("Instalação cancelada") }
    fun cleanTemporary() { stage.deleteRecursively(); archive.delete() }

    fun install(uri: Uri?, progress: (String, Long, Long?) -> Unit, requested: String = "whisper-tiny-int8") {
        val download = WhisperModels.byId(requested)
        cleanTemporary()
        try {
            check()
            val total: Long?
            val input = if (uri != null) {
                var size: Long? = null
                context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
                    if (c.moveToFirst()) {
                        require(c.getString(0).endsWith(".tar.bz2", true)) { "Selecione o pacote .tar.bz2 do Whisper multilíngue para sherpa-onnx" }
                        if (!c.isNull(1)) size = c.getLong(1).takeIf { it > 0 }
                    }
                }
                total = size
                requireNotNull(context.contentResolver.openInputStream(uri)) { "Não foi possível abrir o pacote" }
            } else {
                val conn = URI(download.url).toURL().openConnection() as HttpURLConnection
                connection = conn; conn.connectTimeout = 20000; conn.readTimeout = 30000; conn.instanceFollowRedirects = true; conn.connect()
                require(conn.responseCode in 200..299) { "Falha no download (${conn.responseCode})" }
                total = conn.contentLengthLong.takeIf { it > 0 } ?: download.archiveBytes
                conn.inputStream
            }
            stream = input
            val required = maxOf(450L * 1024 * 1024, (total ?: 700L * 1024 * 1024) * 2 + 150L * 1024 * 1024)
            require(root.usableSpace > required) { "Espaço insuficiente para instalar: reserve aproximadamente ${required / 1048576} MB temporários" }
            val phase = if (uri == null) "downloading" else "importing"
            val digest = MessageDigest.getInstance("SHA-256")
            progress(phase, 0, total)
            input.use { source -> archive.outputStream().use { out ->
                val buffer = ByteArray(128 * 1024); var count = 0L; var notified = 0L
                while (true) {
                    check(); val n = source.read(buffer); if (n < 0) break
                    count += n; require(count <= 1600L * 1024 * 1024) { "Pacote STT excede o limite permitido" }
                    out.write(buffer, 0, n); digest.update(buffer, 0, n)
                    if (count - notified >= 512 * 1024) { progress(phase, count, total); notified = count }
                }
                if (total != null) require(count == total) { "Arquivo incompleto" }
                if (uri == null) require(count == download.archiveBytes) { "Tamanho diferente do pacote oficial verificado" }
                require(count > 0) { "Pacote vazio" }; progress(phase, count, count)
            } }
            stream = null; check()
            val archiveHash = digest.digest().joinToString("") { "%02x".format(it) }
            if (uri == null && download.family == "tiny") require(archiveHash == SHA256) { "O pacote Tiny não corresponde ao SHA-256 conhecido" }
            progress("extracting", 0, null); stage.mkdirs()
            val allowed = WhisperModels.supported.flatMap { it.files }.toSet()
            val found = mutableSetOf<String>(); var expanded = 0L; var declared = 0L
            BZip2CompressorInputStream(archive.inputStream().buffered()).use { bz -> TarArchiveInputStream(bz).use { tar ->
                while (true) {
                    check(); val entry = tar.nextEntry ?: break
                    require(!entry.isSymbolicLink && !entry.isLink && !entry.name.startsWith("/") && entry.name.split('/').none { it == ".." }) { "Caminho/link inválido no pacote STT" }
                    if (entry.isDirectory) continue
                    require(entry.size in 0..3000L * 1024 * 1024) { "Componente do pacote excede o limite" }
                    declared += entry.size; require(declared <= 4000L * 1024 * 1024) { "Pacote STT expandido excede o limite" }
                    val name = entry.name.substringAfterLast('/')
                    if (name !in allowed) continue
                    require(found.add(name) && entry.size in 1..1100L * 1024 * 1024) { "Componente STT duplicado ou inválido" }
                    File(stage, name).outputStream().use { out ->
                        val buffer = ByteArray(128 * 1024); var count = 0L
                        while (true) { check(); val n = tar.read(buffer); if (n < 0) break; count += n; expanded += n
                            require(expanded <= 1300L * 1024 * 1024) { "Pacote expandido excede o limite STT" }; out.write(buffer, 0, n) }
                        require(count == entry.size) { "Extração incompleta de $name" }
                    }
                }
            } }
            check(); val model = WhisperModels.detect(found)
            if (uri == null) require(model.id == download.id) { "O pacote recebido não corresponde ao modelo escolhido" }
            val tokens = File(stage, model.files.last()); require(tokens.length() <= 8L * 1024 * 1024 && WhisperModels.hasPortuguese(tokens.readText())) { "Vocabulário Whisper multilíngue inválido; pacotes .en não são suportados nesta seleção" }
            val target = File(root, model.id)
            if (installed(model)) {
                val previous = JSONObject(File(target, "installed.json").readText())
                require(previous.optString("sha256") == archiveHash) { "Este modelo STT já está instalado. Remova-o explicitamente antes de substituir por outro pacote" }
                select(model.id); progress("installed", 0, null); return
            }
            val lengths = JSONObject(); val hashes = JSONObject()
            model.files.forEach { name -> lengths.put(name, File(stage, name).length()); hashes.put(name, File(stage, name).inputStream().use { source ->
                val hash = MessageDigest.getInstance("SHA-256"); val buffer = ByteArray(128 * 1024)
                while (true) { check(); val n = source.read(buffer); if (n < 0) break; hash.update(buffer, 0, n) }; hash.digest().joinToString("") { "%02x".format(it) }
            }) }
            File(stage, "installed.json").writeText(JSONObject().put("modelId", model.id).put("sha256", archiveHash).put("language", "pt").put("files", lengths).put("hashes", hashes).toString())
            require(!target.exists()) { "Instalação STT incompleta já existe; remova esse modelo nas configurações antes de reinstalar" }
            check(); require(stage.renameTo(target)) { "Não foi possível finalizar a instalação STT" }
            select(model.id); progress("installed", 0, null)
        } finally { runCatching { stream?.close() }; stream = null; connection?.disconnect(); connection = null; cleanTemporary() }
    }
    fun remove(id: String = selected().id) {
        val model = WhisperModels.byId(id); val dir = File(root, model.id)
        require(!dir.exists() || dir.deleteRecursively()) { "Não foi possível remover o modelo STT" }
        if (selected().id == id) {
            val next = WhisperModels.supported.firstOrNull(::installed)?.id ?: "whisper-tiny-int8"
            check(prefs.edit().putString("selected_model", next).commit()) { "Não foi possível salvar a seleção STT" }
        }
    }
}
