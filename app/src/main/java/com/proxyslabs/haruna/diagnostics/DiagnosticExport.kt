package com.proxyslabs.haruna.diagnostics

import androidx.activity.result.contract.ActivityResultContracts
import com.proxyslabs.haruna.MainActivity
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/** Explicit DEBUG export through Android SAF; no storage permission or private chat access. */
class DiagnosticExport(private val activity: MainActivity, private val reply: (String) -> Unit) : AutoCloseable {
    private val closed = AtomicBoolean(false)
    private val worker = Executors.newSingleThreadExecutor()
    private var pending: ByteArray? = null // Main-thread owned, bounded technical JSON only.
    private val picker = activity.registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        val bytes = pending; pending = null
        if (closed.get()) return@registerForActivityResult
        if (uri == null || bytes == null) { reply("Exportação cancelada."); return@registerForActivityResult }
        runCatching { worker.execute {
            val ok = runCatching {
                requireNotNull(activity.contentResolver.openOutputStream(uri, "wt")).use { it.write(bytes) }
            }.isSuccess
            activity.runOnUiThread { if (!closed.get()) reply(if (ok) "Relatório salvo." else "Não foi possível salvar o relatório.") }
        } }.onFailure { reply("Não foi possível salvar o relatório.") }
    }
    fun save(raw: String) {
        require(raw.length <= 512_000) { "Relatório técnico muito grande" }
        val value = JSONObject(raw)
        require(value.optString("schema") == "haruna-lab-v1" && value.getJSONArray("runs").length() <= 30)
        activity.runOnUiThread {
            if (closed.get()) return@runOnUiThread
            if (pending != null) { reply("Conclua a exportação já aberta."); return@runOnUiThread }
            pending = raw.toByteArray(Charsets.UTF_8)
            runCatching { picker.launch("HARUNA_LAB.json") }.onFailure { pending = null; reply("Não foi possível abrir o seletor de arquivos.") }
        }
    }
    override fun close() { closed.set(true); pending = null; worker.shutdown() }
}
