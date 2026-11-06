package com.proxyslabs.haruna.documents

import android.app.ActivityManager
import android.content.Context
import android.net.Uri
import com.proxyslabs.haruna.LlmBackend
import com.proxyslabs.haruna.image.ImageLease
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.withLock

/** First verified family: official SmolVLM-500M weights and matching projector, never arbitrary GGUF. */
class VisionModels(private val app:Context,private val backend:LlmBackend){
    data class Spec(val name:String,val role:String,val bytes:Long,val sha:String)
    private val specs=listOf(
        Spec("SmolVLM-500M-Instruct-Q8_0.gguf","model",436806912,"9d4612de6a42214499e301494a3ecc2be0abdd9de44e663bda63f1152fad1bf4"),
        Spec("SmolVLM-500M-Instruct-f16.gguf","model",820422912,"26c2ee46ef9f8472b3d305a71703153a55f4f2c3baaa12ff5feb566fddb65343"),
        Spec("mmproj-SmolVLM-500M-Instruct-f16.gguf","projector",199468800,"4b2fca922e549e9b9608f4ba56f93565dd5220e935ba5570a2a864a0fcc988a6"),
        Spec("mmproj-SmolVLM-500M-Instruct-Q8_0.gguf","projector",108783360,"d1eb8b6b23979205fdf63703ed10f788131a3f812c7b1f72e0119d5d81295150"))
    private val root=File(app.filesDir,"vision-models").apply{mkdirs()}
    private val prefs=app.getSharedPreferences("haruna_vision_models",Context.MODE_PRIVATE)
    private fun file(s:Spec)=File(root,s.sha+".gguf")
    fun list()=JSONArray(specs.filter{file(it).isFile}.map{s->JSONObject().put("id",s.sha).put("name",s.name).put("role",s.role).put("bytes",file(s).length()).put("selected",prefs.getString(s.role,null)==s.sha)})
    fun select(id:String){val s=specs.firstOrNull{it.sha==id}?:error("Modelo visual incompatível");check(file(s).isFile);check(prefs.edit().putString(s.role,s.sha).commit())}
    fun remove(id:String){val s=specs.firstOrNull{it.sha==id}?:error("Modelo não encontrado");check(!file(s).exists()||file(s).delete());if(prefs.getString(s.role,null)==id)prefs.edit().remove(s.role).commit()}
    private fun selected(role:String)=specs.firstOrNull{it.role==role&&it.sha==prefs.getString(role,null)&&file(it).isFile}
    @Volatile var restoreWarning:String?=null;private set
    fun ready()=selected("model")!=null&&selected("projector")!=null
    private fun install(input:InputStream,role:String,cancel:AtomicBoolean,progress:(Long,Long?)->Unit){
        require(role in listOf("model","projector"));val max=specs.filter{it.role==role}.maxOf{it.bytes};check(root.usableSpace>max+128L*1024*1024){"Espaço insuficiente para o modelo visual"}
        val temp=File(root,".${java.util.UUID.randomUUID()}.part");try{val md=MessageDigest.getInstance("SHA-256");var bytes=0L
            input.buffered().use{stream->val prefix=ByteArray(4);java.io.DataInputStream(stream).readFully(prefix);require(prefix.contentEquals(byteArrayOf(71,71,85,70))){"Selecione o GGUF visual oficial ou seu projetor"}
                temp.outputStream().use{out->out.write(prefix);md.update(prefix);bytes=4;val buf=ByteArray(131072);while(true){check(!cancel.get()){ "Operação cancelada" };val n=stream.read(buf);if(n<0)break;bytes+=n;require(bytes<=max){"Arquivo visual incompatível"};check(root.usableSpace>128L*1024*1024){"Espaço insuficiente"};out.write(buf,0,n);md.update(buf,0,n);progress(bytes,null)}}}
            val sha=md.digest().joinToString(""){"%02x".format(it)};val spec=specs.firstOrNull{it.role==role&&it.sha==sha&&it.bytes==bytes}?:error("Arquivo não corresponde aos modelos SmolVLM-500M oficiais suportados")
            check(!cancel.get()){ "Operação cancelada" };val target=file(spec);if(target.exists()&&DocumentReader.digest(target)==spec.sha)temp.delete()else check(temp.renameTo(target)){"Falha ao instalar modelo visual"};if(prefs.getString(role,null)==null)prefs.edit().putString(role,spec.sha).commit()
        }finally{temp.delete()}
    }
    fun installUri(uri:Uri,role:String,cancel:AtomicBoolean,progress:(Long,Long?)->Unit){app.contentResolver.openInputStream(uri).use{install(requireNotNull(it),role,cancel,progress)}}
    @Volatile private var connection:HttpURLConnection?=null
    fun cancelTransfer(){connection?.disconnect()}
    fun download(cancel:AtomicBoolean,progress:(Long,Long?)->Unit){for(s in listOf(specs[0],specs[2])){
        if(file(s).isFile&&file(s).length()==s.bytes&&DocumentReader.digest(file(s))==s.sha)continue
        val url="https://huggingface.co/ggml-org/SmolVLM-500M-Instruct-GGUF/resolve/72e986006ef53e37cdd3f6d4241c90b0f01df376/${s.name}"
        val c=URL(url).openConnection() as HttpURLConnection;connection=c;try{check(!cancel.get()){ "Operação cancelada" };c.connectTimeout=30000;c.readTimeout=60000;c.instanceFollowRedirects=true;require(c.responseCode in 200..299){"Servidor de modelos indisponível"};c.inputStream.use{install(it,s.role,cancel){n,_->progress(n,s.bytes)}}}finally{connection=null;c.disconnect()}
    }}
    fun analyze(ticket:Long,image:android.graphics.Bitmap,question:String,cancel:AtomicBoolean,closed:()->Boolean,stage:(String)->Unit):Pair<String,String?>{
        check(VisionNative.available){"Motor visual não incluído nesta versão"};val model=selected("model")?:error("Instale e selecione o SmolVLM-500M");val projector=selected("projector")?:error("Instale e selecione o projetor visual correspondente")
        for(s in listOf(model,projector)){check(!cancel.get()){ "Operação cancelada" };check(file(s).length()==s.bytes&&DocumentReader.digest(file(s))==s.sha){"Modelo visual incompleto ou corrompido"}}
        check(backend.status().state !in listOf("generating","loading")){"Aguarde o modelo de conversa"};check(backend.status().available){"Backend nativo indisponível"};var previous:String?=null;var owned=false;var warning:String?=null;var textResult="";restoreWarning=null
        try{ImageLease.lock.withLock{check(!ImageLease.active){"Aguarde a operação de outro motor"};ImageLease.active=true;owned=true
                if(backend.status().modelLoaded)previous=checkNotNull(backend.installedModelPath()){ "Não foi possível identificar o GGUF ativo" }
                stage("SUSPENDING_LLM");backend.unloadModel().getOrThrow();check(!backend.status().modelLoaded){"O GGUF permanece carregado"}}
            backend.awaitAuxiliaryReady().getOrThrow();val info=ActivityManager.MemoryInfo();app.getSystemService(ActivityManager::class.java).getMemoryInfo(info);check(!info.lowMemory&&info.availMem>maxOf(1536L*1024*1024,(model.bytes+projector.bytes)*2)){"Memória disponível insuficiente para visão; os arquivos foram preservados"}
            check(!cancel.get()){ "Operação cancelada" };stage("VISION");val pixels=IntArray(image.width*image.height);image.getPixels(pixels,0,image.width,0,0,image.width,image.height);val rgb=ByteArray(pixels.size*3);pixels.forEachIndexed{i,p->rgb[i*3]=(p shr 16).toByte();rgb[i*3+1]=(p shr 8).toByte();rgb[i*3+2]=p.toByte()}
            val result=VisionNative.analyze(ticket,file(model).path,file(projector).path,rgb,image.width,image.height,question)?:error("Falha no motor visual (código ${VisionNative.error()})")
            check(!cancel.get()){ "Operação cancelada" };val text=result.toString(Charsets.UTF_8).trim();check(text.isNotBlank()){ "O modelo visual não produziu descrição" };if(VisionNative.stopReason()==2)warning="A interpretação visual atingiu seu orçamento; trate-a como parcial."
            textResult=text
        }finally{if(owned)ImageLease.lock.withLock{ImageLease.active=false;if(!closed()&&previous!=null&&!backend.status().modelLoaded){stage("RESTORING_LLM");runCatching{backend.loadModel(previous!!).getOrThrow()}.onFailure{warning="Não foi possível restaurar o GGUF anterior; carregue-o novamente."};if(!backend.status().modelLoaded)warning="O GGUF anterior não foi confirmado pelo backend.";restoreWarning=warning}}}
        return textResult to warning
    }
}
