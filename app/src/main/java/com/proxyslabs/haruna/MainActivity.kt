package com.proxyslabs.haruna

import android.net.Uri
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
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
    private lateinit var imageModels: com.proxyslabs.haruna.image.ImageBridge
    private val imagePicker = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> if(uri!=null) imageModels.install(uri) }
    private lateinit var recognition: com.proxyslabs.haruna.speech.RecognitionBridge
    private lateinit var speech: com.proxyslabs.haruna.speech.SpeechBridge
    private lateinit var diagnostics: com.proxyslabs.haruna.diagnostics.DiagnosticBridge
    private lateinit var chromeClient: HarunaWebChromeClient
    private lateinit var backend: LlmBackend
    private lateinit var bridge: HarunaAndroidBridge
    @Volatile private var modelImportBusy = false
    @Volatile private var activityClosed = false
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
            if (activityClosed) return@execute
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

    private var voicePickerOpen = false
    private val voicePicker = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        voicePickerOpen = false
        if (uri != null) speech.importModel(uri) else speech.selectionCancelled()
    }
    fun pickVoiceModel() {
        if (voicePickerOpen) return
        voicePickerOpen = true
        try { voicePicker.launch(arrayOf("application/x-bzip2", "application/octet-stream", "*/*")) }
        catch (failure: Exception) { voicePickerOpen = false; speech.selectionFailed(failure.message ?: "Não foi possível abrir o seletor de voz") }
    }

    private var recognitionPickerOpen = false
    private val recognitionPicker = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        recognitionPickerOpen = false
        if (uri != null) recognition.importModel(uri)
    }
    fun pickRecognitionModel() {
        if (recognitionPickerOpen) return
        recognitionPickerOpen = true
        try { recognitionPicker.launch(arrayOf("application/x-bzip2", "application/octet-stream", "*/*")) }
        catch (failure: Exception) { recognitionPickerOpen = false; recognition.selectionFailed(failure.message ?: "Não foi possível abrir o seletor") }
    }
    private var pendingVoicePermission: Pair<String, String>? = null
    private val voicePermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val pending = pendingVoicePermission; pendingVoicePermission = null
        if (pending != null) { if (granted) requestVoicePermission(pending.first, pending.second) else recognition.denied(pending.second) }
    }
    private val callNotificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val pending = pendingVoicePermission; pendingVoicePermission = null
        if (pending != null) {
            if (granted) requestVoicePermission(pending.first, pending.second)
            else recognition.permissionFailed("Permita as notificações para manter uma chamada com controle de encerramento em segundo plano. O ditado continua disponível.", pending.second)
        }
    }
    fun requestVoicePermission(mode: String, id: String) {
        if (mode == "call" && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            pendingVoicePermission = mode to id
            callNotificationPermission.launch(android.Manifest.permission.POST_NOTIFICATIONS)
            return
        }
        if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) == android.content.pm.PackageManager.PERMISSION_GRANTED) recognition.permitted(mode, id)
        else { pendingVoicePermission = mode to id; try { voicePermission.launch(android.Manifest.permission.RECORD_AUDIO) } catch (failure: Exception) { pendingVoicePermission = null; recognition.permissionFailed(failure.message ?: "Não foi possível solicitar o microfone", id) } }
    }
    fun prepareToListen(ready: () -> Unit) = speech.prepareForListening(ready)
    fun stopListening() { if (::recognition.isInitialized) recognition.stop() }

    private val callStopReceiver = object : android.content.BroadcastReceiver() {
        override fun onReceive(context: android.content.Context?, intent: android.content.Intent?) {
            if (intent?.action == com.proxyslabs.haruna.speech.VoiceCallService.STOP) {
                stopListening(); speech.stop()
                webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('haruna-call-stop'))", null)
            }
        }
    }
    fun ensureBackgroundVoiceCall() {
        if (!com.proxyslabs.haruna.speech.VoiceCallService.running) {
            check(!activityClosed && lifecycle.currentState.isAtLeast(androidx.lifecycle.Lifecycle.State.STARTED)) { "Inicie a chamada com a Haruna visível." }
            startForegroundService(android.content.Intent(this, com.proxyslabs.haruna.speech.VoiceCallService::class.java))
        }
    }
    fun endBackgroundVoiceCall() { stopService(android.content.Intent(this, com.proxyslabs.haruna.speech.VoiceCallService::class.java)) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        library = LocalLibrary(applicationContext)
        webView = WebView(this)
        setContentView(webView)
        backend = HarunaRuntime.backend(applicationContext)
        activeModelPath = backend.installedModelPath()
        bridge = HarunaAndroidBridge(this, webView, backend)
        val loader = WebViewAssetLoader.Builder().addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .addPathHandler("/generated/", WebViewAssetLoader.PathHandler { path ->
                if(!path.matches(Regex("[0-9a-f-]{36}\\.png"))) null else {
                    val file=java.io.File(filesDir,"generated-images/$path")
                    if(file.isFile) android.webkit.WebResourceResponse("image/png",null,file.inputStream()) else null
                }
            }).build()
        // Enables the existing JS confirm/alert/prompt dialogs, including deletion confirmations.
        chromeClient = HarunaWebChromeClient(this)
        webView.webChromeClient = chromeClient
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
        imageModels=com.proxyslabs.haruna.image.ImageBridge(applicationContext,backend){runOnUiThread{if(!activityClosed) imagePicker.launch(arrayOf("*/*"))}}
        webView.addJavascriptInterface(imageModels,"HarunaImages")
        speech = com.proxyslabs.haruna.speech.SpeechBridge(this, webView)
        webView.addJavascriptInterface(speech, "HarunaSpeech")
        recognition = com.proxyslabs.haruna.speech.RecognitionBridge(this, webView)
        webView.addJavascriptInterface(recognition, "HarunaRecognition")
        webView.addJavascriptInterface(com.proxyslabs.haruna.speech.VoiceCallBridge(this), "HarunaVoiceCall")
        registerReceiver(callStopReceiver, android.content.IntentFilter(com.proxyslabs.haruna.speech.VoiceCallService.STOP), RECEIVER_NOT_EXPORTED)
        // Diagnostics is optional: failure to create its bridge must not block the app.
        runCatching {
            diagnostics = com.proxyslabs.haruna.diagnostics.DiagnosticBridge(this, webView, backend,
                { backend.installedModelPath()?.let { File(it) } }, { recognition.getStatus() }, { speech.getStatus() })
            webView.addJavascriptInterface(diagnostics, "HarunaDiagnostics")
        }
        webView.loadUrl("https://appassets.androidplatform.net/assets/haruna/index.html")
    }

    private fun prepareModel(file: File) {
        if (activityClosed) return
        bridge.notifyModelPreparing(file.name)
        // The process owner serializes replacement and reuses an already active installation.
        backend.loadModel(file.absolutePath).getOrThrow()
        if (activityClosed) return
        activeModelPath = file.absolutePath
        library.rememberActive(file)
    }

    fun activeModelPath(): String? = backend.installedModelPath()

    @Synchronized fun downloadRecommendedModel(url: String, name: String) {
        if (activityClosed) return
        if (modelImportBusy) { bridge.notifyDownloadRejected(name, "Já existe uma instalação em andamento."); return }
        modelImportBusy = true; bridge.notifyDownloadStarted(name)
        modelExecutor.execute {
            if (activityClosed) return@execute
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
        if (activityClosed || modelImportBusy) return
        backend.installedModelPath()?.let { path ->
            activeModelPath = path
            bridge.notifyModelLoadResult(Result.success(Unit), File(path).name)
            return
        }
        val file = library.startupModel() ?: return
        modelImportBusy = true
        modelExecutor.execute {
            if (activityClosed) return@execute
            val result = runCatching { prepareModel(file) }
            modelImportBusy = false
            bridge.notifyModelLoadResult(result, file.name)
        }
    }
    @Synchronized fun pickModel() {
        if (activityClosed || modelImportBusy || modelPickerOpen) return
        modelImportBusy = true
        modelPickerOpen = true
        try { modelPicker.launch(arrayOf("application/octet-stream", "*/*")) }
        catch (e: Exception) { modelImportBusy = false; modelPickerOpen = false; bridge.notifyDownloadRejected("", e.message ?: "Não foi possível abrir o seletor") }
    }
    fun pickAttachment() = attachmentPicker.launch(arrayOf("text/plain", "text/markdown", "application/pdf", "image/*", "*/*"))
    @Synchronized fun useModel(path: String) {
        if (activityClosed) return
        if (modelImportBusy) { bridge.notifyDownloadRejected(File(path).name, "Já existe uma instalação em andamento."); return }
        modelImportBusy = true
        modelExecutor.execute {
            if (activityClosed) return@execute
            val file = File(path)
            val result = runCatching {
                require(file.parentFile?.canonicalFile == library.modelsDir.canonicalFile && file.isFile) { "Modelo inválido" }
                prepareModel(file)
            }
            modelImportBusy = false
            bridge.notifyModelLoadResult(result, file.name)
        }
    }
    override fun onStop() {
        pendingVoicePermission = null
        val calling = com.proxyslabs.haruna.speech.VoiceCallService.running
        if (::recognition.isInitialized) { if (!calling) recognition.stop(); recognition.cancelInstallation() }
        if (::speech.isInitialized) { if (!calling) speech.suspendForBackground(); speech.cancelInstallation() }
        super.onStop()
    }
    override fun onDestroy() {
        activityClosed = true
        if(::imageModels.isInitialized) imageModels.close()
        webView.removeJavascriptInterface("HarunaImages")
        endBackgroundVoiceCall()
        runCatching { unregisterReceiver(callStopReceiver) }
        webView.removeJavascriptInterface("HarunaVoiceCall")
        if (::bridge.isInitialized) bridge.close()
        if (::diagnostics.isInitialized) diagnostics.close()
        webView.removeJavascriptInterface("HarunaDiagnostics"); recognition.close()
        webView.removeJavascriptInterface("HarunaRecognition"); speech.close()
        webView.removeJavascriptInterface("HarunaSpeech"); chromeClient.dispose()
        // Do not interrupt runBlocking/native model load: let the process owner finish ownership transfer.
        modelExecutor.shutdown()
        webView.removeJavascriptInterface("HarunaAndroid"); webView.stopLoading(); webView.destroy()
        // Process-owned GGUF runtime intentionally survives Activity recreation/background.
        super.onDestroy()
    }
}


