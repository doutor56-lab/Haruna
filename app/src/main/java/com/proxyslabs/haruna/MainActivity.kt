package com.proxyslabs.haruna

import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import java.io.File
import java.io.FileOutputStream

class MainActivity:AppCompatActivity(){
 private lateinit var webView:WebView; private lateinit var backend:LlmBackend; private lateinit var bridge:HarunaAndroidBridge
 private val picker=registerForActivityResult(ActivityResultContracts.OpenDocument()){uri->
   if(uri==null){bridge.notifyModelLoadResult(Result.failure(IllegalStateException("Seleção cancelada")));return@registerForActivityResult}
   Thread{
     val result=runCatching{
       val name=(uri.lastPathSegment?.substringAfterLast('/')?:"haruna-model.gguf").let{if(it.endsWith(".gguf",true))it else "$it.gguf"}
       val dir=File(filesDir,"models").apply{mkdirs()}; val out=File(dir,name)
       contentResolver.openInputStream(uri).use{input->requireNotNull(input);FileOutputStream(out).use{output->input.copyTo(output,1024*1024)}}
       backend.loadModel(out.absolutePath).getOrThrow()
     }
     bridge.notifyModelLoadResult(result)
   }.start()
 }
 override fun onCreate(savedInstanceState:Bundle?){super.onCreate(savedInstanceState);webView=WebView(this);setContentView(webView);backend=LlamaCppBackend(applicationContext);bridge=HarunaAndroidBridge(this,webView,backend);webView.settings.javaScriptEnabled=true;webView.settings.domStorageEnabled=true;webView.settings.allowFileAccess=true;webView.settings.allowContentAccess=false;webView.webViewClient=object:WebViewClient(){override fun shouldOverrideUrlLoading(view:WebView?,url:String?)=url?.startsWith("file:///android_asset/haruna/")!=true};webView.addJavascriptInterface(bridge,"HarunaAndroid");webView.loadUrl("file:///android_asset/haruna/index.html")}
 fun pickModel(){picker.launch(arrayOf("application/octet-stream","*/*"))}
}
