package com.proxyslabs.haruna

import android.net.Uri
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebChromeClient
import java.util.concurrent.Executors
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
    private val modelExecutor = Executors.newSingleThreadExecutor()
    private var modelPickerOpen = false
    @Volatile private var activeModelPath: String? = null
    lateinit var library: LocalLibrary
        private set

    private val modelPicker = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        modelPickerOpen = false
        if (uri == null) { modelImportBusy = false; bridge.notifyModelSelectionCancelled(); return@registerForActivityResult }
        val name = library.displayName(uri) ?: "haruna-model.gguf"
        bridge.notifyImportStarted("model", name)
        modelExecutor.execute {
            var imported: File? = null
            val result = runCatching {
                imported = library.importModel(uri) { progress -> bridge.notifyImportProgress("model", name, progress) }
                prepareModel(imported!!)
            }
            modelImportBusy = false
            bridge.notifyModelLoadResult(result, imported?.name ?: name)
        }
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
        // Enables the existing JS confirm/alert/prompt dialogs, including deletion confirmations.
        webView.webChromeClient = WebChromeClient()
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = false
        webView.settings.allowContentAccess = false
        webView.webViewClient = object : WebViewClientCompat() {
            private var restored = false
            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                if (!restored) { restored = true; autoLoadPrimaryModel() }
            }
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? = loader.shouldInterceptRequest(request.url)
            @Deprecated("Deprecated in Java") override fun shouldInterceptRequest(view: WebView, url: String): WebResourceResponse? = loader.shouldInterceptRequest(Uri.parse(url))
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) = request.url.host != "appassets.androidplatform.net"
        }
        webView.addJavascriptInterface(bridge, "HarunaAndroid")
        webView.loadUrl("https://appassets.androidplatform.net/assets/haruna/index.html")
    }

    private fun prepareModel(file: File) {
        bridge.notifyModelPreparing(file.name)
        if (activeModelPath != file.absolutePath || !backend.status().modelLoaded) {
            if (backend.status().modelLoaded) backend.unloadModel().getOrThrow()
            activeModelPath = null
            backend.loadModel(file.absolutePath).getOrThrow()
            activeModelPath = file.absolutePath
        }
        library.rememberActive(file)
    }

    fun activeModelPath(): String? = activeModelPath.takeIf { backend.status().modelLoaded }

    @Synchronized fun downloadRecommendedModel(url: String, name: String) {
        if (modelImportBusy) { bridge.notifyDownloadRejected(name, "Já existe uma instalação em andamento."); return }
        modelImportBusy = true; bridge.notifyDownloadStarted(name)
        modelExecutor.execute {
            var downloaded: File? = null
            val result = runCatching {
                val existing = library.installedModel(name)
                if (existing != null) {
                    downloaded = existing
                    prepareModel(existing)
                    return@runCatching
                }
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
        }
    }

    @Synchronized private fun autoLoadPrimaryModel() {
        if (modelImportBusy) return
        val file = library.startupModel() ?: return
        modelImportBusy = true
        modelExecutor.execute {
            val result = runCatching { prepareModel(file) }
            modelImportBusy = false
            bridge.notifyModelLoadResult(result, file.name)
        }
    }
    @Synchronized fun pickModel() {
        if (modelImportBusy || modelPickerOpen) return
        modelImportBusy = true
        modelPickerOpen = true
        try { modelPicker.launch(arrayOf("application/octet-stream", "*/*")) }
        catch (e: Exception) { modelImportBusy = false; modelPickerOpen = false; bridge.notifyDownloadRejected("", e.message ?: "Não foi possível abrir o seletor") }
    }
    fun pickAttachment() = attachmentPicker.launch(arrayOf("text/plain", "text/markdown", "application/pdf", "image/*", "*/*"))
    @Synchronized fun useModel(path: String) {
        if (modelImportBusy) { bridge.notifyDownloadRejected(File(path).name, "Já existe uma instalação em andamento."); return }
        modelImportBusy = true
        modelExecutor.execute {
            val file = File(path)
            val result = runCatching {
                require(file.parentFile?.canonicalFile == library.modelsDir.canonicalFile && file.isFile) { "Modelo inválido" }
                prepareModel(file)
            }
            modelImportBusy = false
            bridge.notifyModelLoadResult(result, file.name)
        }
    }
    override fun onDestroy() { modelExecutor.shutdown(); webView.removeJavascriptInterface("HarunaAndroid"); webView.stopLoading(); webView.destroy(); super.onDestroy() }
}
