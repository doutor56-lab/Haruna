package com.proxyslabs.haruna.image

import android.app.ActivityManager
import android.content.Context
import android.net.Uri
import android.webkit.JavascriptInterface
import com.proxyslabs.haruna.LlmBackend
import org.json.JSONObject
import org.json.JSONArray
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.withLock

class ImageBridge(context:Context,private val backend:LlmBackend,private val picker:()->Unit) {
    private val app=context.applicationContext
    private val prefs=app.getSharedPreferences("image_generation",Context.MODE_PRIVATE)
    private val root=File(app.filesDir,"image-models").apply{mkdirs()}
    private val worker=Executors.newSingleThreadExecutor()
    private val cancel=AtomicBoolean(false)
    @Volatile private var closed=false
    @Volatile private var busy=false
    @Volatile private var snapshot="{}"
    private val models=linkedMapOf<String,JSONObject>()
    private var loaded:String?=null
    @Volatile private var leaseOwned=false
    @Volatile private var activeJob:String?=null
    @Volatile private var nativeTicket=0L
    @Volatile private var nezumiHandle=0L
    private fun isNezumi(id:String?)=models[id]?.optString("format")==NezumiPackage.format
    private fun available(id:String?)=if(isNezumi(id))NezumiImageNative.available else ImageNative.available
    private fun model(id:String,m:JSONObject)=JSONObject().put("id",id).put("name",m.optString("displayName","SD1.5 MNN").take(64)).put("format",m.optString("format","haruna_sd15")).put("engineAvailable",if(m.optString("format")==NezumiPackage.format)NezumiImageNative.available else ImageNative.available).put("state","INSTALLED")
    private var job=JSONObject()
    companion object {private val tickets=java.util.concurrent.atomic.AtomicLong()}
    private var phase="NOT_INSTALLED"
    private var error:String?=null
    private var copied=0L
    init {worker.execute {
        for(dir in root.listFiles().orEmpty()) {
            if(dir.name.startsWith(".install-")){if(!dir.name.startsWith(NezumiPackage.stagingPrefix))dir.deleteRecursively();continue}
            if(!dir.name.matches(Regex("[0-9a-f-]{36}")))continue
            try{val m=ImagePackage.verify(dir);models[dir.name]=model(dir.name,m)}
            catch(e:Exception){models[dir.name]=JSONObject().put("id",dir.name).put("name","Pacote inválido").put("state","INCOMPATIBLE")}
        };phase=if(models.isEmpty())"NOT_INSTALLED" else "INSTALLED";publish()
    }}
    private fun publish(){snapshot=JSONObject().put("state",phase).put("busy",busy).put("imageEngineBusy",ImageLease.active).put("error",error).put("copiedBytes",copied).put("engineAvailable",available(prefs.getString("selected",null))).put("performanceSupported",!isNezumi(prefs.getString("selected",null))).put("engine","MNN CPU · componentes SD1.5").put("generationAvailable",available(prefs.getString("selected",null))).put("generation",job).put("loaded",loaded).put("selected",prefs.getString("selected",null)).put("models",JSONArray(models.values.toList())).put("resolution",prefs.getInt("resolution",256)).put("steps",prefs.getInt("steps",5)).put("performance",prefs.getString("performance","balanced")).put("autoSave",prefs.getBoolean("autoSave",true)).put("backend","CPU").toString()}
    @JavascriptInterface fun status():String {val s=JSONObject(snapshot).put("busy",busy).put("imageEngineBusy",ImageLease.active);if(nezumiHandle>0&&NezumiImageNative.available){s.put("nativeProgress",JSONArray(NezumiImageNative.progress(nezumiHandle).toList()))};if(nativeTicket>0&&ImageNative.available){val p=ImageNative.progress();s.put("nativeProgress",JSONArray(p.toList()))};return s.toString()}
    @JavascriptInterface fun add(){if(!closed&&!busy)picker()}
    @JavascriptInterface fun cancel(){cancel.set(true);val h=nezumiHandle;if(h>0&&NezumiImageNative.available)NezumiImageNative.cancel(h);val t=nativeTicket;if(t>0&&ImageNative.available)ImageNative.cancelNative(t)}
    @Synchronized private fun submit(action:()->Unit):Boolean {if(closed||busy)return false;busy=true;cancel.set(false);worker.execute {error=null;phase=if(loaded!=null)"LOADED" else if(models.isEmpty())"NOT_INSTALLED" else "INSTALLED";publish();try{action()}catch(e:OutOfMemoryError){free();error="Memória insuficiente; arquivos instalados foram preservados";phase="ERROR"}catch(e:Exception){error=when(e){is java.util.zip.ZipException->"Pacote ZIP incompleto ou corrompido";is IllegalArgumentException,is IllegalStateException->e.message?:"Modelo incompatível";else->"Não foi possível concluir a operação de imagem"};phase=if(e is IllegalArgumentException && !error.orEmpty().contains("Espaço")) "INCOMPATIBLE" else "ERROR"}finally{busy=false;publish()}};return true}
    fun install(uri:Uri)=submit {
        phase="INSTALLING";copied=0;publish();var last=0L
        val dir=app.contentResolver.openInputStream(uri).use{input->requireNotNull(input){"Não foi possível ler o arquivo"};NezumiPackage.install(input,root,{cancel.get()||closed},{root.usableSpace},{bytes->copied=bytes;val now=android.os.SystemClock.elapsedRealtime();if(now-last>200){last=now;publish()}}){folder->!NezumiImageNative.available||NezumiImageNative.validateFiles(NezumiPackage.graphFiles(folder))}}
        if(cancel.get()||closed){dir.deleteRecursively();throw IllegalStateException("Instalação cancelada")}
        val m=ImagePackage.verify(dir)
        // FlatBuffer verification maps model files and never creates inference sessions.
        if(m.optString("format")!=NezumiPackage.format&&ImageNative.available&&!ImageNative.validate(dir.absolutePath)){dir.deleteRecursively();throw IllegalArgumentException("Modelo MNN inválido ou corrompido")}
        models[dir.name]=model(dir.name,m)
        if(prefs.getString("selected",null)==null)prefs.edit().putString("selected",dir.name).commit()
        phase="INSTALLED"
    }
    private fun dir(id:String):File {require(id.matches(Regex("[0-9a-f-]{36}"))&&models.containsKey(id)){"Modelo não encontrado"};return File(root,id)}
    @JavascriptInterface fun select(id:String)=submit {dir(id);check(models[id]?.optString("state")!="INCOMPATIBLE"){"Modelo incompatível"};check(prefs.edit().putString("selected",id).commit())}
    @JavascriptInterface fun configure(json:String)=submit {val p=JSONObject(json);val r=p.getInt("resolution");val s=p.getInt("steps");val m=p.getString("performance");require(r in listOf(256,512)&&s in 1..50&&m in listOf("economy","balanced","performance")){"Configuração inválida"};check(prefs.edit().putInt("resolution",r).putInt("steps",s).putString("performance",m).putBoolean("autoSave",p.getBoolean("autoSave")).commit())}
    private fun free(){ImageLease.lock.withLock {if(leaseOwned){if(nezumiHandle>0){val h=nezumiHandle;nezumiHandle=0;NezumiImageNative.destroy(h)}else if(ImageNative.available)ImageNative.unload();loaded?.let{models[it]?.put("state","INSTALLED")};loaded=null;leaseOwned=false;ImageLease.active=false}}}
    @JavascriptInterface fun unload()=submit {free();phase="INSTALLED"}
    @JavascriptInterface fun remove(id:String,confirmed:Boolean)=submit {require(confirmed){"Confirme a remoção"};val file=dir(id);ImageLease.lock.withLock {check(!ImageLease.active||leaseOwned){"Outro controlador está utilizando os modelos de imagem"};if(loaded==id)free();check(file.deleteRecursively()){ "Não foi possível remover o pacote"}};models.remove(id);if(prefs.getString("selected",null)==id)prefs.edit().remove("selected").commit();phase=if(models.isEmpty())"NOT_INSTALLED" else "INSTALLED"}
    @JavascriptInterface fun load(id:String)=submit {prepare(id,true)}
    private fun prepare(id:String,preload:Boolean) {
        check(available(id)){"Motor MNN indisponível nesta build"};val file=dir(id);ImagePackage.verify(file){cancel.get()||closed};val nezumi=isNezumi(id);if(!(if(nezumi)NezumiImageNative.validateFiles(NezumiPackage.graphFiles(file)) else ImageNative.validate(file.absolutePath))){models[id]?.put("state","INCOMPATIBLE");throw IllegalArgumentException("Pacote incompatível com o motor MNN CPU desta build")}
        check(!cancel.get()&&!closed){"Operação cancelada"};free()
        ImageLease.lock.withLock {check(!ImageLease.active){"Outro modelo de imagens está em uso"};ImageLease.active=true;leaseOwned=true;try{backend.unloadModel().getOrThrow();check(!backend.status().modelLoaded){"O GGUF continua carregado"}}catch(e:Exception){ImageLease.active=false;leaseOwned=false;throw e}}
        try{val info=ActivityManager.MemoryInfo();app.getSystemService(ActivityManager::class.java).getMemoryInfo(info)
            val bytes=file.listFiles().orEmpty().sumOf{it.length()};check(!info.lowMemory&&info.availMem>maxOf(bytes+512L*1024*1024,3L*1024*1024*1024)){"Memória disponível insuficiente; modelo instalado foi preservado"}
            phase="LOADING";models[id]?.put("state","LOADING");publish()
            if(nezumi){val h=NezumiImageNative.create();check(h>0){"Motor Nezumi indisponível"};nezumiHandle=h;check(!cancel.get()&&!closed){"Carregamento cancelado"};check(NezumiImageNative.loadCpu(h,file.absolutePath)&&NezumiImageNative.isLoaded(h)){NezumiImageNative.lastError()}}
            else if(preload)check(ImageNative.load(file.absolutePath)){"Não foi possível preparar os componentes SD1.5. Pode haver incompatibilidade ou falta de memória."}
            if(cancel.get()||closed)throw IllegalStateException("Carregamento cancelado")
            if(preload){loaded=id;phase="LOADED";models[id]?.put("state","LOADED")}
        }catch(e:Throwable){free();models[id]?.put("state","ERROR");throw e}
    }
    private val outputs=File(app.filesDir,"generated-images").apply{mkdirs()}
    @JavascriptInterface fun cancelGeneration(id:String){if(activeJob==id)cancel()}
    @JavascriptInterface fun result(id:String):String {if(!id.matches(Regex("[0-9a-f-]{36}")))return "{}";return runCatching{File(outputs,"$id.json").readText()}.getOrDefault("{}")}
    @JavascriptInterface @Synchronized fun generate(request:String,prompt:String):Boolean {
        if(closed||busy||!request.matches(Regex("[0-9a-f-]{36}"))||prompt.isBlank()||prompt.length>2000||File(outputs,"$request.png").exists()||File(outputs,"$request.json").exists())return false
        activeJob=request // Reserve identity before the worker can be cancelled.
        return submit {
        job=JSONObject().put("request",request).put("state","LOADING");publish()
        val part=File(outputs,"$request.part.png");val target=File(outputs,"$request.png")
        try {val selected=prefs.getString("selected",null)?:throw IllegalStateException("Selecione um modelo SD1.5 em Configurações")
            check(outputs.usableSpace>64L*1024*1024){"Espaço insuficiente para salvar a imagem"}
            prepare(selected,false);check(!cancel.get()&&!closed){"Geração cancelada"}
            val nezumi=isNezumi(selected);val t=if(nezumi)0L else tickets.incrementAndGet();if(!nezumi){check(ImageNative.reserve(t)){"Motor de imagem ocupado"};nativeTicket=t}
            check(!cancel.get()&&!closed){"Geração cancelada"};phase="GENERATING";job.put("state","GENERATING");publish()
            val mode=when(prefs.getString("performance","balanced")){"economy"->0;"performance"->1;else->2}
            val ok=if(nezumi){val rgb=NezumiImageNative.generateRgb(nezumiHandle,prompt,"",prefs.getInt("steps",5),-1L)?:throw IllegalStateException(NezumiImageNative.lastError());check(!cancel.get()&&!closed){"Geração cancelada"};ImageFiles.writeRgb(part,rgb);true}else ImageNative.generate(t,dir(selected).absolutePath,prompt,part.absolutePath,prefs.getInt("steps",5),mode)
            check(!cancel.get()&&!closed){"Geração cancelada"};check(ok&&part.isFile){"O MNN não concluiu a geração"}
            ImageFiles.resize(part,prefs.getInt("resolution",256))
            check(!cancel.get()&&!closed){"Geração cancelada"};check(part.renameTo(target)){"Não foi possível salvar o PNG"}
            job.put("state","COMPLETED").put("file",target.name).put("nativeResolution",512).put("outputResolution",prefs.getInt("resolution",256))
            if(prefs.getBoolean("autoSave",true))runCatching{ImageFiles.save(app,target)}.onFailure{job.put("saveWarning","PNG privado salvo; não foi possível salvar na galeria")}
        }catch(e:OutOfMemoryError){part.delete();job.put("state","ERROR").put("error","Memória insuficiente para concluir a imagem. O modelo instalado foi preservado.")}catch(e:Exception){part.delete();job.put("state",if(cancel.get()||closed)"CANCELLED" else "ERROR").put("error",if(cancel.get()||closed)"Geração cancelada" else if(e.message=="Memória disponível insuficiente; modelo instalado foi preservado")"Memória livre insuficiente. A geração requer margem preventiva de pelo menos 3 GiB; o modelo instalado foi preservado." else if(e.message.orEmpty().startsWith("Motor Nezumi CPU: erro técnico "))e.message else "Não foi possível concluir a imagem. Confira o modelo e a memória disponível.")}
        finally {if(nativeTicket>0){ImageNative.finish(nativeTicket);nativeTicket=0};free();models.values.filter{it.optString("state")=="LOADING"}.forEach{it.put("state","INSTALLED")};activeJob=null;phase=if(models.isEmpty())"NOT_INSTALLED" else "INSTALLED";val meta=File(outputs,"$request.json.part");meta.writeText(job.toString());meta.renameTo(File(outputs,"$request.json"));publish()}
        }
    }
    private fun image(id:String):File {require(id.matches(Regex("[0-9a-f-]{36}")));return File(outputs,"$id.png").also{require(it.isFile)}}
    @JavascriptInterface fun save(id:String)=submit {ImageFiles.save(app,image(id))}
    @JavascriptInterface fun open(id:String,share:Boolean){val f=runCatching{image(id)}.getOrNull()?:return;ImageFiles.open(app,f,share)}
    @Synchronized fun close(){if(closed)return;closed=true;cancel();worker.execute{free()};worker.shutdown()}
}

