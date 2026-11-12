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

/** Extends the existing private STT installation; execution remains separate from installation. */
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
        (legacy || manifest.optString("modelId") == model.id) && (model.engine != "cpp" || manifest.optString("sha256") == model.sha256) && model.files.all {
            val file = File(dir, it); file.isFile && file.length() == manifest.getJSONObject("files").getLong(it)
        }
    }.getOrDefault(false)
    fun bytes(): Long = if (installed()) selected().files.sumOf { File(directory, it).length() } else 0L
    fun list(): JSONArray = JSONArray().also { list -> WhisperModels.supported.filter { File(root, it.id).isDirectory }.forEach { model ->
        val dir = File(root, model.id)
        list.put(JSONObject().put("id", model.id).put("name", model.title).put("format", if (model.engine == "cpp") "whisper.cpp · " + if (model.filename.contains("q5_1")) "Q5_1 multilíngue" else "F16 multilíngue" else "sherpa-onnx · ONNX INT8 multilíngue")
            .put("installed", installed(model)).put("selected", model.id == selected().id).put("bytes", model.files.sumOf { File(dir, it).length() }))
    } }
    fun select(id: String) {
        val model = WhisperModels.byId(id); require(installed(model)) { "Modelo STT não instalado" }
        check(prefs.edit().putString("selected_model", id).commit()) { "Não foi possível salvar a seleção STT" }
    }
    fun cancel() { cancelled.set(true); runCatching { stream?.close() }; connection?.disconnect() }
    private fun check() { if (cancelled.get()) throw CancellationException("Instalação cancelada") }
    fun cleanTemporary() { stage.deleteRecursively(); archive.delete() }

    private fun extractionInput(progress: (String, Long, Long?) -> Unit): java.io.InputStream {
        val source = archive.inputStream()
        val size = archive.length()
        var consumed = 0L; var notified = 0L
        fun observed(n: Int) {
            if (n <= 0) return
            consumed += n
            if (consumed - notified >= 512 * 1024 || consumed == size) {
                progress("extracting", consumed, size); notified = consumed
            }
        }
        return object : java.io.InputStream() {
            override fun read(): Int { check(); val value = source.read(); if (value >= 0) observed(1); return value }
            override fun read(bytes: ByteArray, offset: Int, length: Int): Int { check(); val n = source.read(bytes, offset, length); observed(n); return n }
            override fun close() { try { if (!cancelled.get()) progress("extracting", consumed, size) } finally { source.close() } }
        }.buffered(128 * 1024)
    }

    fun install(uri: Uri?, progress: (String, Long, Long?) -> Unit, requested: String = "whisper-tiny-int8") {
        val download = WhisperModels.byId(requested)
        cleanTemporary()
        try {
            check()
            if (uri == null && download.engine == "cpp") {
                val conn = SttDownload.open(download.url, { connection = it }, ::check)
                stream = conn.inputStream.buffered()
                installCpp(requireNotNull(stream) as java.io.InputStream, download.archiveBytes, download, progress)
                return
            }
            val total: Long?
            val input = if (uri != null) {
                var size: Long? = null
                context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
                    if (c.moveToFirst()) {
                        // Identify bytes, never trust the display name or extension.
                        if (!c.isNull(1)) size = c.getLong(1).takeIf { it > 0 }
                    }
                }
                total = size
                requireNotNull(context.contentResolver.openInputStream(uri)) { "Não foi possível abrir o pacote" }
            } else {
                val conn = SttDownload.open(download.url, { connection = it }, ::check)
                total = conn.contentLengthLong.takeIf { it > 0 } ?: download.archiveBytes
                conn.inputStream
            }
            val checkedInput = input.buffered()
            stream = checkedInput
            checkedInput.mark(48)
            val header = ByteArray(48)
            var read = 0
            while (read < header.size) { check(); val n = checkedInput.read(header, read, header.size - read); if (n < 0) break; read += n }
            checkedInput.reset()
            if (read >= 4 && java.nio.ByteBuffer.wrap(header).order(java.nio.ByteOrder.LITTLE_ENDIAN).int == 0x67676d6c) {
                WhisperFileHeader.family(header.copyOf(read))
                installCpp(checkedInput, total, null, progress)
                return
            }
            require(read >= 4 && header[0] == 66.toByte() && header[1] == 90.toByte() && header[2] == 104.toByte() && header[3] in 49.toByte()..57.toByte()) {
                "Este arquivo não é um modelo de reconhecimento compatível. Importe um pacote sherpa-onnx ou Whisper GGML oficial F16/Q5_1."
            }
            val required = maxOf(450L * 1024 * 1024, (total ?: 700L * 1024 * 1024) * 2 + 150L * 1024 * 1024)
            require(root.usableSpace > required) { "Espaço insuficiente para instalar: reserve aproximadamente ${required / 1048576} MB temporários" }
            val phase = if (uri == null) "downloading" else "importing"
            val digest = MessageDigest.getInstance("SHA-256")
            progress(phase, 0, total)
            checkedInput.use { source -> archive.outputStream().use { out ->
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
            progress("extracting", 0, archive.length()); stage.mkdirs()
            val allowed = WhisperModels.onnx.flatMap { it.files }.toSet()
            val found = mutableSetOf<String>(); var expanded = 0L; var declared = 0L
            val extraction = extractionInput(progress); stream = extraction
            BZip2CompressorInputStream(extraction).use { bz -> TarArchiveInputStream(bz).use { tar ->
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
            stream = null
            check(); val model = WhisperModels.detect(found)
            if (uri == null) require(model.id == download.id) { "O pacote recebido não corresponde ao modelo escolhido" }
            val validationBytes = model.files.sumOf { File(stage, it).length() }
            progress("validating", 0, validationBytes)
            val tokens = File(stage, model.files.last()); require(tokens.length() <= 8L * 1024 * 1024 && WhisperModels.hasPortuguese(tokens.readText())) { "Vocabulário Whisper multilíngue inválido; pacotes .en não são suportados nesta seleção" }
            val target = File(root, model.id)
            if (installed(model)) {
                val previous = JSONObject(File(target, "installed.json").readText())
                require(previous.optString("sha256") == archiveHash) { "Este modelo STT já está instalado. Remova-o explicitamente antes de substituir por outro pacote" }
                select(model.id); progress("installed", 0, null); return
            }
            val lengths = JSONObject(); val hashes = JSONObject(); var verified = 0L; var reported = 0L
            model.files.forEach { name -> lengths.put(name, File(stage, name).length()); hashes.put(name, File(stage, name).inputStream().use { source ->
                val hash = MessageDigest.getInstance("SHA-256"); val buffer = ByteArray(128 * 1024)
                while (true) { check(); val n = source.read(buffer); if (n < 0) break; hash.update(buffer, 0, n); verified += n
                    if (verified - reported >= 512 * 1024 || verified == validationBytes) { progress("validating", verified, validationBytes); reported = verified }
                }; hash.digest().joinToString("") { "%02x".format(it) }
            }) }
            progress("finalizing", 0, null); check()
            File(stage, "installed.json").writeText(JSONObject().put("modelId", model.id).put("sha256", archiveHash).put("language", "pt").put("files", lengths).put("hashes", hashes).toString())
            require(!target.exists()) { "Instalação STT incompleta já existe; remova esse modelo nas configurações antes de reinstalar" }
            check(); require(stage.renameTo(target)) { "Não foi possível finalizar a instalação STT" }
            select(model.id); progress("installed", 0, null)
        } finally { runCatching { stream?.close() }; stream = null; connection?.disconnect(); connection = null; cleanTemporary() }
    }
    private fun installCpp(input: java.io.InputStream, total: Long?, expected: WhisperModels.Model?, progress: (String, Long, Long?) -> Unit) {
        val maxBytes = WhisperModels.cpp.maxOf { it.archiveBytes }
        require(total == null || total in 1..maxBytes) { "Modelo Whisper incompatível ou maior que os formatos suportados." }
        require(root.usableSpace > (total ?: maxBytes) + 32L * 1024 * 1024) { "Não há espaço suficiente para instalar este modelo." }
        val source = input.buffered()
        stream = source
        source.mark(48)
        val header = source.readNBytes(48)
        source.reset()
        val family = WhisperFileHeader.family(header)
        require(expected == null || family == expected.family) { "O arquivo não corresponde ao modelo escolhido." }
        stage.mkdirs()
        val file = File(stage, "model.bin")
        val digest = MessageDigest.getInstance("SHA-256")
        val phase = if (expected == null) "importing" else "downloading"
        progress(phase, 0, total)
        var count = 0L; var notified = 0L
        source.use { src -> file.outputStream().use { out ->
            val buffer = ByteArray(128 * 1024)
            while (true) {
                check(); val n = src.read(buffer); if (n < 0) break
                count += n; require(count <= maxBytes) { "Modelo Whisper excede o limite suportado." }
                out.write(buffer, 0, n); digest.update(buffer, 0, n)
                if (count - notified >= 512 * 1024) { progress(phase, count, total); notified = count }
            }
        } }
        if (total != null) require(count == total) { "O modelo parece estar incompleto ou corrompido." }
        val hash = digest.digest().joinToString("") { "%02x".format(it) }
        // This deliberately small verified set prevents malformed native model files reaching assertions/allocations.
        val model = WhisperModels.cpp.firstOrNull { it.family == family && it.archiveBytes == count && it.sha256 == hash }
            ?: error("O modelo parece estar corrompido ou não é uma das versões oficiais multilíngues F16/Q5_1 suportadas. Consulte os modelos disponíveis.")
        require(expected == null || expected.id == model.id) { "O arquivo recebido não corresponde ao modelo escolhido." }
        val target = File(root, model.id)
        if (installed(model)) { select(model.id); progress("installed", count, count); return }
        require(!target.exists()) { "Instalação incompleta: remova esse modelo nas configurações antes de reinstalar." }
        File(stage, "installed.json").writeText(JSONObject().put("modelId", model.id).put("sha256", hash)
            .put("engine", "whisper.cpp").put("files", JSONObject().put("model.bin", count)).toString())
        check(); require(stage.renameTo(target)) { "Não foi possível finalizar a instalação STT." }
        select(model.id); progress("installed", count, count)
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
