package com.proxyslabs.haruna

import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors

class HarunaAndroidBridge(private val activity: MainActivity, private val webView: WebView, private val backend: LlmBackend) {
    private val executor = Executors.newSingleThreadExecutor()
    @JavascriptInterface fun isAvailable() = backend.status().available
    @JavascriptInterface fun getStatus() = statusJson().toString()
    @JavascriptInterface fun loadModel(modelJson: String): String { activity.runOnUiThread { activity.pickModel() }; return JSONObject().put("status","loading").put("pendingSelection",true).toString() }
    @JavascriptInterface fun listModels(): String = activity.library.modelsJson(null)
    @JavascriptInterface fun useModel(path: String): String { activity.useModel(path); return JSONObject().put("status","loading").toString() }
    @JavascriptInterface fun setPrimaryModel(path: String): String = runCatching { activity.library.setPrimary(path) }.fold({ JSONObject().put("status","ok").toString() }, { JSONObject().put("status","error").put("error",it.message).toString() })
    @JavascriptInterface fun deleteModel(path: String): String = runCatching { val s=backend.status(); if(s.modelName==File(path).name) backend.unloadModel().getOrThrow(); activity.library.deleteModel(path) }.fold({ emitStatus(); JSONObject().put("status","ok").toString() }, { JSONObject().put("status","error").put("error",it.message).toString() })
    @JavascriptInterface fun pickAttachment(): String { activity.runOnUiThread { activity.pickAttachment() }; return JSONObject().put("status","selecting").toString() }
    @JavascriptInterface fun unloadModel(): String { val r=backend.unloadModel();emitStatus();return JSONObject().put("status",if(r.isSuccess)"ok" else "error").put("modelLoaded",false).toString() }
    @JavascriptInterface fun resetConversation(): String { val r=backend.resetConversation();emitStatus();return JSONObject().put("status",if(r.isSuccess)"ok" else "error").put("error",r.exceptionOrNull()?.message).toString() }
    @JavascriptInterface fun generate(payloadJson:String):String{val id=JSONObject(payloadJson).getString("requestId");executor.execute{backend.generate(id,payloadJson,{emit(JSONObject().put("requestId",id).put("type","token").put("token",it))},{emit(JSONObject().put("requestId",id).put("type","completed").put("text",it))},{c,m->emitError(id,c,m)})};return JSONObject().put("streaming",true).toString()}
    @JavascriptInterface fun stopGeneration(requestId:String):String{val r=backend.stop(requestId);return JSONObject().put("status",if(r.isSuccess)"ok" else "error").toString()}
    fun notifyModelLoadResult(result:Result<Unit>){emitStatus();if(result.isFailure)emit(JSONObject().put("type","status").put("state","error").put("error",result.exceptionOrNull()?.message))}
    fun notifyAttachmentResult(result:Result<File>){result.onSuccess{emit(JSONObject().put("type","attachment").put("name",it.name).put("path",it.absolutePath).put("bytes",it.length()))}.onFailure{emit(JSONObject().put("type","attachment").put("error",it.message))}}
    private fun statusJson():JSONObject{val s=backend.status();return JSONObject().put("available",s.available).put("modelLoaded",s.modelLoaded).put("state",s.state).put("modelName",s.modelName).put("error",s.error)}
    private fun emitStatus()=emit(statusJson().put("type","status"))
    private fun emitError(id:String,code:String,message:String)=emit(JSONObject().put("requestId",id).put("type","error").put("error",JSONObject().put("code",code).put("message",message)))
    private fun emit(event:JSONObject){webView.post{webView.evaluateJavascript("window.harunaAndroidOnEvent(${JSONObject.quote(event.toString())})",null)}}
}