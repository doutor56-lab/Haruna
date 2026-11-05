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
    private var leaseOwned=false
    private var phase="NOT_INSTALLED"
    private var error:String?=null
    private var copied=0L
    init {worker.execute {
        for(dir in root.listFiles().orEmpty()) {
            if(dir.name.startsWith(".install-")){dir.deleteRecursively();continue}
            if(!dir.name.matches(Regex("[0-9a-f-]{36}")))continue
            try{val m=ImagePackage.verify(dir);models[dir.name]=JSONObject().put("id",dir.name).put("name",m.optString("displayName","SD1.5 MNN").take(64)).put("state","INSTALLED")}
            catch(e:Exception){models[dir.name]=JSONObject().put("id",dir.name).put("name","Pacote inválido").put("state","INCOMPATIBLE")}
        };phase=if(models.isEmpty())"NOT_INSTALLED" else "INSTALLED";publish()
    }}
    private fun publish(){snapshot=JSONObject().put("state",phase).put("busy",busy).put("error",error).put("copiedBytes",copied).put("engineAvailable",ImageNative.available).put("engine","MNN CPU · componentes SD1.5").put("generationAvailable",false).put("loaded",loaded).put("selected",prefs.getString("selected",null)).put("models",JSONArray(models.values.toList())).put("resolution",prefs.getInt("resolution",256)).put("steps",prefs.getInt("steps",5)).put("performance",prefs.getString("performance","balanced")).put("autoSave",prefs.getBoolean("autoSave",true)).put("backend","CPU").toString()}
    @JavascriptInterface fun status()=snapshot
    @JavascriptInterface fun add(){if(!closed&&!busy)picker()}
    @JavascriptInterface fun cancel(){cancel.set(true)}
    @Synchronized private fun submit(action:()->Unit){if(closed||busy)return;busy=true;cancel.set(false);worker.execute {error=null;publish();try{action()}catch(e:Exception){error=when(e){is java.util.zip.ZipException->"Pacote ZIP incompleto ou corrompido";is IllegalArgumentException,is IllegalStateException->e.message?:"Modelo incompatível";else->"Não foi possível concluir a operação de imagem"};phase=if(e is IllegalArgumentException && !error.orEmpty().contains("Espaço")) "INCOMPATIBLE" else "ERROR"}finally{busy=false;publish()}}}
    fun install(uri:Uri)=submit {
        phase="INSTALLING";copied=0;publish();var last=0L
        val dir=app.contentResolver.openInputStream(uri).use{input->requireNotNull(input){"Não foi possível ler o arquivo"};ImagePackage.install(input,root,{cancel.get()||closed},{root.usableSpace}){bytes->copied=bytes;val now=android.os.SystemClock.elapsedRealtime();if(now-last>200){last=now;publish()}}}
        if(cancel.get()||closed){dir.deleteRecursively();throw IllegalStateException("Instalação cancelada")}
        val m=ImagePackage.verify(dir)
        // FlatBuffer verification maps model files and never creates inference sessions.
        if(ImageNative.available&&!ImageNative.validate(dir.absolutePath)){dir.deleteRecursively();throw IllegalArgumentException("Modelo MNN inválido ou corrompido")}
        models[dir.name]=JSONObject().put("id",dir.name).put("name",m.optString("displayName","SD1.5 MNN").take(64)).put("state","INSTALLED")
        if(prefs.getString("selected",null)==null)prefs.edit().putString("selected",dir.name).commit()
        phase="INSTALLED"
    }
    private fun dir(id:String):File {require(id.matches(Regex("[0-9a-f-]{36}"))&&models.containsKey(id)){"Modelo não encontrado"};return File(root,id)}
    @JavascriptInterface fun select(id:String)=submit {dir(id);check(models[id]?.optString("state")!="INCOMPATIBLE"){"Modelo incompatível"};check(prefs.edit().putString("selected",id).commit())}
    @JavascriptInterface fun configure(json:String)=submit {val p=JSONObject(json);val r=p.getInt("resolution");val s=p.getInt("steps");val m=p.getString("performance");require(r in listOf(256,512)&&s in 1..50&&m in listOf("economy","balanced","performance")){"Configuração inválida"};check(prefs.edit().putInt("resolution",r).putInt("steps",s).putString("performance",m).putBoolean("autoSave",p.getBoolean("autoSave")).commit())}
    private fun free(){ImageLease.lock.withLock {if(leaseOwned){check(ImageNative.available);ImageNative.unload();loaded?.let{models[it]?.put("state","INSTALLED")};loaded=null;leaseOwned=false;ImageLease.active=false}}}
    @JavascriptInterface fun unload()=submit {free();phase="INSTALLED"}
    @JavascriptInterface fun remove(id:String,confirmed:Boolean)=submit {require(confirmed){"Confirme a remoção"};val file=dir(id);if(loaded==id)free();check(file.deleteRecursively()){ "Não foi possível remover o pacote"};models.remove(id);if(prefs.getString("selected",null)==id)prefs.edit().remove("selected").commit();phase=if(models.isEmpty())"NOT_INSTALLED" else "INSTALLED"}
    @JavascriptInterface fun load(id:String)=submit {
        check(ImageNative.available){"Motor MNN indisponível nesta build"};val file=dir(id);ImagePackage.verify(file)
        check(!cancel.get()&&!closed){"Operação cancelada"};free()
        ImageLease.lock.withLock {check(!ImageLease.active){"Outro modelo de imagens está em uso"};ImageLease.active=true;leaseOwned=true;try{backend.unloadModel().getOrThrow();check(!backend.status().modelLoaded){"O GGUF continua carregado"}}catch(e:Exception){ImageLease.active=false;leaseOwned=false;throw e}}
        try{val info=ActivityManager.MemoryInfo();app.getSystemService(ActivityManager::class.java).getMemoryInfo(info)
            val bytes=file.listFiles().orEmpty().sumOf{it.length()};check(!info.lowMemory&&info.availMem>bytes+512L*1024*1024){"Memória disponível insuficiente; modelo instalado foi preservado"}
            phase="LOADING";models[id]?.put("state","LOADING");publish()
            check(ImageNative.load(file.absolutePath)){"Modelo incompatível com os componentes SD1.5 MNN desta build"}
            if(cancel.get()||closed)throw IllegalStateException("Carregamento cancelado")
            loaded=id;phase="LOADED";models[id]?.put("state","LOADED")
        }catch(e:Exception){ImageNative.unload();ImageLease.active=false;leaseOwned=false;models[id]?.put("state","ERROR");throw e}
    }
    fun close(){closed=true;cancel.set(true);worker.execute{free()};worker.shutdown()}
}
