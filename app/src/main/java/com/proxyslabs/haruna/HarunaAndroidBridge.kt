package com.proxyslabs.haruna

import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject
import java.util.concurrent.Executors

class HarunaAndroidBridge(private val activity: MainActivity, private val webView: WebView, private val backend: LlmBackend) {
    private val worker = Executors.newSingleThreadExecutor()

    @JavascriptInterface fun isAvailable() = backend.status().available
    @JavascriptInterface fun getStatus(): String { val s=backend.status(); return JSONObject().put("available",s.available).put("modelLoaded",s.modelLoaded).put("state",s.state).apply { s.modelName?.let{put("modelName",it)}; s.error?.let{put("error",it)} }.toString() }

    @JavascriptInterface fun loadModel(modelJson: String): String {
        activity.runOnUiThread { activity.pickGgufModel() }
        return JSONObject().put("status","loading").put("modelLoaded",false).put("pendingSelection",true).toString()
    }

    @JavascriptInterface fun unloadModel(): String { val r=backend.unloadModel(); return if(r.isSuccess) JSONObject().put("status","ok").put("modelLoaded",false).toString() else errorJson("unload_failed",r.exceptionOrNull()?.message?:"Falha ao descarregar.") }

    @JavascriptInterface fun generate(payloadJson: String): String {
        val requestId=runCatching{JSONObject(payloadJson).getString("requestId")}.getOrNull()?:return errorJson("invalid_request","requestId ausente.")
        worker.execute { backend.generate(requestId,payloadJson,{emit(requestId,"token",token=it)},{emit(requestId,"completed",text=it)},{code,msg->emitError(requestId,code,msg)}) }
        return JSONObject().put("streaming",true).toString()
    }

    @JavascriptInterface fun stopGeneration(requestId:String):String { val r=backend.stop(requestId); return if(r.isSuccess) JSONObject().put("status","ok").toString() else errorJson("stop_failed",r.exceptionOrNull()?.message?:"Falha ao interromper.") }

    fun notifyModelLoadResult(result:Result<Unit>) {
        val js=if(result.isSuccess) "window.dispatchEvent(new Event('haruna-native-status-changed'));" else "window.dispatchEvent(new Event('haruna-native-status-changed'));"
        webView.post { webView.evaluateJavascript(js,null) }
    }

    private fun emit(requestId:String,type:String,token:String?=null,text:String?=null) { val obj=JSONObject().put("requestId",requestId).put("type",type); token?.let{obj.put("token",it)}; text?.let{obj.put("text",it)}; val arg=JSONObject.quote(obj.toString()); webView.post{webView.evaluateJavascript("window.harunaAndroidOnEvent($arg);",null)} }
    private fun emitError(requestId:String,code:String,message:String) { val obj=JSONObject().put("requestId",requestId).put("type","error").put("error",JSONObject().put("code",code).put("message",message)); val arg=JSONObject.quote(obj.toString()); webView.post{webView.evaluateJavascript("window.harunaAndroidOnEvent($arg);",null)} }
    private fun errorJson(code:String,message:String)=JSONObject().put("status","error").put("error",JSONObject().put("code",code).put("message",message)).toString()
}
