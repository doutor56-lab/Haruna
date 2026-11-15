"""Compile actual Kotlin identity against an asset-only Android Context stub. No inference/SDK."""
import os,subprocess,tempfile
from pathlib import Path
cache=Path(os.environ.get('HARUNA_KOTLIN_TOOLS','/tmp/haruna-identity-tools'))
with tempfile.TemporaryDirectory() as tmp:
 root=Path(tmp)
 (root/'Context.kt').write_text('''package android.content
class Context(val assets:Assets)
class Assets(val root:java.io.File){fun open(path:String)=java.io.File(root,path).inputStream()}
''')
 (root/'IdentityCheck.kt').write_text('''import com.proxyslabs.haruna.HarunaIdentity
import org.json.JSONObject
fun main(args:Array<String>){
 HarunaIdentity.initialize(android.content.Context(android.content.Assets(java.io.File(args[0]))))
 check(HarunaIdentity.NAME=="Haruna")
 check(HarunaIdentity.details().getString("developer")=="Proxys Labs")
 for(author in listOf("Fornecedor A","Fornecedor B")){
  val meta=JSONObject().put("author",author).put("license","apache-2.0")
  val system=HarunaIdentity.systemPrompt("selected.gguf",meta)
  check(system.startsWith("Você é Haruna"));check(system.contains("Proxys Labs"));check(system.contains(author));check(system.contains("nem parceria ou afiliação"));check(system.contains("apache-2.0"))
 }
 check(!HarunaIdentity.systemPrompt("unknown.gguf").contains("Fornecedor B"))
 HarunaIdentity.details().put("developer","wrong")
 check(HarunaIdentity.details().getString("developer")=="Proxys Labs")
 println("PASS Kotlin identity: shared asset, independent supplier/license, unknown source, defensive copy")
}
''')
 base=Path('app/src/main/java/com/proxyslabs/haruna');out=root/'check.jar';cp=os.pathsep.join(str(cache/n) for n in ['stdlib.jar','json.jar'])
 subprocess.run(['java','-cp',str(cache/'*'),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler','-no-stdlib','-no-reflect','-classpath',cp,'-d',str(out),str(root/'Context.kt'),str(root/'IdentityCheck.kt'),str(base/'HarunaIdentity.kt'),str(base/'HarunaBehaviorProfile.kt')],check=True)
 for _ in range(2):subprocess.run(['java','-cp',str(out)+os.pathsep+str(cache/'*'),'IdentityCheckKt',str(Path('app/src/main/assets').resolve())],check=True)
