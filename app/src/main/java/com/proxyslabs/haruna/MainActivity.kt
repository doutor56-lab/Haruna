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
    companion object { private const val PREFS="haruna_runtime"; private const val LAST_MODEL="last_model_path" }
    private lateinit var webView:WebView; private lateinit var backend:LlmBackend; private lateinit var bridge:HarunaAndroidBridge
    private val picker=registerForActivityResult(ActivityResultContracts.OpenDocument()){uri->
        if(uri==null){bridge.notifyModelLoadResult(Result.failure(IllegalStateException("Seleção cancelada")));return@registerForActivityResult}
        Thread{var selectedPath:String?=null;val result=runCatching{val displayName=queryDisplayName(uri)?:"haruna-model.gguf";require(displayName.endsWith(".gguf",true)){"Selecione um arquivo .gguf"};val safeName=displayName.replace(Regex("[^A-Za-z0-9._-]"),"_");val dir=File(filesDir,"models").apply{mkdirs()};val target=File(dir,safeName);val tmp=File(dir,"$safeName.part");contentResolver.openInputStream(uri).use{input->requireNotNull(input);FileOutputStream(tmp).use{out->input.copyTo(out,1024*1024)}};require(tmp.length()>0);if(target.exists())target.delete();require(tmp.renameTo(target));selectedPath=target.absolutePath;backend.loadModel(target.absolutePath).getOrThrow();getSharedPreferences(PREFS,MODE_PRIVATE).edit().putString(LAST_MODEL,target.absolutePath).apply()};if(result.isFailure&&selectedPath!=null){val p=getSharedPreferences(PREFS,MODE_PRIVATE);if(p.getString(LAST_MODEL,null)==selectedPath)p.edit().remove(LAST_MODEL).apply()};bridge.notifyModelLoadResult(result)}.start()}
    override fun onCreate(savedInstanceState:Bundle?){super.onCreate(savedInstanceState);webView=WebView(this);setContentView(webView);backend=LlamaCppBackend(applicationContext);bridge=HarunaAndroidBridge(this,webView,backend);val loader=WebViewAssetLoader.Builder().addPathHandler("/assets/",WebViewAssetLoader.AssetsPathHandler(this)).build();webView.settings.javaScriptEnabled=true;webView.settings.domStorageEnabled=true;webView.settings.allowFileAccess=false;webView.settings.allowContentAccess=false;webView.webViewClient=object:WebViewClientCompat(){override fun shouldInterceptRequest(view:WebView,request:WebResourceRequest):WebResourceResponse?=loader.shouldInterceptRequest(request.url);@Deprecated("Deprecated in Java") override fun shouldInterceptRequest(view:WebView,url:String):WebResourceResponse?=loader.shouldInterceptRequest(Uri.parse(url));override fun shouldOverrideUrlLoading(view:WebView,request:WebResourceRequest)=request.url.host!="appassets.androidplatform.net"};webView.addJavascriptInterface(bridge,"HarunaAndroid");webView.loadUrl("https://appassets.androidplatform.net/assets/haruna/index.html");autoLoadLastModel()}
    private fun autoLoadLastModel(){val prefs=getSharedPreferences(PREFS,MODE_PRIVATE);val path=prefs.getString(LAST_MODEL,null)?:return;val file=File(path);if(!file.isFile){prefs.edit().remove(LAST_MODEL).apply();return};Thread{val current=backend.status();val result=if(current.modelLoaded) Result.success(Unit) else backend.loadModel(file.absolutePath);/* Keep the known-good path on transient lifecycle failures; a later launch can retry. */bridge.notifyModelLoadResult(result)}.start()}
    override fun onDestroy(){webView.removeJavascriptInterface("HarunaAndroid");webView.stopLoading();webView.destroy();/* AiChat owns process-level native state. Do not destroy it merely because Android recreated this Activity. */super.onDestroy()}
    fun pickModel(){picker.launch(arrayOf("application/octet-stream","*/*"))}
    private fun queryDisplayName(uri:Uri):String?{var c:Cursor?=null;return try{c=contentResolver.query(uri,arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null);if(c!=null&&c.moveToFirst())c.getString(0)else null}finally{c?.close()}}
}
