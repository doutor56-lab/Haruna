package com.proxyslabs.haruna

import android.net.Uri
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import java.io.File

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var backend: LlmBackend
    private lateinit var bridge: HarunaAndroidBridge
    lateinit var library: LocalLibrary
        private set

    private val modelPicker = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@registerForActivityResult
        Thread {
            val result = runCatching {
                val file = library.importModel(uri)
                backend.loadModel(file.absolutePath).getOrThrow()
                library.rememberActive(file)
            }
            bridge.notifyModelLoadResult(result)
        }.start()
    }

    private val attachmentPicker = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@registerForActivityResult
        Thread {
            val result = runCatching { library.importAttachment(uri) }
            bridge.notifyAttachmentResult(result)
        }.start()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        library = LocalLibrary(applicationContext)
        webView = WebView(this); setContentView(webView)
        backend = LlamaCppBackend(applicationContext)
        bridge = HarunaAndroidBridge(this, webView, backend)
        val loader = WebViewAssetLoader.Builder().addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this)).build()
        webView.settings.javaScriptEnabled = true; webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = false; webView.settings.allowContentAccess = false
        webView.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? = loader.shouldInterceptRequest(request.url)
            @Deprecated("Deprecated in Java") override fun shouldInterceptRequest(view: WebView, url: String): WebResourceResponse? = loader.shouldInterceptRequest(Uri.parse(url))
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) = request.url.host != "appassets.androidplatform.net"
        }
        webView.addJavascriptInterface(bridge, "HarunaAndroid")
        webView.loadUrl("https://appassets.androidplatform.net/assets/haruna/index.html")
        autoLoadPrimaryModel()
    }

    private fun autoLoadPrimaryModel() {
        val file = library.primaryModel() ?: return
        Thread {
            val result = if (backend.status().modelLoaded) Result.success(Unit) else backend.loadModel(file.absolutePath)
            if (result.isSuccess) library.rememberActive(file)
            bridge.notifyModelLoadResult(result)
        }.start()
    }

    fun pickModel() = modelPicker.launch(arrayOf("application/octet-stream", "*/*"))
    fun pickAttachment() = attachmentPicker.launch(arrayOf("text/plain", "text/markdown", "application/pdf", "image/*", "*/*"))

    fun useModel(path: String) {
        Thread {
            val file = File(path)
            val result = runCatching { backend.unloadModel().getOrThrow(); backend.loadModel(file.absolutePath).getOrThrow(); library.rememberActive(file) }
            bridge.notifyModelLoadResult(result)
        }.start()
    }

    override fun onDestroy() {
        webView.removeJavascriptInterface("HarunaAndroid"); webView.stopLoading(); webView.destroy()
        super.onDestroy()
    }
}