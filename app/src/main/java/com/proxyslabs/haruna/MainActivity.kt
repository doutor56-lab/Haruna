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
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var backend: LlmBackend
    private lateinit var bridge: HarunaAndroidBridge
    @Volatile private var modelImportBusy = false
    lateinit var library: LocalLibrary
        private set

    private val modelPicker = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) { modelImportBusy = false; return@registerForActivityResult }
        if (modelImportBusy) return@registerForActivityResult
        modelImportBusy = true
        val name = library.displayName(uri) ?: "haruna-model.gguf"
        bridge.notifyImportStarted("model", name)
        Thread {
            var imported: File? = null
            val result = runCatching {
                imported = library.importModel(uri) { progress -> bridge.notifyImportProgress("model", name, progress) }
                prepareModel(imported!!)
            }
            modelImportBusy = false
            bridge.notifyModelLoadResult(result, imported?.name ?: name)
        }.start()
    }

    private val attachmentPicker = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) { bridge.notifyAttachmentCancelled(); return@registerForActivityResult }
        Thread { bridge.notifyAttachmentResult(runCatching { library.importAttachment(uri) }) }.start()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        library = LocalLibrary(applicationContext)
        webView = WebView(this)
        setContentView(webView)
        backend = LlamaCppBackend(applicationContext)
        bridge = HarunaAndroidBridge(this, webView, backend)
        val loader = WebViewAssetLoader.Builder().addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this)).build()
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = false
        webView.settings.allowContentAccess = false
        webView.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? = loader.shouldInterceptRequest(request.url)
            @Deprecated("Deprecated in Java") override fun shouldInterceptRequest(view: WebView, url: String): WebResourceResponse? = loader.shouldInterceptRequest(Uri.parse(url))
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) = request.url.host != "appassets.androidplatform.net"
        }
        webView.addJavascriptInterface(bridge, "HarunaAndroid")
        webView.loadUrl("https://appassets.androidplatform.net/assets/haruna/index.html")
        autoLoadPrimaryModel()
    }

    private fun prepareModel(file: File) { bridge.notifyModelPreparing(file.name); if (backend.status().modelLoaded) backend.unloadModel().getOrThrow(); backend.loadModel(file.absolutePath).getOrThrow(); library.rememberActive(file) }

    fun downloadRecommendedModel(url: String, name: String) {
        if (modelImportBusy) { bridge.notifyDownloadRejected(name, "Já existe uma instalação em andamento."); return }
        modelImportBusy = true; bridge.notifyDownloadStarted(name)
        Thread {
            var downloaded: File? = null
            val result = runCatching {
                val initialUrl = URL(url)
                require(initialUrl.protocol.equals("https", true)) { "A fonte do modelo deve usar HTTPS." }
                require(initialUrl.host.equals("huggingface.co", true)) { "Fonte de modelo não permitida." }
                val connection = initialUrl.openConnection() as HttpURLConnection
                try {
                    connection.instanceFollowRedirects = true; connection.connectTimeout = 20_000; connection.readTimeout = 60_000; connection.setRequestProperty("User-Agent", "Haruna-Android"); connection.connect()
                    require(connection.responseCode in 200..299) { "Falha no download (${connection.responseCode})" }
                    val totalBytes = connection.contentLengthLong.takeIf { it > 0 }
                    connection.inputStream.use { input -> downloaded = library.importDownloadedModel(name, input, totalBytes) { progress -> bridge.notifyDownloadProgress(name, progress) } }
                } finally { connection.disconnect() }
                prepareModel(requireNotNull(downloaded))
            }
            modelImportBusy = false; bridge.notifyModelLoadResult(result, downloaded?.name ?: name)
        }.start()
    }

    private fun autoLoadPrimaryModel() { val file = library.primaryModel() ?: return; Thread { val result = if (backend.status().modelLoaded) Result.success(Unit) else backend.loadModel(file.absolutePath); if (result.isSuccess) library.rememberActive(file); bridge.notifyModelLoadResult(result) }.start() }
    fun pickModel() { if (!modelImportBusy) modelPicker.launch(arrayOf("application/octet-stream", "*/*")) }
    fun pickAttachment() = attachmentPicker.launch(arrayOf("text/plain", "text/markdown", "application/pdf", "image/*", "*/*"))
    fun useModel(path: String) { Thread { val file=File(path); val result=runCatching { if(backend.status().modelLoaded) backend.unloadModel().getOrThrow(); backend.loadModel(file.absolutePath).getOrThrow(); library.rememberActive(file) }; bridge.notifyModelLoadResult(result,file.name) }.start() }
    override fun onDestroy() { webView.removeJavascriptInterface("HarunaAndroid"); webView.stopLoading(); webView.destroy(); super.onDestroy() }
}
