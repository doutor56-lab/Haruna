package com.proxyslabs.haruna

import android.database.Cursor
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import java.io.File
import java.io.FileOutputStream

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var backend: LlmBackend
    private lateinit var bridge: HarunaAndroidBridge

    private val picker = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) {
            bridge.notifyModelLoadResult(Result.failure(IllegalStateException("Seleção cancelada")))
            return@registerForActivityResult
        }

        Thread {
            val result = runCatching {
                val displayName = queryDisplayName(uri) ?: "haruna-model.gguf"
                require(displayName.endsWith(".gguf", ignoreCase = true)) { "Selecione um arquivo .gguf" }

                val safeName = displayName.replace(Regex("[^A-Za-z0-9._-]"), "_")
                val modelsDir = File(filesDir, "models").apply { mkdirs() }
                val target = File(modelsDir, safeName)
                val temporary = File(modelsDir, "$safeName.part")

                contentResolver.openInputStream(uri).use { input ->
                    requireNotNull(input) { "Não foi possível abrir o modelo" }
                    FileOutputStream(temporary).use { output -> input.copyTo(output, 1024 * 1024) }
                }
                require(temporary.length() > 0L) { "O arquivo selecionado está vazio" }
                if (target.exists()) target.delete()
                require(temporary.renameTo(target)) { "Não foi possível finalizar a cópia do modelo" }

                backend.loadModel(target.absolutePath).getOrThrow()
            }
            bridge.notifyModelLoadResult(result)
        }.start()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        setContentView(webView)
        backend = LlamaCppBackend(applicationContext)
        bridge = HarunaAndroidBridge(this, webView, backend)

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = true
        webView.settings.allowContentAccess = false
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean =
                url?.startsWith("file:///android_asset/haruna/") != true
        }
        webView.addJavascriptInterface(bridge, "HarunaAndroid")
        webView.loadUrl("file:///android_asset/haruna/index.html")
    }

    override fun onDestroy() {
        webView.removeJavascriptInterface("HarunaAndroid")
        (backend as? LlamaCppBackend)?.destroy()
        webView.destroy()
        super.onDestroy()
    }

    fun pickModel() {
        picker.launch(arrayOf("application/octet-stream", "*/*"))
    }

    private fun queryDisplayName(uri: Uri): String? {
        var cursor: Cursor? = null
        return try {
            cursor = contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
            if (cursor != null && cursor.moveToFirst()) cursor.getString(0) else null
        } finally {
            cursor?.close()
        }
    }
}
