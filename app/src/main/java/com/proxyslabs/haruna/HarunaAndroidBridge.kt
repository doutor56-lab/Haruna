package com.proxyslabs.haruna
import com.proxyslabs.haruna.diagnostics.DiagnosticSession
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
class HarunaAndroidBridge(private val activity:MainActivity,private val webView:WebView,private val backend:LlmBackend):AutoCloseable{
 private val executor=Executors.newSingleThreadExecutor()
 private val closed=AtomicBoolean(false)
 private class Pending { val cancelled=AtomicBoolean(false); lateinit var stream:StreamDelivery }
 private val main=Handler(Looper.getMainLooper())
 private val pending=ConcurrentHashMap<String,Pending>()
 private val requestGate=Any()
 private val unsubscribeStatus=backend.subscribeStatus{emitStatus()}
 init { DiagnosticSession.bridgeOpened() }
 @JavascriptInterface fun isAvailable()=!closed.get()&&backend.status().available
 @JavascriptInterface fun getAssistantIdentity():String=HarunaIdentity.NAME
 @JavascriptInterface fun getBehaviorProfile():String=HarunaBehaviorProfile.metadata().toString()
 @JavascriptInterface fun getStatus()=statusJson().toString()
 @JavascriptInterface fun loadModel(modelJson:String):String{activity.runOnUiThread{activity.pickModel()};return JSONObject().put("status","selecting").put("pendingSelection",true).toString()}
 @JavascriptInterface fun downloadModel(modelJson:String):String{return runCatching{val m=JSONObject(modelJson);val url=m.getString("url");val name=m.getString("fileName");activity.downloadRecommendedModel(url,name);JSONObject().put("status","downloading").put("name",name).toString()}.getOrElse{JSONObject().put("status","error").put("error",it.message).toString()}}
 @JavascriptInterface fun listModels():String=activity.library.modelsJson(activity.activeModelPath())
 @JavascriptInterface fun useModel(path:String):String{activity.useModel(path);return JSONObject().put("status","loading").toString()}
 @JavascriptInterface fun setPrimaryModel(path:String)=runCatching{activity.library.setPrimary(path)}.fold({JSONObject().put("status","ok").toString()},{JSONObject().put("status","error").put("error",it.message).toString()})
 @JavascriptInterface fun deleteModel(path:String)=runCatching{check(!closed.get()){"Ponte encerrada"};val s=backend.status();if(s.modelName==File(path).name)backend.unloadModel().getOrThrow();activity.library.deleteModel(path)}.fold({emitStatus();JSONObject().put("status","ok").toString()},{JSONObject().put("status","error").put("error",it.message).toString()})
 @JavascriptInterface fun pickAttachment():String{activity.runOnUiThread{activity.pickAttachment()};return JSONObject().put("status","selecting").toString()}
 @JavascriptInterface fun readTextAttachment(path:String):String=runCatching{activity.library.readTextAttachment(path)}.fold({JSONObject().put("status","ok").put("text",it).toString()},{JSONObject().put("status","error").put("error",it.message).toString()})
 @JavascriptInterface fun deleteAttachment(path:String):String=runCatching{activity.library.deleteAttachment(path)}.fold({JSONObject().put("status","ok").toString()},{JSONObject().put("status","error").put("error",it.message).toString()})
 @JavascriptInterface fun unloadModel():String{if(closed.get())return JSONObject().put("status","error").toString();val r=backend.unloadModel();emitStatus();return JSONObject().put("status",if(r.isSuccess)"ok" else "error").put("modelLoaded",false).toString()}
 @JavascriptInterface fun resetConversation():String{if(closed.get())return JSONObject().put("status","error").toString();val r=backend.resetConversation();emitStatus();return JSONObject().put("status",if(r.isSuccess)"ok" else "error").put("error",r.exceptionOrNull()?.message).toString()}
 @JavascriptInterface fun generate(payloadJson:String):String {
  val id=JSONObject(payloadJson).getString("requestId")
  if(closed.get())return JSONObject().put("status","error").put("error",JSONObject().put("message","Ponte encerrada")).toString()
  val handle=Pending()
  handle.stream=StreamDelivery(
   clock={SystemClock.elapsedRealtime()},
   schedule={delay,action->
    val task=Runnable{action()};main.postDelayed(task,delay)
    val cancel:()->Unit={main.removeCallbacks(task)};cancel
   },
   send={batch,ack->sendBatch(id,handle,batch,ack)},
   observed={stats->DiagnosticSession.transport(id,stats)},
   overflow={handle.cancelled.set(true);backend.stop(id)},
   retired={pending.remove(id,handle)}
  )
  if(pending.putIfAbsent(id,handle)!=null)return JSONObject().put("status","error").put("error",JSONObject().put("message","Pedido duplicado")).toString()
  DiagnosticSession.llmStarted(id)
  try{executor.execute {
   synchronized(requestGate){
   if(closed.get()||handle.cancelled.get()){DiagnosticSession.llmFinished(id,false,true);handle.stream.finish(StreamDelivery.End("cancelled","Geração interrompida"));return@execute}
   var firstOutputObserved=false
   backend.generate(id,payloadJson,{token->
    if(!firstOutputObserved && token.isNotEmpty()){firstOutputObserved=true;DiagnosticSession.llmFirstOutput(id)}
    if(pending[id]===handle&&!closed.get())handle.stream.offer(token) else DiagnosticSession.callbackDiscarded()
   },{
    DiagnosticSession.llmFinished(id,true)
    handle.stream.finish(if(handle.cancelled.get())StreamDelivery.End("cancelled","Geração interrompida") else StreamDelivery.End())
   },{code,message->
    DiagnosticSession.llmFinished(id,false,code=="cancelled")
    handle.stream.finish(StreamDelivery.End(code,message))
   })
   }
  }}catch(_:java.util.concurrent.RejectedExecutionException){handle.stream.close();pending.remove(id,handle);DiagnosticSession.llmFinished(id,false,true);return JSONObject().put("status","error").put("error",JSONObject().put("message","Ponte encerrada")).toString()}
  return JSONObject().put("streaming",true).toString()
 }
 @JavascriptInterface fun stopGeneration(requestId:String):String=synchronized(requestGate){val h=pending[requestId];h?.cancelled?.set(true);h?.stream?.stopInput();val r=backend.stop(requestId);JSONObject().put("status",if(r.isSuccess)"ok" else "error").put("draining",h!=null).toString()}
 fun notifyImportStarted(kind:String,name:String){emit(JSONObject().put("type","import-progress").put("kind",kind).put("state","copying").put("name",name).put("copiedBytes",0))}
 fun notifyImportProgress(kind:String,name:String,progress:LocalLibrary.CopyProgress){val e=JSONObject().put("type","import-progress").put("kind",kind).put("state","copying").put("name",name).put("copiedBytes",progress.copiedBytes);progress.totalBytes?.let{e.put("totalBytes",it);if(it>0)e.put("percent",((progress.copiedBytes*100)/it).toInt().coerceIn(0,100))};emit(e)}
 fun notifyDownloadStarted(name:String){emit(JSONObject().put("type","import-progress").put("kind","model").put("state","downloading").put("name",name).put("copiedBytes",0))}
 fun notifyDownloadProgress(name:String,progress:LocalLibrary.CopyProgress){val e=JSONObject().put("type","import-progress").put("kind","model").put("state","downloading").put("name",name).put("copiedBytes",progress.copiedBytes);progress.totalBytes?.let{e.put("totalBytes",it);if(it>0)e.put("percent",((progress.copiedBytes*100)/it).toInt().coerceIn(0,100))};emit(e)}
 fun notifyDownloadRejected(name:String,message:String){emit(JSONObject().put("type","import-progress").put("kind","model").put("state","error").put("name",name).put("error",message))}
 fun notifyModelSelectionCancelled(){emit(JSONObject().put("type","import-progress").put("kind","model").put("state","cancelled"))}
 fun notifyModelPreparing(name:String){emit(JSONObject().put("type","import-progress").put("kind","model").put("state","preparing").put("name",name).put("percent",100))}
 fun notifyModelLoadResult(result:Result<Unit>,name:String?=null){emitStatus();result.onSuccess{emit(JSONObject().put("type","import-progress").put("kind","model").put("state","completed").put("name",name).put("percent",100))}.onFailure{emit(JSONObject().put("type","import-progress").put("kind","model").put("state","error").put("name",name).put("error",it.message))}}
 fun notifyAttachmentCancelled(){emit(JSONObject().put("type","attachment").put("cancelled",true))}
 fun notifyAttachmentResult(result:Result<File>){result.onSuccess{emit(JSONObject().put("type","attachment").put("name",it.name).put("path",it.absolutePath).put("bytes",it.length()).put("readable",it.extension.lowercase() in setOf("txt","md","csv","json","log")))}.onFailure{emit(JSONObject().put("type","attachment").put("error",it.message))}}
 private fun statusJson():JSONObject{val s=backend.status();return JSONObject().put("available",s.available).put("modelLoaded",s.modelLoaded).put("state",s.state).put("modelName",s.modelName).put("error",s.error)}
 private fun emitStatus()=emit(statusJson().put("type","status"))
 private fun sendBatch(id:String,handle:Pending,batch:StreamDelivery.Batch,ack:(Boolean)->Unit){
  if(closed.get()||pending[id]!==handle){DiagnosticSession.callbackDiscarded();ack(false);return}
  val event=JSONObject().put("requestId",id).put("type","stream").put("sequence",batch.sequence)
   .put("delta",batch.text).put("sourceDeltas",batch.deltas)
  batch.end?.let{end->event.put("final",JSONObject().put("type",if(end.code==null)"completed" else "error").put("code",end.code).put("message",end.message))}
  if(batch.text.isNotEmpty())DiagnosticSession.llmEventSent(id)
  try{webView.evaluateJavascript("window.harunaAndroidOnEvent(${JSONObject.quote(event.toString())})"){raw->
   val accepted=runCatching{val value=JSONObject(raw);value.optString("requestId")==id&&value.optLong("sequence")==batch.sequence&&value.optBoolean("accepted")}.getOrDefault(false)
   ack(accepted)
  }}catch(_:Exception){ack(false)}
 }
 private fun emit(event:JSONObject){
  if(closed.get()){DiagnosticSession.callbackDiscarded();return}
  webView.post{
   if(closed.get()){DiagnosticSession.callbackDiscarded();return@post}
   webView.evaluateJavascript("window.harunaAndroidOnEvent(${JSONObject.quote(event.toString())})",null)
  }
 }
 override fun close(){
  if(!closed.compareAndSet(false,true))return
  unsubscribeStatus()
  synchronized(requestGate){
   pending.forEach{(id,handle)->handle.cancelled.set(true);handle.stream.close();if(backend is LlamaCppBackend)backend.detachRequest(id) else backend.stop(id);DiagnosticSession.llmFinished(id,false,true)}
   pending.clear();executor.shutdownNow()
  }
  DiagnosticSession.bridgeClosed()
 }
}


