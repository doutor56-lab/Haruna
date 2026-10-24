package com.proxyslabs.haruna

import android.database.Cursor
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
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

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = false
        webView.settings.allowContentAccess = false
        webView.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                assetLoader.shouldInterceptRequest(request.url)

            @Deprecated("Deprecated in Java")
            override fun shouldInterceptRequest(view: WebView, url: String): WebResourceResponse? =
                assetLoader.shouldInterceptRequest(Uri.parse(url))

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                request.url.host != "appassets.androidplatform.net"
        }
        webView.addJavascriptInterface(bridge, "HarunaAndroid")
        webView.loadUrl("https://appassets.androidplatform.net/assets/haruna/index.html")
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
