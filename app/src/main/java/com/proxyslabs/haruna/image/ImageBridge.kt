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

class ImageBridge(context:Context,private val backend:LlmBackend,private val componentPicker:(()->Unit)?=null,private val picker:()->Unit) {
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
    @Volatile private var safetensorsSession:SafetensorsSession?=null
    private fun isSafetensors(id:String?)=models[id]?.optString("format") in setOf(SafetensorsPackage.format,SafetensorsPackage.sdxlFormat,SdcppPackage.format)
    private fun availableFormat(format:String)=when(format){SafetensorsPackage.format,SafetensorsPackage.sdxlFormat,SdcppPackage.format->SafetensorsImageNative.available;NezumiPackage.format->NezumiImageNative.available;else->ImageNative.available}
    private fun isFlux(id:String?=prefs.getString("selected",null))=models[id]?.optString("format")==SdcppPackage.format
    private fun selectedSdxl()=models[prefs.getString("selected",null)]?.optString("format")==SafetensorsPackage.sdxlFormat
    private fun outputResolution()=prefs.getInt(if(selectedSdxl())"sdxlResolution" else "resolution",if(selectedSdxl())1024 else 256)
    private fun outputSteps()=prefs.getInt(if(selectedSdxl())"sdxlSteps" else "steps",if(selectedSdxl())28 else 5)
    private var restorePath:String?=null
    private var restoreWarning:String?=null
    private fun optionKey(id:String?=prefs.getString("selected",null))=when {isFlux(id)->"options-flux1";models[id]?.optString("format")==SafetensorsPackage.sdxlFormat->"options-sdxl";isSafetensors(id)->"options-sd15";isNezumi(id)->"options-nezumi";else->"options-mnn"}
    private fun optionEngine(id:String?=prefs.getString("selected",null))=when {isSafetensors(id)->"safetensors";isNezumi(id)->"nezumi";else->"mnn"}
    private fun options(id:String?=prefs.getString("selected",null)):ImageOptions {
        val kind=optionEngine(id);val sf=kind=="safetensors";val flux=isFlux(id);val xl=flux||models[id]?.optString("format")==SafetensorsPackage.sdxlFormat
        val side=if(flux)512 else prefs.getInt(if(xl)"sdxlResolution" else "resolution",if(xl)1024 else 256)
        val d=ImageOptions(side,side,if(flux){if(models[id]?.optString("architecture")=="flux1-schnell")4 else 20}else prefs.getInt(if(xl)"sdxlSteps" else "steps",if(xl)28 else 5),if(flux)1.0 else if(xl)5.0 else if(sf)7.0 else 7.5,if(xl&&!flux)2 else -1,if(xl)"euler" else if(kind=="nezumi")"dpm++2m" else "default",if(flux)"default" else if(xl||kind=="nezumi")"discrete" else "default",-1,"",xl,if(flux)0 else if(xl)1024 else 512,if(xl)32 else 64)
        val saved=prefs.getString(optionKey(id),null)?:return d
        return d.updated(JSONObject(saved),kind).let{it.copy(legacySide=JSONObject(saved).optInt("legacySide",0))}
    }
    private fun finishImage(){ImageLease.lock.withLock {
        free();val path=restorePath;restorePath=null
        if(!closed&&path!=null&&!backend.status().modelLoaded){val finalState=job.optString("state");if(finalState in setOf("COMPLETED","CANCELLED","ERROR"))job.put("state","RESTORING_LLM");phase="RESTORING_LLM";publish()
            runCatching{backend.loadModel(path).getOrThrow()}.onFailure{restoreWarning="Imagem liberada, mas não foi possível recarregar o GGUF anterior. Carregue-o novamente."}
            if(!backend.status().modelLoaded)restoreWarning="O backend não confirmou a recarga do GGUF anterior.";job.put("state",finalState)
        }
    }}
    private fun isNezumi(id:String?)=models[id]?.optString("format")==NezumiPackage.format
    private fun available(id:String?)=availableFormat(models[id]?.optString("format").orEmpty())
    private fun model(id:String,m:JSONObject)=JSONObject().put("id",id).put("name",m.optString("displayName","SD1.5 MNN").take(64)).put("format",m.optString("format","haruna_sd15")).put("architecture",m.optString("architecture","sd15")).put("engineAvailable",availableFormat(m.optString("format"))).put("state","INSTALLED")
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
    private fun publish(){snapshot=options().json().put("state",phase).put("busy",busy).put("imageEngineBusy",ImageLease.active).put("error",error).put("copiedBytes",copied).put("engineAvailable",available(prefs.getString("selected",null))).put("performanceSupported",!isNezumi(prefs.getString("selected",null))&&!isSafetensors(prefs.getString("selected",null))).put("engine",if(isSafetensors(prefs.getString("selected",null)))(if(isFlux())"stable-diffusion.cpp CPU · FLUX.1 · componentes locais" else if(selectedSdxl())"stable-diffusion.cpp CPU · SDXL/Illustrious · pesos em disco" else "stable-diffusion.cpp CPU · SD1.5 experimental") else "MNN CPU · componentes SD1.5").put("generationAvailable",available(prefs.getString("selected",null))).put("generation",job).put("loaded",loaded).put("selected",prefs.getString("selected",null)).put("models",JSONArray(models.values.toList())).put("nativeSide",if(selectedSdxl())1024 else 512).put("resolution",options().width).put("restoreWarning",restoreWarning).put("nativeWidth",options().nativeWidth(optionEngine()=="safetensors")).put("nativeHeight",options().nativeHeight(optionEngine()=="safetensors")).put("engineKind",optionEngine()).put("maxSteps",if(optionEngine()=="safetensors")100 else 50).put("performance",prefs.getString("performance","balanced")).put("autoSave",prefs.getBoolean("autoSave",true)).put("backend","CPU").put("batchCount",if(optionEngine()=="mnn")1 else prefs.getInt("batchCount",1)).put("maxBatch",if(optionEngine()=="mnn")1 else 4).put("previewSupported",isSafetensors(prefs.getString("selected",null))&&SafetensorsImageNative.available).put("showPreviews",prefs.getBoolean("showPreviews",false)).toString()}
    @JavascriptInterface fun status():String {val s=JSONObject(snapshot).put("busy",busy).put("imageEngineBusy",ImageLease.active);safetensorsSession?.let{s.put("nativeProgress",JSONArray(it.progress().toList()))};if(nezumiHandle>0&&NezumiImageNative.available){s.put("nativeProgress",JSONArray(NezumiImageNative.progress(nezumiHandle).toList()))};if(nativeTicket>0&&ImageNative.available){val p=ImageNative.progress();s.put("nativeProgress",JSONArray(p.toList()))};val previewId=s.optJSONObject("generation")?.optString("currentRequest").orEmpty();if(previewId.matches(Regex("[0-9a-f-]{36}"))){val preview=File(outputs,"$previewId.preview.png");if(preview.isFile)s.put("previewUrl","/generated/$previewId.preview.png?v="+preview.lastModified())};return s.toString()}
    @JavascriptInterface fun add(){if(!closed&&!busy)picker()}
    @JavascriptInterface fun addComponents(){if(!closed&&!busy)componentPicker?.invoke()}
    fun installComponents(uris:List<Uri>)=submit {
        require(uris.size==4){"Selecione os quatro arquivos: difusão FLUX.1, CLIP-L, T5-XXL e VAE"}
        phase="INSTALLING";copied=0;publish();val stage=File(root,NezumiPackage.stagingPrefix+java.util.UUID.randomUUID()).apply{check(mkdirs())}
        try{val hashes=JSONObject();val roles=mutableSetOf<String>();var total=0L
            for(uri in uris){check(!cancel.get()&&!closed){"Instalação cancelada"};val name=checkpointName(uri).lowercase();val role=when{ name.startsWith("clip_l")->"clip_l";name.startsWith("t5")->"t5xxl";name=="ae"||name.startsWith("vae")->"ae";else->"diffusion"};require(roles.add(role)){"Componentes FLUX duplicados ou sem identificação. Use clip_l, t5xxl e ae nos nomes correspondentes"}
                app.contentResolver.openInputStream(uri).use{raw->val input=requireNotNull(raw).buffered();input.mark(8);val magic=ByteArray(4);java.io.DataInputStream(input).readFully(magic);input.reset();val gguf=magic.contentEquals(byteArrayOf(71,71,85,70));require(!gguf||role in setOf("diffusion","t5xxl")){"CLIP-L e VAE devem estar em safetensors"};if(!gguf){input.mark(16*1024*1024+8);SafetensorsInspector.readHeader(input);input.reset()};val target=File(stage,role+if(gguf)".gguf"else".safetensors");target.outputStream().use{out->val bytes=ByteArray(65536);while(true){check(!cancel.get()&&!closed){"Instalação cancelada"};val n=input.read(bytes);if(n<0)break;total+=n;require(total<=ImagePackage.maxBytes){"O conjunto excede 8 GiB; use componentes quantizados compatíveis"};check(root.usableSpace>128L*1024*1024+n){"Espaço insuficiente para instalar os componentes"};out.write(bytes,0,n);copied=total;if(total%1048576<65536)publish()}};hashes.put(target.name,ImagePackage.hash(target){cancel.get()||closed})}
            }
            require(roles==setOf("diffusion","clip_l","t5xxl","ae")){"Conjunto FLUX incompleto"};val d=File(SdcppPackage.files(stage)[0]);val tensors=if(d.extension=="gguf")ImageGguf.tensors(d)else SafetensorsInspector.tensorMap(d);val dev=tensors.keys.any{it.contains("guidance_in.")};val m=JSONObject().put("version",1).put("engine","stable-diffusion.cpp").put("format",SdcppPackage.format).put("architecture",if(dev)"flux1-dev"else"flux1-schnell").put("displayName",if(dev)"FLUX.1 dev"else"FLUX.1 schnell").put("files",hashes);File(stage,"haruna-image-model.json").writeText(m.toString());SdcppPackage.verify(stage){cancel.get()||closed};val target=File(root,java.util.UUID.randomUUID().toString());check(stage.renameTo(target)){"Falha ao concluir a instalação"};models[target.name]=model(target.name,m);if(prefs.getString("selected",null)==null)prefs.edit().putString("selected",target.name).commit();phase="INSTALLED"
        }finally{stage.deleteRecursively()}
    }
    @JavascriptInterface fun cancel(){cancel.set(true);safetensorsSession?.cancel();val h=nezumiHandle;if(h>0&&NezumiImageNative.available)NezumiImageNative.cancel(h);val t=nativeTicket;if(t>0&&ImageNative.available)ImageNative.cancelNative(t)}
    @Synchronized private fun submit(action:()->Unit):Boolean {if(closed||busy)return false;busy=true;cancel.set(false);worker.execute {error=null;phase=if(loaded!=null)"LOADED" else if(models.isEmpty())"NOT_INSTALLED" else "INSTALLED";publish();try{action()}catch(e:OutOfMemoryError){free();error="Memória insuficiente; arquivos instalados foram preservados";phase="ERROR"}catch(e:Exception){error=when(e){is java.util.zip.ZipException->"Pacote ZIP incompleto ou corrompido";is IllegalArgumentException,is IllegalStateException->e.message?:"Modelo incompatível";else->"Não foi possível concluir a operação de imagem"};phase=if(e is IllegalArgumentException && !error.orEmpty().contains("Espaço")) "INCOMPATIBLE" else "ERROR"}finally{busy=false;publish()}};return true}
    private fun checkpointName(uri:Uri):String = runCatching{app.contentResolver.query(uri,arrayOf(android.provider.OpenableColumns.DISPLAY_NAME),null,null,null)?.use{if(it.moveToFirst())it.getString(0)?.substringBeforeLast('.') else null}}.getOrNull()?:"SD1.5 safetensors"
    fun install(uri:Uri)=submit {
        phase="INSTALLING";copied=0;publish();var last=0L
        val dir=app.contentResolver.openInputStream(uri).use{source->requireNotNull(source){"Não foi possível ler o arquivo"};val input=source.buffered();input.mark(4);val magic=IntArray(4){input.read()};input.reset()
            val progress:(Long)->Unit={bytes->copied=bytes;val now=android.os.SystemClock.elapsedRealtime();if(now-last>200){last=now;publish()}}
            if(magic.contentEquals(intArrayOf(80,75,3,4)))NezumiPackage.install(input,root,{cancel.get()||closed},{root.usableSpace},progress){folder->!NezumiImageNative.available||NezumiImageNative.validateFiles(NezumiPackage.graphFiles(folder))}
            else {check(SafetensorsImageNative.available){"Motor SD1.5 safetensors indisponível nesta build"};SafetensorsPackage.install(input,root,{cancel.get()||closed},{root.usableSpace},progress,checkpointName(uri))}
        }
        if(cancel.get()||closed){dir.deleteRecursively();throw IllegalStateException("Instalação cancelada")}
        val m=ImagePackage.verify(dir)
        // FlatBuffer verification maps model files and never creates inference sessions.
        if(m.optString("format") !in setOf(NezumiPackage.format,SafetensorsPackage.format,SafetensorsPackage.sdxlFormat,SdcppPackage.format)&&ImageNative.available&&!ImageNative.validate(dir.absolutePath)){dir.deleteRecursively();throw IllegalArgumentException("Modelo MNN inválido ou corrompido")}
        models[dir.name]=model(dir.name,m)
        if(prefs.getString("selected",null)==null)prefs.edit().putString("selected",dir.name).commit()
        phase="INSTALLED"
    }
    private fun dir(id:String):File {require(id.matches(Regex("[0-9a-f-]{36}"))&&models.containsKey(id)){"Modelo não encontrado"};return File(root,id)}
    @JavascriptInterface fun select(id:String)=submit {dir(id);check(models[id]?.optString("state")!="INCOMPATIBLE"){"Modelo incompatível"};check(prefs.edit().putString("selected",id).commit())}
    @JavascriptInterface fun configure(json:String)=submit {
        val p=JSONObject(json);val next=options().updated(p,optionEngine());val m=p.optString("performance",prefs.getString("performance","balanced"));require(m in listOf("economy","balanced","performance")){"Configuração inválida"}
        val count=p.optInt("batchCount",prefs.getInt("batchCount",1));require(count in 1..4){"Use de uma a quatro imagens"};val edit=prefs.edit().putBoolean("showPreviews",p.optBoolean("showPreviews",prefs.getBoolean("showPreviews",false))).putInt("batchCount",count).putString(optionKey(),next.json().toString()).putString("performance",m)
            .putBoolean("autoSave",if(p.has("autoSave"))p.getBoolean("autoSave")else prefs.getBoolean("autoSave",true))
        // Legacy callers still work; new per-engine controls must not overwrite other engines' defaults.
        if(p.has("resolution")){edit.putInt(if(selectedSdxl())"sdxlResolution" else "resolution",next.width);if(selectedSdxl()||next.steps<=50)edit.putInt(if(selectedSdxl())"sdxlSteps" else "steps",next.steps)}
        check(edit.commit())

    }

    private fun free(){ImageLease.lock.withLock {if(leaseOwned){if(safetensorsSession!=null){val session=safetensorsSession;safetensorsSession=null;session?.close()}else if(nezumiHandle>0){val h=nezumiHandle;nezumiHandle=0;NezumiImageNative.destroy(h)}else if(ImageNative.available)ImageNative.unload();loaded?.let{models[it]?.put("state","INSTALLED")};loaded=null;leaseOwned=false;ImageLease.active=false}}}
    @JavascriptInterface fun unload()=submit {finishImage();phase="INSTALLED"}
    @JavascriptInterface fun remove(id:String,confirmed:Boolean)=submit {require(confirmed){"Confirme a remoção"};val file=dir(id);ImageLease.lock.withLock {check(!ImageLease.active||leaseOwned){"Outro controlador está utilizando os modelos de imagem"};if(loaded==id)finishImage();check(file.deleteRecursively()){ "Não foi possível remover o pacote"}};models.remove(id);if(prefs.getString("selected",null)==id)prefs.edit().remove("selected").commit();phase=if(models.isEmpty())"NOT_INSTALLED" else "INSTALLED"}
    @JavascriptInterface fun load(id:String)=submit {prepare(id,true)}
    private fun prepare(id:String,preload:Boolean) {
        check(available(id)){"Motor do modelo de imagem indisponível nesta build"};val file=dir(id);ImagePackage.verify(file){cancel.get()||closed};val sf=isSafetensors(id);val nezumi=isNezumi(id);if(!sf&&!(if(nezumi)NezumiImageNative.validateFiles(NezumiPackage.graphFiles(file)) else ImageNative.validate(file.absolutePath))){models[id]?.put("state","INCOMPATIBLE");throw IllegalArgumentException("Pacote incompatível com o motor MNN CPU desta build")}
        check(!cancel.get()&&!closed){"Operação cancelada"};free()
        ImageLease.lock.withLock {check(!ImageLease.active){"Outro modelo de imagens está em uso"};ImageLease.active=true;leaseOwned=true;try{if(restorePath==null&&backend.status().modelLoaded)restorePath=checkNotNull(backend.installedModelPath()){ "O backend não identificou o GGUF ativo; recarregue-o antes de gerar imagens." };restoreWarning=null;backend.unloadModel().getOrThrow();check(!backend.status().modelLoaded){"O GGUF continua carregado"}}catch(e:Exception){finishImage();throw e}}
        try{val info=ActivityManager.MemoryInfo();app.getSystemService(ActivityManager::class.java).getMemoryInfo(info)
            // Replace the fixed 3 GiB floor with engine-aware safety margins.
            // Streaming safetensors in low-memory mode needs less free RAM.
            val mib=1024L*1024L
            val bytes=file.listFiles().orEmpty().sumOf{it.length()}
            val minimum=if(sf&&options(id).lowMemory)768L*mib else maxOf(bytes+256L*mib,1536L*mib)
            check(!info.lowMemory&&info.availMem>minimum){"Memória disponível insuficiente; modelo instalado foi preservado"}
            phase="LOADING";models[id]?.put("state","LOADING");publish()
            if(sf){if(isFlux(id))SafetensorsSession.openFlux(file,{cancel.get()||closed},options(id).lowMemory){safetensorsSession=it}else SafetensorsSession.open(File(file,SafetensorsPackage.checkpoint),{cancel.get()||closed},options(id).lowMemory){safetensorsSession=it}}
            else if(nezumi){val h=NezumiImageNative.create();check(h>0){"Motor Nezumi indisponível"};nezumiHandle=h;check(!cancel.get()&&!closed){"Carregamento cancelado"};check(NezumiImageNative.loadCpu(h,file.absolutePath)&&NezumiImageNative.isLoaded(h)){NezumiImageNative.lastError()}}
            else if(preload)check(ImageNative.load(file.absolutePath)){"Não foi possível preparar os componentes SD1.5. Pode haver incompatibilidade ou falta de memória."}
            if(cancel.get()||closed)throw IllegalStateException("Carregamento cancelado")
            if(preload){loaded=id;phase="LOADED";models[id]?.put("state","LOADED")}
        }catch(e:Throwable){finishImage();models[id]?.put("state","ERROR");throw e}
    }
    private val outputs=File(app.filesDir,"generated-images").apply{mkdirs()}
    @JavascriptInterface fun cancelGeneration(id:String){if(activeJob==id)cancel()}
    @JavascriptInterface fun result(id:String):String {if(!id.matches(Regex("[0-9a-f-]{36}")))return "{}";return runCatching{File(outputs,"$id.json").readText()}.getOrDefault("{}")}
    @JavascriptInterface @Synchronized fun generate(request:String,prompt:String):Boolean {
        if(closed||busy||!request.matches(Regex("[0-9a-f-]{36}"))||prompt.isBlank()||prompt.length>2000||File(outputs,"$request.png").exists()||File(outputs,"$request.json").exists())return false
        activeJob=request // Reserve identity before the worker can be cancelled.
        return submit {
        val count=if(optionEngine()=="mnn")1 else prefs.getInt("batchCount",1);val results=JSONArray();job=JSONObject().put("request",request).put("state","LOADING").put("results",results).put("count",count).put("current",1);publish()
        val part=File(outputs,"$request.part.png");val target=File(outputs,"$request.png")
        try {val selected=prefs.getString("selected",null)?:throw IllegalStateException("Selecione um modelo SD1.5 em Configurações")
            check(outputs.usableSpace>64L*1024*1024){"Espaço insuficiente para salvar a imagem"}
            check(count==1||optionEngine(selected)!="mnn"){"Este motor MNN ainda permite uma imagem por sessão"};prepare(selected,false);check(!cancel.get()&&!closed){"Geração cancelada"}
            val config=options();val sf=isSafetensors(selected);val nezumi=isNezumi(selected);val t=if(nezumi||sf)0L else tickets.incrementAndGet();if(!nezumi&&!sf){check(ImageNative.reserve(t)){"Motor de imagem ocupado"};nativeTicket=t}
            check(!cancel.get()&&!closed){"Geração cancelada"};phase="GENERATING";job.put("state","GENERATING");publish()
            val mode=when(prefs.getString("performance","balanced")){"economy"->0;"performance"->1;else->2}
            val nw=config.nativeWidth(sf);val nh=config.nativeHeight(sf)

            val initialSeed=if(config.seed<0)java.security.SecureRandom().nextInt(Int.MAX_VALUE).toLong()else config.seed
            for(index in 0 until count){
            check(!cancel.get()&&!closed){"Geração cancelada"};val imageId=if(index==0)request else java.util.UUID.randomUUID().toString();val part=File(outputs,"$imageId.part.png");val target=File(outputs,"$imageId.png");val seed=if(count==1)config.seed else (initialSeed+index)%2147483648L;job.put("current",index+1).put("currentRequest",imageId);publish()
            try{
            if(sf){val memory=ActivityManager.MemoryInfo();app.getSystemService(ActivityManager::class.java).getMemoryInfo(memory);val enabled=prefs.getBoolean("showPreviews",false)&&!memory.lowMemory&&memory.availMem>512L*1024*1024;val applied=checkNotNull(safetensorsSession).preview(enabled);job.put("previewState",if(enabled&&applied)"projection"else"disabled_or_low_memory")};publish()
            val ok=if(sf){checkNotNull(safetensorsSession).generate(prompt,config.negativePrompt,part,nw,nh,config.steps,seed,config.cfg,config.clipSkip,config.sampler,config.scheduler);ImageFiles.validateSize(part,nw,nh);true}
                else if(nezumi){val rgb=NezumiImageNative.generateRgb(nezumiHandle,prompt,config.negativePrompt,config.steps,seed,config.cfg.toFloat(),config.sampler,config.scheduler)?:throw IllegalStateException(NezumiImageNative.lastError());check(!cancel.get()&&!closed){"Geração cancelada"};ImageFiles.writeRgb(part,rgb);true}
                else ImageNative.generate(t,dir(selected).absolutePath,prompt,part.absolutePath,config.steps,mode,config.cfg.toFloat(),seed)

            check(!cancel.get()&&!closed){"Geração cancelada"};check(ok&&part.isFile){"O MNN não concluiu a geração"}
            ImageFiles.finishSize(part,config.width,config.height,nw,nh,config.legacySide>0)
            check(!cancel.get()&&!closed){"Geração cancelada"};check(part.renameTo(target)){"Não foi possível salvar o PNG"}
            val item=JSONObject().put("request",imageId).put("file",target.name).put("seed",seed).put("width",config.width).put("height",config.height);results.put(item);job.put("file",target.name).put("nativeResolution",if(nw==nh)nw else JSONObject.NULL).put("outputResolution",config.width).put("outputWidth",config.width).put("outputHeight",config.height).put("nativeWidth",nw).put("nativeHeight",nh).put("steps",config.steps).put("cfg",config.cfg).put("seed",config.seed)
            val child=File(outputs,"$imageId.json");if(imageId!=request)child.writeText(item.toString());val partialMeta=File(outputs,"$request.json.part");partialMeta.writeText(job.toString());check(partialMeta.renameTo(File(outputs,"$request.json"))){"Não foi possível registrar o lote"};publish()
            if(prefs.getBoolean("autoSave",true))runCatching{ImageFiles.save(app,target)}.onFailure{job.put("saveWarning","PNG privado salvo; não foi possível salvar na galeria")}
            }finally{part.delete();File(outputs,"$imageId.preview.png").delete();File(outputs,"$imageId.preview.png.part").delete()}
            };job.put("state","COMPLETED")
        }catch(e:OutOfMemoryError){part.delete();job.put("state","ERROR").put("error","Memória insuficiente para concluir a imagem. O modelo instalado foi preservado.")}catch(e:Exception){part.delete();job.put("state",if(cancel.get()||closed)"CANCELLED" else "ERROR").put("error",if(cancel.get()||closed)"Geração cancelada" else if(e.message=="Memória disponível insuficiente; modelo instalado foi preservado")"Memória livre insuficiente. O Android sinalizou memória insuficiente para este modelo. Tente o modo de pouca memória ou feche outros aplicativos; o modelo instalado foi preservado." else if(e.message=="O backend não identificou o GGUF ativo; recarregue-o antes de gerar imagens.")e.message else if((e.message.orEmpty().startsWith("Motor Nezumi CPU: erro técnico ")||(e.message.orEmpty().startsWith("SD1.5 CPU: ")||e.message.orEmpty().startsWith("Stable Diffusion CPU: "))))e.message else "Não foi possível concluir a imagem. Confira o modelo e a memória disponível.")}
        finally {if(nativeTicket>0){ImageNative.finish(nativeTicket);nativeTicket=0};finishImage();restoreWarning?.let{job.put("restoreWarning",it)};models.values.filter{it.optString("state")=="LOADING"}.forEach{it.put("state","INSTALLED")};activeJob=null;phase=if(models.isEmpty())"NOT_INSTALLED" else "INSTALLED";val meta=File(outputs,"$request.json.part");meta.writeText(job.toString());meta.renameTo(File(outputs,"$request.json"));publish()}
        }
    }
    private fun image(id:String):File {require(id.matches(Regex("[0-9a-f-]{36}")));return File(outputs,"$id.png").also{require(it.isFile)}}
    @JavascriptInterface fun save(id:String)=submit {ImageFiles.save(app,image(id))}
    @JavascriptInterface fun saveBatch(id:String)=submit{val result=JSONObject(result(id));val items=result.optJSONArray("results")?:JSONArray().put(JSONObject().put("request",id));for(i in 0 until items.length())ImageFiles.save(app,image(items.getJSONObject(i).getString("request")))}
    @JavascriptInterface fun open(id:String,share:Boolean){val f=runCatching{image(id)}.getOrNull()?:return;ImageFiles.open(app,f,share)}
    @Synchronized fun close(){if(closed)return;closed=true;cancel();worker.execute{restorePath=null;free()};worker.shutdown()}
}

