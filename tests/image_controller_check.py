"""Compile the actual controller with small Android/native test doubles, never model inference."""
import os,subprocess,tempfile,urllib.request
from pathlib import Path
cache=Path(os.environ.get('HARUNA_KOTLIN_TOOLS','/tmp/haruna-image-tools'));cache.mkdir(parents=True,exist_ok=True)
artifacts={'compiler.jar':'org/jetbrains/kotlin/kotlin-compiler-embeddable/2.3.0/kotlin-compiler-embeddable-2.3.0.jar','stdlib.jar':'org/jetbrains/kotlin/kotlin-stdlib/2.3.0/kotlin-stdlib-2.3.0.jar','reflect.jar':'org/jetbrains/kotlin/kotlin-reflect/1.6.10/kotlin-reflect-1.6.10.jar','daemon.jar':'org/jetbrains/kotlin/kotlin-daemon-embeddable/2.3.0/kotlin-daemon-embeddable-2.3.0.jar','coroutines.jar':'org/jetbrains/kotlinx/kotlinx-coroutines-core-jvm/1.8.0/kotlinx-coroutines-core-jvm-1.8.0.jar','annotations.jar':'org/jetbrains/annotations/13.0/annotations-13.0.jar','json.jar':'org/json/json/20240303/json-20240303.jar'}
for name,url in artifacts.items():
 if not (cache/name).exists():urllib.request.urlretrieve('https://repo.maven.apache.org/maven2/'+url,cache/name)
stubs={
'Context.kt':'''package android.content
import java.io.File
class Context(val filesDir:File){val applicationContext get()=this;val contentResolver=Resolver();fun getSharedPreferences(n:String,m:Int)=s.getOrPut(filesDir.path+n){Prefs()};@Suppress("UNCHECKED_CAST") fun <T>getSystemService(c:Class<T>):T=android.app.ActivityManager() as T
companion object{const val MODE_PRIVATE=0;val s=mutableMapOf<String,Prefs>()}}
class Resolver{fun openInputStream(u:android.net.Uri)=File(u.path).inputStream()}
class Prefs{private val v=mutableMapOf<String,Any>();fun getString(k:String,d:String?)=v[k] as? String?:d;fun getInt(k:String,d:Int)=v[k] as? Int?:d;fun getBoolean(k:String,d:Boolean)=v[k] as? Boolean?:d;fun edit()=Editor(v)}
class Editor(private val v:MutableMap<String,Any>){fun putString(k:String,x:String)=apply{v[k]=x};fun putInt(k:String,x:Int)=apply{v[k]=x};fun putBoolean(k:String,x:Boolean)=apply{v[k]=x};fun remove(k:String)=apply{v.remove(k)};fun commit()=true}
''',
'Activity.kt':'''package android.app
class ActivityManager{class MemoryInfo{var lowMemory=false;var availMem=Long.MAX_VALUE/2};fun getMemoryInfo(i:MemoryInfo){}}
''',
'Uri.kt':'''package android.net
class Uri(val path:String)
''',
'Clock.kt':'''package android.os
object SystemClock{fun elapsedRealtime()=System.nanoTime()/1000000}
''',
'Annotation.kt':'''package android.webkit
annotation class JavascriptInterface
''',
'Native.kt':'''package com.proxyslabs.haruna.image
object ImageNative{val available=true;var loads=0;var frees=0;var fail=false;fun validate(p:String)=true;fun load(p:String):Boolean{loads++;return !fail};fun unload(){frees++}}
''',
'Test.kt':'''import com.proxyslabs.haruna.image.*
import com.proxyslabs.haruna.LlmBackend
import org.json.JSONObject
import java.io.File
import java.util.zip.*
class Backend:LlmBackend{var resident=true;var unloaded=0;override fun status()=LlmBackend.Status(true,resident,"idle");override fun unloadModel():Result<Unit>{resident=false;unloaded++;return Result.success(Unit)};override fun loadModel(p:String)=Result.success(Unit);override fun resetConversation()=Result.success(Unit);override fun stop(id:String)=Result.success(Unit);override fun generate(r:String,p:String,t:(String)->Unit,c:()->Unit,e:(String,String)->Unit){}}
fun state(b:ImageBridge)=JSONObject(b.status())
fun waitFor(b:ImageBridge,p:(JSONObject)->Boolean){repeat(1000){val s=state(b);if(s.has("models")&&!s.optBoolean("busy")&&p(s))return;Thread.sleep(5)};error("Controller timed out: "+b.status())}
fun main(){val root=java.nio.file.Files.createTempDirectory("controller").toFile();try{val ctx=android.content.Context(root);val backend=Backend();val b=ImageBridge(ctx,backend){};waitFor(b){it.optString("state")=="NOT_INSTALLED"};val zip=File(root,"model.zip");val parts=File(root,"parts").apply{mkdirs()};val hashes=JSONObject();for(n in ImagePackage.required){val f=File(parts,n);f.writeText("fake component");hashes.put(n,ImagePackage.hash(f))};ZipOutputStream(zip.outputStream()).use{z->for(f in parts.listFiles()!!){z.putNextEntry(ZipEntry(f.name));z.write(f.readBytes());z.closeEntry()};z.putNextEntry(ZipEntry("haruna-image-model.json"));z.write(JSONObject().put("version",1).put("engine","mnn").put("architecture","sd15").put("files",hashes).toString().toByteArray());z.closeEntry()}
b.install(android.net.Uri(zip.path));waitFor(b){it.optJSONArray("models")?.length()==1};check(ImageNative.loads==0);val id=state(b).getJSONArray("models").getJSONObject(0).getString("id");b.select(id);waitFor(b){it.optString("selected")==id};b.configure("{\\"resolution\\":512,\\"steps\\":7,\\"performance\\":\\"balanced\\",\\"autoSave\\":true}");waitFor(b){it.optInt("steps")==7&&it.optInt("resolution")==512};b.load(id);waitFor(b){it.optString("state")=="LOADED"};check(!backend.resident&&backend.unloaded==1&&ImageLease.active&&ImageNative.loads==1)
val rival=ImageBridge(ctx,Backend()){};waitFor(rival){it.optJSONArray("models")?.length()==1};val freed=ImageNative.frees;rival.load(id);waitFor(rival){it.optString("state")=="ERROR"};check(ImageNative.frees==freed&&ImageLease.active);rival.close();b.unload();waitFor(b){it.isNull("loaded")};check(!ImageLease.active&&ImageNative.frees>freed);b.close();b.close()
val again=ImageBridge(ctx,Backend()){};waitFor(again){it.optJSONArray("models")?.length()==1};check(state(again).getString("selected")==id&&state(again).getInt("steps")==7&&state(again).isNull("loaded"));ImageNative.fail=true;again.load(id);waitFor(again){it.optString("state")=="ERROR"};check(!ImageLease.active);again.remove(id,true);waitFor(again){it.optJSONArray("models")?.length()==0};again.close();println("PASS: controller install without load, CPU lease, competing owner rejection, unload, persisted selection, restart without autoload, failed load cleanup and removal (FAKE Android/native).")
}finally{root.deleteRecursively()}}
'''}
with tempfile.TemporaryDirectory() as tmp:
 files=[]
 for name,content in stubs.items():p=Path(tmp)/name;p.write_text(content);files.append(str(p))
 app=Path('app/src/main/java/com/proxyslabs/haruna');files +=[str(app/'LlmBackend.kt')]+[str(app/'image'/n) for n in ['ImageBridge.kt','ImagePackage.kt','ImageLease.kt']]
 out=Path(tmp)/'tests.jar';cp=os.pathsep.join(str(cache/n) for n in ['stdlib.jar','json.jar'])
 subprocess.run(['java','-cp',str(cache/'*'),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler','-nowarn','-no-stdlib','-no-reflect','-classpath',cp,'-d',str(out)]+files,check=True)
 subprocess.run(['java','-cp',str(out)+os.pathsep+str(cache/'*'),'TestKt'],check=True)
