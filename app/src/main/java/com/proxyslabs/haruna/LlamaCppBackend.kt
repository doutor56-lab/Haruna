package com.proxyslabs.haruna

import android.content.Context
import com.arm.aichat.AiChat
import com.arm.aichat.InferenceEngine
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.collect
import org.json.JSONObject
import java.io.File
import java.util.concurrent.ConcurrentHashMap

class LlamaCppBackend(context: Context) : LlmBackend {
 private val scope=CoroutineScope(SupervisorJob()+Dispatchers.Default)
 private val engine: InferenceEngine = AiChat.getInferenceEngine(context.applicationContext)
 private val jobs=ConcurrentHashMap<String,Job>()
 @Volatile private var loaded=false
 @Volatile private var loading=false
 @Volatile private var modelName:String?=null
 @Volatile private var lastError:String?=null
 override fun status()=LlmBackend.Status(true,loaded,when{loading->"loading";loaded->"active";lastError!=null->"error";else->"not_loaded"},modelName,lastError)
 override fun loadModel(localPath:String):Result<Unit> = runCatching {
   loading=true; lastError=null
   val f=File(localPath); require(f.exists() && f.extension.equals("gguf",true)){"Arquivo GGUF inválido"}
   runBlocking(Dispatchers.IO){ engine.loadModel(f.path) }
   loaded=true; modelName=f.name
 }.onFailure { loaded=false; lastError=it.message }.also { loading=false }
 override fun unloadModel():Result<Unit> = runCatching { jobs.values.forEach{it.cancel()};jobs.clear(); loaded=false;modelName=null;lastError=null }
 override fun generate(requestId:String,payloadJson:String,onToken:(String)->Unit,onComplete:(String)->Unit,onError:(String,String)->Unit){
   if(!loaded){onError("model_not_loaded","Nenhum modelo GGUF carregado");return}
   val job=scope.launch {
     try {
       val root=JSONObject(payloadJson); val msgs=root.optJSONArray("messages")
       var prompt=""
       if(msgs!=null) for(i in 0 until msgs.length()){val m=msgs.getJSONObject(i); if(m.optString("role")=="user") prompt=m.optString("content")}
       require(prompt.isNotBlank()){ "Prompt vazio" }
       val out=StringBuilder()
       engine.sendUserPrompt(prompt).collect { token -> out.append(token); withContext(Dispatchers.Main){onToken(token)} }
       withContext(Dispatchers.Main){onComplete(out.toString())}
     } catch(e:CancellationException){ withContext(Dispatchers.Main){onError("cancelled","Geração interrompida")}; throw e }
       catch(e:Throwable){lastError=e.message;withContext(Dispatchers.Main){onError("generation_failed",e.message?:"Falha na inferência local")}}
     finally { jobs.remove(requestId) }
   }
   jobs[requestId]=job
 }
 override fun stop(requestId:String):Result<Unit> = runCatching { jobs.remove(requestId)?.cancel() }
}
