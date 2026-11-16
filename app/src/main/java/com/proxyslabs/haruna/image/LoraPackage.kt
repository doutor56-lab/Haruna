package com.proxyslabs.haruna.image
import org.json.JSONObject
import java.io.File
internal object LoraPackage {
 const val format="safetensors_lora"
 fun family(t:Map<String,SafetensorsArchitecture.Tensor>,meta:JSONObject):String {
  val down=Regex("\\.(lora_down|lora_A(?:\\.default)?)\\.weight$");var pairs=0
  for((name,a)in t){val m=down.find(name)?:continue;val suffix=m.groupValues[1];val other=name.replace(down,"."+(if(suffix=="lora_down")"lora_up"else suffix.replace("lora_A","lora_B"))+".weight");val b=t[other]?:error("Par LoRA incompleto")
   require(a.shape.size in setOf(2,4)&&a.shape.size==b.shape.size&&a.shape[0]==b.shape[1]&&listOf(a,b).all{it.dtype in setOf("F16","BF16","F32")}){"Par LoRA incompatível"};pairs++}
  require(pairs>0&&t.keys.all{Regex("(?:\\.(?:lora_down|lora_up|lora_[AB](?:\\.default)?)\\.weight|\\.alpha)$").containsMatchIn(it)}){"Requer LoRA convencional; LoHa, LoKr e DoRA não suportados"}
  val d=(meta.optString("ss_base_model_version")+" "+meta.optString("modelspec.architecture")).lowercase();val names=t.keys.joinToString(" ")
  return when{Regex("anima").containsMatchIn(d)||names.contains("llm_adapter")->"anima";d.contains("flux")||Regex("double_blocks|single_blocks").containsMatchIn(names)->"flux1";Regex("sdxl|stable-diffusion-xl").containsMatchIn(d)||names.contains("lora_te2")->"sdxl";Regex("sd_v1|stable-diffusion-v1|sd1[._-]?5").containsMatchIn(d)->"sd15";t.any{(n,v)->Regex("attn2_to_[kv]\\.lora_down").containsMatchIn(n)&&v.shape[1]==768L}->"sd15";t.any{(n,v)->Regex("attn2_to_[kv]\\.lora_down").containsMatchIn(n)&&v.shape[1]==2048L}->"sdxl";else->error("Família LoRA não identificada com segurança; use metadados de arquitetura")}
 }
 fun verify(dir:File,cancelled:()->Boolean={false}):JSONObject{
  val manifest=File(dir,"haruna-image-model.json");require(manifest.length() in 1..65536);val m=JSONObject(manifest.readText());require(m.getInt("version")==1&&m.getString("format")==format&&m.getString("engine")=="stable-diffusion.cpp")
  val f=File(dir,SafetensorsPackage.checkpoint);require(m.getJSONObject("files").length()==1);require(dir.listFiles().orEmpty().map{it.name}.toSet()==setOf(f.name,manifest.name)&&ImagePackage.hash(f,cancelled)==m.getJSONObject("files").getString(f.name)){"LoRA corrompido"}
  f.inputStream().buffered().use{val h=SafetensorsInspector.readHeader(it);require(h.result.fileBytes==f.length()&&family(h.tensors,JSONObject(h.json.toString(Charsets.UTF_8)).optJSONObject("__metadata__")?:JSONObject())==m.getString("architecture"))};return m
 }
}
