"""Real VisionModels owner + real model checksums; fake Android/JNI for lifecycle assertions only."""
import ast,os,subprocess,tempfile
from pathlib import Path
cache=Path(os.environ.get('HARUNA_KOTLIN_TOOLS','/workspace/stage8-tools/kotlin'))
tree=ast.parse(Path('tests/image_controller_check.py').read_text());original=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='stubs' for t in n.targets))
stubs={name:original[name] for name in ['Context.kt','Activity.kt','Uri.kt']}
stubs['Bitmap.kt']='''package android.graphics
class Bitmap(val width:Int=2,val height:Int=2){fun getPixels(p:IntArray,o:Int,s:Int,x:Int,y:Int,w:Int,h:Int){p.fill(0xff0000)}}
'''
stubs['Native.kt']='''package com.proxyslabs.haruna.documents
import com.proxyslabs.haruna.image.ImageLease
object VisionNative{val available=true;var fail=false;var partial=false;var runs=0;lateinit var backend:com.proxyslabs.haruna.LlmBackend
fun analyze(t:Long,m:String,p:String,b:ByteArray,w:Int,h:Int,q:String):ByteArray?{check(ImageLease.active);check(!backend.status().modelLoaded);runs++;return if(fail)null else "Descrição de teste JNI falso".toByteArray()};fun error()=8;fun stopReason()=if(partial)2 else 1}
object DocumentReader{fun digest(file:java.io.File):String{val h=java.security.MessageDigest.getInstance("SHA-256");file.inputStream().use{input->val b=ByteArray(131072);while(true){val n=input.read(b);if(n<0)break;h.update(b,0,n)}};return h.digest().joinToString(""){"%02x".format(it)}}}
'''
stubs['Test.kt']='''import com.proxyslabs.haruna.documents.*
import com.proxyslabs.haruna.image.ImageLease
import com.proxyslabs.haruna.LlmBackend
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean
class Backend:LlmBackend{var loaded=true;var loads=0;var unloads=0;var failRestore=false;override fun status()=LlmBackend.Status(true,loaded,if(loaded)"active"else"not_loaded");override fun installedModelPath()=if(loaded)"original.gguf"else null;override fun awaitAuxiliaryReady()=Result.success(Unit);override fun unloadModel():Result<Unit>{unloads++;loaded=false;return Result.success(Unit)};override fun loadModel(p:String):Result<Unit>{check(!ImageLease.active);loads++;if(failRestore)return Result.failure(Exception());loaded=true;return Result.success(Unit)};override fun resetConversation()=Result.success(Unit);override fun generate(r:String,p:String,t:(String)->Unit,c:()->Unit,e:(String,String)->Unit){};override fun stop(r:String)=Result.success(Unit)}
fun main(args:Array<String>){val app=android.content.Context(File(args[0]));val backend=Backend();VisionNative.backend=backend;val manager=VisionModels(app,backend);val specs=manager.list();for(i in 0 until specs.length())manager.select(specs.getJSONObject(i).getString("id"));check(manager.ready());val cancel=AtomicBoolean(false)
 val result=manager.analyze(1,android.graphics.Bitmap(),"pergunta",cancel,{false},{ });check(result.first.isNotBlank()&&backend.loaded&&backend.loads==1&&backend.unloads==1&&!ImageLease.active)
 VisionNative.fail=true;check(runCatching{manager.analyze(2,android.graphics.Bitmap(),"",cancel,{false},{})}.isFailure);check(backend.loaded&&!ImageLease.active&&backend.loads==2)
 VisionNative.fail=false;backend.failRestore=true;val failed=manager.analyze(3,android.graphics.Bitmap(),"",cancel,{false},{});check(failed.second!=null&&!backend.loaded&&!ImageLease.active)
 backend.failRestore=false;backend.loaded=true;ImageLease.active=true;val before=backend.unloads;check(runCatching{manager.analyze(4,android.graphics.Bitmap(),"",cancel,{false},{})}.isFailure);check(backend.unloads==before&&backend.loaded);ImageLease.active=false
 cancel.set(true);val runs=VisionNative.runs;check(runCatching{manager.analyze(5,android.graphics.Bitmap(),"",cancel,{false},{})}.isFailure);check(VisionNative.runs==runs&&backend.loaded&&!ImageLease.active)
 println("PASS vision lifecycle with FAKE JNI: unload before vision, restore after success/failure, restore-error warning, competing lease rejected, cancelled operation never enters native")
}
'''
weights=Path(os.environ.get('HARUNA_VISION_TEST_MODELS','/workspace/haruna-stage8-deps/models'))
if not weights.is_dir():raise SystemExit('Requires explicit local SmolVLM fixture weights; no download performed')
with tempfile.TemporaryDirectory(dir=weights.parent) as tmp:
 r=Path(tmp);root=r/'files';models=root/'vision-models';models.mkdir(parents=True)
 for name in ['SmolVLM-500M-Instruct-Q8_0.gguf','mmproj-SmolVLM-500M-Instruct-f16.gguf']:
  digest=(weights/(name+'.sha256')).read_text().strip();os.link(weights/name,models/(digest+'.gguf'))
 files=[]
 for name,content in stubs.items():p=r/name;p.write_text(content);files.append(str(p))
 base=Path('app/src/main/java/com/proxyslabs/haruna');files +=[str(base/'LlmBackend.kt'),str(base/'image/ImageLease.kt'),str(base/'documents/VisionModels.kt')]
 out=r/'test.jar';cp=os.pathsep.join(str(cache/n) for n in ['stdlib.jar','json.jar'])
 subprocess.run(['java','-cp',str(cache/'*'),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler','-nowarn','-no-stdlib','-no-reflect','-classpath',cp,'-d',str(out)]+files,check=True)
 subprocess.run(['java','-cp',str(out)+os.pathsep+str(cache/'*'),'TestKt',str(root)],check=True,timeout=90)
