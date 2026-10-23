package com.proxyslabs.haruna

import android.annotation.SuppressLint
import android.net.Uri
import android.os.Bundle
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import java.io.File

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var bridge: HarunaAndroidBridge
    private lateinit var backend: LlmBackend

    private val modelPicker = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri == null) return@registerForActivityResult
        val name = queryDisplayName(uri) ?: "modelo.gguf"
        if (!name.lowercase().endsWith(".gguf")) return@registerForActivityResult
        Thread {
            runCatching {
                val models = File(filesDir, "models").apply { mkdirs() }
                val out = File(models, name)
                contentResolver.openInputStream(uri).use { input ->
                    requireNotNull(input) { "Não foi possível abrir o GGUF." }
                    out.outputStream().use { output -> input.copyTo(output, 1024 * 1024) }
                }
                backend.loadModel(out.absolutePath).getOrThrow()
            }.also { bridge.notifyModelLoadResult(it) }
        }.start()
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        backend = LlamaCppBackend(applicationContext)
        webView = WebView(this); setContentView(webView)
        webView.settings.apply { javaScriptEnabled = true; domStorageEnabled = true; allowFileAccess = true; allowContentAccess = true; cacheMode = WebSettings.LOAD_DEFAULT }
        bridge = HarunaAndroidBridge(this, webView, backend)
        webView.addJavascriptInterface(bridge, "HarunaAndroid")
        webView.loadUrl("file:///android_asset/haruna/index.html")
    }

    fun pickGgufModel() = modelPicker.launch(arrayOf("application/octet-stream", "*/*"))

    private fun queryDisplayName(uri: Uri): String? {
        contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            val idx = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
            if (idx >= 0 && c.moveToFirst()) return c.getString(idx)
        }
        return null
    }

    override fun onDestroy() {
        (backend as? LlamaCppBackend)?.destroy(); webView.removeJavascriptInterface("HarunaAndroid"); webView.destroy(); super.onDestroy()
    }
}
