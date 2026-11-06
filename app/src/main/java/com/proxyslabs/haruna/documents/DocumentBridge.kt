package com.proxyslabs.haruna.documents

import android.content.Context
import android.net.Uri
import android.webkit.JavascriptInterface
import android.webkit.WebResourceResponse
import com.proxyslabs.haruna.LlmBackend
import org.json.JSONObject
import org.json.JSONArray
import java.io.File
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import java.util.zip.ZipFile

/** Process-owned actor, like HarunaRuntime. No Activity/WebView reference or parallel heavy jobs. */
class DocumentBridge(context:Context,private val backend:LlmBackend){
    private val app=context.applicationContext
    private val store=DocumentStore(app)
    private val reader=DocumentReader(app)
    private val vision=VisionModels(app,backend)
    private val worker=Executors.newSingleThreadExecutor()
    private data class Job(val id:String=UUID.randomUUID().toString(),val ticket:Long=serial.incrementAndGet(),val cancelled:AtomicBoolean=AtomicBoolean(false),var doc:String?=null,var query:String="",var section:Int=0,var nextBatch:Int=0,val warnings:MutableList<String> = mutableListOf())
    @Volatile private var active:Job?=null
    @Volatile private var state="{}"
    private var value=JSONObject().put("state","IDLE")
    init{worker.execute{store.recover();publish()}}
    private fun publish(){state=value.toString()}
    private fun phase(name:String){value.put("state",name);publish()}
    private fun progress(done:Int,total:Int?){value.put("completed",done).put("total",total?:JSONObject.NULL);publish()}
    private fun checked(j:Job){check(!j.cancelled.get()){ "Operação cancelada" }}
    private fun error(t:Throwable):String=when(t){
        is java.net.UnknownHostException,is java.net.ConnectException->"Não foi possível acessar o servidor. Verifique sua conexão com a internet."
        is java.net.SocketTimeoutException->"A conexão demorou demais. Tente novamente."
        is OutOfMemoryError->"Memória insuficiente; os arquivos originais foram preservados."
        is IllegalArgumentException,is IllegalStateException->t.message?.take(220)?:"Documento incompatível"
        else->"Não foi possível processar o arquivo. Ele pode estar protegido, incompleto ou corrompido."
    }
    private fun fail(j:Job,t:Throwable){if(active!==j)return;android.util.Log.e("HarunaDocuments","operation_failed type=${t.javaClass.simpleName}");if(j.doc!=null)runCatching{if(store.doc(j.doc!!).state=="PROCESSING")store.finish(j.doc!!,value.optInt("total",0),if(j.cancelled.get())"CANCELLED" else "PARTIAL")};vision.restoreWarning?.let{j.warnings.add(it)};value.put("state",if(j.cancelled.get())"CANCELLED"else"ERROR").put("error",if(j.cancelled.get())"Operação cancelada"else error(t)).put("warnings",JSONArray(j.warnings));active=null;publish()}
    private fun done(j:Job){if(active!==j)return;checked(j);value.put("state","DONE").put("documentId",j.doc).put("warnings",JSONArray(j.warnings));if(j.doc!=null)value.put("context",store.context(j.doc!!,j.query));active=null;publish()}
    @Synchronized private fun submit(body:(Job)->Unit):String{
        if(active!=null)return JSONObject().put("error","Aguarde a operação atual").toString()
        val j=Job();active=j;value=JSONObject().put("id",j.id).put("state","QUEUED");publish();worker.execute{try{body(j)}catch(t:Throwable){fail(j,t)}};return JSONObject().put("id",j.id).toString()
    }
    @JavascriptInterface fun status():String{val out=JSONObject(state).put("busy",active!=null).put("visionAvailable",VisionNative.available).put("visionInstalled",vision.ready()).put("visionModels",vision.list()).put("index",store.indexKind);if(VisionNative.available)out.put("nativeVisionPhase",VisionNative.phase());return out.toString()}
    @JavascriptInterface fun list():String=runCatching{store.list().toString()}.getOrDefault("[]")
    @JavascriptInterface fun search(query:String,limit:Int,doc:String?):String=runCatching{store.search(query.take(2000),limit,doc?.removePrefix("native:")?.takeIf{it.isNotBlank()}).toString()}.getOrDefault("[]")
    @JavascriptInterface fun context(path:String,query:String):String=runCatching{val f=attachment(path);val d=store.linked(f.path);if(d==null)"{}"else JSONObject().put("documentId",d.id).put("context",store.context(d.id,query.take(2000))).toString()}.getOrDefault("{}")
    @JavascriptInterface fun cancel(id:String){val j=active?:return;if(j.id!=id)return;j.cancelled.set(true);reader.cancel();vision.cancelTransfer();if(VisionNative.available)VisionNative.cancel(j.ticket);if(JSONObject(state).optString("state")=="WAITING_DOCX")worker.execute{fail(j,IllegalStateException("Operação cancelada"))}}
    fun importUri(uri:Uri):String=submit{j->val name=app.contentResolver.query(uri,arrayOf(android.provider.OpenableColumns.DISPLAY_NAME),null,null,null)?.use{if(it.moveToFirst())it.getString(0)else null}?:"documento";phase("COPYING");val temp=File(store.root,".${UUID.randomUUID()}.part");try{app.contentResolver.openInputStream(uri).use{copy(requireNotNull(it),temp,j)};val doc=install(temp,name,j);process(j,doc)}finally{temp.delete()}}
    @JavascriptInterface fun prepare(path:String,question:String):String=submit{j->j.query=question.take(2000);val file=attachment(path);val cached=store.linked(file.path);val doc=if(cached!=null)cached else {phase("COPYING");val temp=File(store.root,".${UUID.randomUUID()}.part");try{file.inputStream().use{copy(it,temp,j)};install(temp,file.name,j,false).also{store.link(file.path,it.id)}}finally{temp.delete()}};process(j,doc)}
    @JavascriptInterface fun processDocument(id:String,question:String):String=submit{j->j.query=question.take(2000);process(j,store.doc(id.removePrefix("native:")))}
    private fun attachment(path:String):File=File(path).also{require(it.isFile&&it.parentFile?.canonicalFile==File(app.filesDir,"attachments").canonicalFile){"Anexo inválido"}}
    private fun copy(input:java.io.InputStream,temp:File,j:Job){var size=0L;var published=0L;temp.outputStream().use{out->val b=ByteArray(131072);while(true){checked(j);val n=input.read(b);if(n<0)break;size+=n;require(size<=512L*1024*1024){"Documento excede 512 MiB"};check(store.root.usableSpace>128L*1024*1024){"Espaço insuficiente"};out.write(b,0,n);if(size-published>=1024*1024){published=size;value.put("copiedBytes",size);publish()}}};require(size>0){"Arquivo vazio"}}
    private fun install(temp:File,name:String,j:Job,retained:Boolean=true):DocumentStore.Doc{
        checked(j);val sample=temp.inputStream().use{val b=ByteArray(1024);val n=it.read(b);b.copyOf(maxOf(0,n))};val ext=name.substringAfterLast('.',"").lowercase();val format=when{
            String(sample,Charsets.ISO_8859_1).contains("%PDF-")->"pdf"
            ext=="docx"->{validateDocx(temp);"docx"}
            ext in listOf("txt","md","csv","json","log")->ext
            else->{val o=android.graphics.BitmapFactory.Options().apply{inJustDecodeBounds=true};android.graphics.BitmapFactory.decodeFile(temp.path,o);require(o.outWidth>0&&o.outHeight>0){"Use PDF, DOCX, TXT ou uma imagem compatível"};"image"}
        };val digest=DocumentReader.digest(temp);store.byHash(digest)?.let{if(retained)store.retain(it.id);return it};val suffix=if(format=="image")"image"else format;val target=File(store.root,"${UUID.randomUUID()}.$suffix");check(temp.renameTo(target));return try{store.register(name,format,digest,target,retained)}catch(t:Throwable){target.delete();throw t}
    }
    private fun validateDocx(file:File){
        require(file.length()<=32L*1024*1024){"DOCX excede 32 MiB"}
        ZipFile(file).use{z->
            require(z.getEntry("word/document.xml")!=null&&z.getEntry("[Content_Types].xml")!=null){"DOCX inválido"}
            val entries=z.entries();var count=0;var expanded=0L;val buffer=ByteArray(65536)
            while(entries.hasMoreElements()){
                check(active?.cancelled?.get()!=true){"Operação cancelada"}
                val entry=entries.nextElement();count++
                require(count<=10000&&entry.size>=0&&!entry.name.startsWith('/')&&!entry.name.contains('\\')&&!entry.name.split('/').contains("..")){"DOCX inválido"}
                expanded+=entry.size;require(expanded<=64L*1024*1024){"DOCX excede o limite seguro de descompressão"}
                if(!entry.isDirectory){var bytes=0L;val crc=java.util.zip.CRC32();z.getInputStream(entry).use{input->while(true){check(active?.cancelled?.get()!=true){"Operação cancelada"};val n=input.read(buffer);if(n<0)break;bytes+=n;require(bytes<=entry.size){"DOCX corrompido"};crc.update(buffer,0,n)}};require(bytes==entry.size&&crc.value==entry.crc){"DOCX corrompido"}}
            }
        }
    }
    private fun process(j:Job,doc:DocumentStore.Doc){j.doc=doc.id;checked(j);val file=File(doc.path)
        if(doc.state in listOf("READY","PARTIAL")){
            if(doc.format=="image"&&j.query.isNotBlank()&&vision.ready())analyze(j,doc,file,null)
            done(j);return
        }
        store.begin(doc.id);if(doc.format=="docx"){phase("WAITING_DOCX");value.put("documentId",doc.id).put("url","/documents/${doc.id}/original");publish();return}
        phase("EXTRACTING");val pages=reader.extract(file,doc.format,j.cancelled,{n,total->progress(n,total)}){section,page,kind,text->checked(j);store.page(doc.id,section,page,kind,text)}
        if(doc.format=="image"){
            if(vision.ready())analyze(j,doc,file,null)else j.warnings.add("Somente OCR: o modelo visual ainda não foi instalado. OCR não interpreta fotografias.")
        }
        checked(j);store.finish(doc.id,pages,if(doc.format=="image"&&!vision.ready())"PARTIAL"else"READY");done(j)
    }
    private fun analyze(j:Job,doc:DocumentStore.Doc,file:File,page:Int?){
        val bitmap=if(page!=null)reader.render(file,page,1024)else reader.bitmap(file,1024)
        try{val (text,warning)=vision.analyze(j.ticket,bitmap,if(j.query.isBlank())"Describe only what is visible. Do not invent details or unreadable text."else j.query,j.cancelled,{false},{phase(it)});checked(j);store.page(doc.id,if(page==null)2 else 1000000+page,page,"vision",text);warning?.let{j.warnings.add(it)}}finally{bitmap.recycle()}
    }
    @JavascriptInterface fun analyzePage(id:String,page:Int,question:String):String=submit{j->val doc=store.doc(id.removePrefix("native:"));require(doc.format=="pdf"||doc.format=="image"){"Selecione PDF ou imagem"};j.doc=doc.id;j.query=question.take(2000);analyze(j,doc,File(doc.path),if(doc.format=="pdf")page else null);done(j)}
    @JavascriptInterface fun docxBatch(job:String,ordinal:Int,blocks:String,last:Boolean):String{
        val j=active;if(j==null||j.id!=job||JSONObject(state).optString("state") !in listOf("WAITING_DOCX","INDEXING_DOCX"))return "{\"error\":\"Pedido expirado\"}"
        require(blocks.length<=200000){"Lote DOCX excessivo"};worker.execute{try{if(active!==j)return@execute;checked(j);require(ordinal==j.nextBatch){"Lote DOCX fora de ordem"};j.nextBatch++;phase("INDEXING_DOCX");val batch=JSONArray(blocks);require(batch.length()<=25);for(i in 0 until batch.length()){checked(j);val b=batch.getJSONObject(i);val text=b.getString("text");require(text.length<=10000);j.section++;store.page(j.doc!!,j.section,null,if(b.optString("heading").contains("Tabela"))"docx_table"else if(b.optString("heading").contains(Regex("(?i)heading|título|title")))"docx_heading"else"docx",text)};progress(j.section,null);if(last){store.finish(j.doc!!,0);done(j)}}catch(t:Throwable){fail(j,t)}};return "{\"ok\":true}"
    }
    @JavascriptInterface fun docxFailed(job:String){val j=active?:return;if(j.id==job)worker.execute{fail(j,IllegalArgumentException("Não foi possível interpretar o DOCX"))}}
    @JavascriptInterface fun keepAttachment(path:String):String=runCatching{val f=attachment(path);val d=store.linked(f.path)?:error("Processe primeiro este anexo");store.retain(d.id);"{\"ok\":true}"}.getOrElse{JSONObject().put("error",error(it)).toString()}
    fun forgetAttachment(path:String){worker.execute{runCatching{store.forget(path)}}}
    @JavascriptInterface fun preview(id:String,section:Int):String=runCatching{store.preview(id.removePrefix("native:"),section).put("name",store.doc(id.removePrefix("native:")).name).toString()}.getOrElse{JSONObject().put("error",error(it)).toString()}
    @JavascriptInterface fun remove(id:String):String=synchronized(this){if(active!=null)return "{\"error\":\"Aguarde a operação atual\"}";runCatching{store.remove(id.removePrefix("native:"));"{\"ok\":true}"}.getOrElse{JSONObject().put("error",error(it)).toString()}}
    @JavascriptInterface fun toggle(id:String):String=runCatching{store.toggle(id.removePrefix("native:"));"{\"ok\":true}"}.getOrElse{"{\"error\":\"Documento inválido\"}"}
    @JavascriptInterface fun visionStatus():String=JSONObject().put("installed",vision.ready()).put("available",VisionNative.available).put("models",vision.list()).toString()
    fun importVision(uri:Uri,role:String):String=submit{j->phase("INSTALLING_VISION");vision.installUri(uri,role,j.cancelled){n,total->value.put("copiedBytes",n).put("totalBytes",total?:JSONObject.NULL);publish()};done(j)}
    @JavascriptInterface fun downloadVision():String=submit{j->phase("DOWNLOADING_VISION");vision.download(j.cancelled){n,total->value.put("copiedBytes",n).put("totalBytes",total?:JSONObject.NULL);publish()};done(j)}
    @JavascriptInterface fun selectVision(id:String):String=synchronized(this){if(active!=null)"{\"error\":\"Motor ocupado\"}"else runCatching{vision.select(id);"{\"ok\":true}"}.getOrElse{JSONObject().put("error",error(it)).toString()}}
    @JavascriptInterface fun removeVision(id:String):String=synchronized(this){if(active!=null)"{\"error\":\"Motor ocupado\"}"else runCatching{vision.remove(id);"{\"ok\":true}"}.getOrElse{JSONObject().put("error",error(it)).toString()}}
    @JavascriptInterface fun renderPreview(id:String,page:Int):String=submit{j->val d=store.doc(id.removePrefix("native:"));j.doc=d.id;phase("RENDERING");val target=File(store.root,"${d.id}.preview.png");val bitmap=if(d.format=="pdf")reader.render(File(d.path),page,1400)else if(d.format=="image")reader.bitmap(File(d.path),1400)else error("Prévia visual indisponível para este formato");try{checked(j);target.outputStream().use{check(bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it))};value.put("previewUrl","/documents/${d.id}/preview");done(j)}finally{bitmap.recycle()}}
    fun serve(path:String):WebResourceResponse?=runCatching{val parts=path.split('/');if(parts.size!=2||parts[1] !in listOf("original","preview")||!parts[0].matches(Regex("[0-9a-f-]{36}")))return null;val doc=store.doc(parts[0]);val file=if(parts[1]=="preview")File(store.root,"${doc.id}.preview.png")else File(doc.path);require(file.parentFile?.canonicalFile==store.root.canonicalFile);WebResourceResponse(if(parts[1]=="preview")"image/png"else if(doc.format=="docx")"application/vnd.openxmlformats-officedocument.wordprocessingml.document"else"application/octet-stream",null,file.inputStream())}.getOrNull()
    companion object{private val serial=AtomicLong()}
}
object DocumentRuntime{
    @Volatile private var current:DocumentBridge?=null
    fun forgetAttachment(path:String){current?.forgetAttachment(path)}
    @Synchronized fun get(context:Context,backend:LlmBackend):DocumentBridge=current?:DocumentBridge(context.applicationContext,backend).also{current=it}
}
