package com.proxyslabs.haruna.diagnostics

import android.content.Context
import android.os.PowerManager
import android.os.SystemClock
import com.proxyslabs.haruna.BuildConfig
import com.proxyslabs.haruna.LlmBackend
import org.json.JSONObject
import org.json.JSONArray
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

/** One canonical fixture; no access to chat/knowledge stores. Only bounded technical state persists. */
class InferenceLab(private val app: Context, private val backend: LlmBackend, private val metrics: AndroidMetricsCollector, private val emit: (JSONObject)->Unit) {
    private val active=AtomicBoolean(false)
    @Volatile private var request: String?=null
    private data class SequenceRun(val id:String,val fingerprint:String,val model:String,val turns:MutableList<Pair<String,String>> = mutableListOf())
    private val sequenceLock=Any()
    private var sequence:SequenceRun?=null
    fun cancel() { synchronized(sequenceLock){sequence=null};request?.let { backend.stop(it) } }

    fun run(raw: String): String = try {
        check(BuildConfig.DEBUG) { "Disponível somente em DEBUG" }
        require(raw.length<=4000)
        val cfg=JSONObject(raw)
        val variant=cfg.optString("systemPromptVariant",LabSystemPrompt.CURRENT)
        require(variant in setOf(LabSystemPrompt.CURRENT,LabSystemPrompt.FACTUAL)) { "Variante de system prompt inválida" }
        cfg.put("systemPromptVariant",variant)
        for ((key,limits) in mapOf("temperature" to (0.0..2.0),"topP" to (0.001..1.0),"minP" to (0.0..1.0),"presence" to (-2.0..2.0),"frequency" to (-2.0..2.0),"repeat" to (0.5..2.0))) {
            val x=cfg.getDouble(key);require(x.isFinite()&&x in limits) { "Valor inválido: $key" }
        }
        for(key in listOf("topK","maxTokens","seed","threads","threadsBatch","nCtx","nBatch","nUbatch")) { if(!cfg.has(key))continue; val value=cfg.getDouble(key);require(value.isFinite() && value==kotlin.math.floor(value)) { "Use número inteiro: $key" } }
        require(cfg.optInt("threads",0) in 0..16 && cfg.optInt("threadsBatch",0) in 0..16)
        require(cfg.getInt("topK") in 0..1000 && cfg.getInt("maxTokens") in 16..1024)
        require(cfg.optInt("nCtx",8192) in setOf(1024,2048,4096,8192)) { "Contexto não suportado" }
        val batch=cfg.optInt("nBatch",512);val ubatch=cfg.optInt("nUbatch",512)
        require(batch in 32..1024 && ubatch in 32..512 && ubatch<=batch && batch<=cfg.optInt("nCtx",8192)) { "Batch/ubatch inválidos" }
        require(cfg.optString("flashAttention","auto") in setOf("auto","on","off"))
        require(cfg.optString("typeK","f16") in setOf("f16","q8_0") && cfg.optString("typeV","f16") in setOf("f16","q8_0"))
        require(cfg.optString("typeV","f16")!="q8_0" || cfg.optString("flashAttention","auto")=="on") { "V Q8 exige FA ON explícita" }
        val seed=cfg.getLong("seed");require(seed in 0..4294967295L)
        check(!com.proxyslabs.haruna.speech.VoiceCallService.running) { "Encerre a chamada antes do benchmark" }
        val state=backend.status()
        check(cfg.optString("expectedModel", "").let { it.isEmpty() || it==state.modelName }) { "Modelo alterado durante o lote; execute novamente com um único modelo" }
        check(state.modelLoaded && state.state=="active") { "Carregue um modelo e aguarde o runtime ocioso" }
        val step=cfg.optInt("sessionStep",-1)
        require(step in -1..2) { "Turno de teste inválido" }
        val sessionId=cfg.optString("sessionId","")
        val fingerprint=JSONObject(cfg.toString()).apply{remove("sessionStep");remove("expectedModel")}.toString()
        val sessionRun=if(step>=0) synchronized(sequenceLock){
            require(sessionId.matches(Regex("[a-zA-Z0-9-]{1,80}")) && !cfg.optBoolean("rag") && !cfg.optBoolean("history") && !cfg.optBoolean("thinking")) { "Sessão sintética exige RAG/histórico/thinking OFF" }
            if(step==0) SequenceRun(sessionId,fingerprint,state.modelName?:"") else requireNotNull(sequence).also{
                require(it.id==sessionId && it.fingerprint==fingerprint && it.model==(state.modelName?:"") && it.turns.size==step) { "Sessão mudou ou foi interrompida; inicie pelo turno 1" }
            }
        }else null
        check(active.compareAndSet(false,true)) { "Benchmark em andamento" }
        if(step==0) synchronized(sequenceLock){sequence=sessionRun}
        val id="lab-"+UUID.randomUUID().toString();request=id
        val start=SystemClock.elapsedRealtimeNanos();var first: Double?=null;val text=StringBuilder();var deltas=0
        val prompt="Explique em português, em três frases completas, por que o céu parece azul."
        val turnPrompt=when(step){1->"Agora explique isso de forma ainda mais simples.";2->"Dê um exemplo do cotidiano.";else->prompt}
        val messages=JSONArray()
        if(sessionRun!=null) synchronized(sequenceLock){sessionRun.turns.forEach{(user,answer)->messages.put(JSONObject().put("role","user").put("content",user)).put(JSONObject().put("role","assistant").put("content",answer))}}

        if(cfg.optBoolean("history")) messages.put(JSONObject().put("role","user").put("content","Estamos conversando sobre fenômenos da natureza.")).put(JSONObject().put("role","assistant").put("content","Podemos explicar esses fenômenos usando a ciência."))
        messages.put(JSONObject().put("role","user").put("content",turnPrompt + if(cfg.optBoolean("rag") && cfg.optJSONArray("references")!=null) "\n<dados_de_referencia>\n"+cfg.getJSONArray("references").toString()+"\n</dados_de_referencia>" else ""))
        val before=metrics.snapshot()
        val thermal=app.getSystemService(PowerManager::class.java).currentThermalStatus
        val initial=JSONObject(backend.runtimeMetrics()).apply { remove("laboratory") }
        val model=backend.status().modelName
        fun complete(error: String?) {
            val elapsed=(SystemClock.elapsedRealtimeNanos()-start)/1e6
            val obs=JSONObject(backend.runtimeMetrics())
            val serial=obs.optJSONObject("generation")?.optLong("serial",0L) ?: 0L
            val fresh=error!="generation_busy" && serial>0 && serial!=(initial.optJSONObject("generation")?.optLong("serial",0L) ?: 0L)
            if(!fresh) { obs.remove("generation");obs.remove("prefix");obs.remove("decisionProbe");obs.remove("laboratory");obs.remove("incremental");obs.remove("opProfile") }
            val result=JSONObject().put("nativeGenerationFresh",fresh).put("request",id).put("configuration",cfg).put("model",model)
                .put("completedAt",System.currentTimeMillis()).put("elapsedMs",elapsed).put("firstDeltaMs",first?:JSONObject.NULL).put("deltas",deltas)
                .put("output",text.toString()).put("error",error?:JSONObject.NULL).put("observation",obs)
                .put("before",before).put("after",metrics.snapshot())
                .put("thermalBefore",thermal).put("thermalAfter",app.getSystemService(PowerManager::class.java).currentThermalStatus)
                .put("runtimeBefore",initial).put("fixture","sky-v1").put("rag",if(cfg.optBoolean("rag")) "ON — contexto congelado para o lote A/B" else "OFF")
            if(sessionRun!=null){
                synchronized(sequenceLock){if(sequence===sessionRun){if(error==null && step<2)sessionRun.turns.add(turnPrompt to text.toString())else sequence=null}}
                result.put("fixture","sky-session-v1").put("sessionStep",step)
            }
            request=null;active.set(false);emit(result)
        }
        backend.generate(id,JSONObject().put("messages",messages).put("options",JSONObject()
            .put("conversationId",if(sessionRun==null) "lab-sky-v1" else "lab-session-"+sessionRun.id).put("enableThinking",cfg.optBoolean("thinking",false))
            .put("maxTokens",cfg.getInt("maxTokens")).put("labSystemPromptVariant",variant).put("labConfig",cfg.toString())).toString(),
            { delta -> if(first==null) first=(SystemClock.elapsedRealtimeNanos()-start)/1e6;deltas++;if(text.length<65536)text.append(delta.take(65536-text.length)) },
            { complete(null) }, { code,_ -> complete(code) })
        JSONObject().put("status","ok").put("request",id).toString()
    } catch(e: Exception) { JSONObject().put("status","error").put("error",e.message?:"Benchmark indisponível").toString() }
}
