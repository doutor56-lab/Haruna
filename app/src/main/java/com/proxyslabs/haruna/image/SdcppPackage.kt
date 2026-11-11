package com.proxyslabs.haruna.image

import org.json.JSONObject
import java.io.File

/** Complete FLUX.1 txt2img sets. FLUX.2, Fill, LoRA and arbitrary LLM GGUF are not accepted. */
internal object SdcppPackage {
    const val format="sdcpp_components_v1"
    val filenames=setOf("diffusion.gguf","diffusion.safetensors","clip_l.safetensors","t5xxl.gguf","t5xxl.safetensors","ae.safetensors")
    fun files(dir:File):Array<String> = arrayOf(
        listOf("diffusion.gguf","diffusion.safetensors").single{File(dir,it).isFile},"clip_l.safetensors",
        listOf("t5xxl.gguf","t5xxl.safetensors").single{File(dir,it).isFile},"ae.safetensors"
    ).map{File(dir,it).absolutePath}.toTypedArray()
    fun verify(dir:File,cancelled:()->Boolean={false}):JSONObject {
        val mf=File(dir,"haruna-image-model.json");require(mf.length() in 1..65536){"Manifesto de imagem inválido"};val m=JSONObject(mf.readText())
        require(m.getInt("version")==1&&m.getString("format")==format&&m.getString("engine")=="stable-diffusion.cpp"&&m.getString("architecture") in setOf("flux1-dev","flux1-schnell")){"Pacote FLUX.1 incompatível"}
        val paths=files(dir);val names=paths.map{File(it).name}.toSet();val hashes=m.getJSONObject("files")
        require(hashes.keys().asSequence().toSet()==names&&dir.listFiles().orEmpty().map{it.name}.toSet()==names+mf.name){"Inclua somente difusão FLUX.1, CLIP-L, T5-XXL, VAE e manifesto"}
        val tensors=paths.map{p->check(!cancelled()){"Operação cancelada"};val f=File(p);require(f.length()>0&&hashes.getString(f.name).matches(Regex("[0-9a-f]{64}"))&&ImagePackage.hash(f,cancelled)==hashes.getString(f.name)){"Componente FLUX incompleto ou corrompido"};if(f.extension=="gguf")ImageGguf.tensors(f) else SafetensorsInspector.tensorMap(f)}
        fun has(index:Int,suffix:String,shape:List<Long>)=tensors[index].any{(name,t)->name.endsWith(suffix)&&t.shape==shape}
        require(has(0,"img_in.weight",listOf(3072,64).map{it.toLong()})&&has(0,"txt_in.weight",listOf(3072,4096).map{it.toLong()})&&has(0,"double_blocks.0.img_attn.qkv.weight",listOf(9216,3072).map{it.toLong()})&&tensors[0].keys.any{it.contains("double_blocks.18.")}&&tensors[0].keys.any{it.contains("single_blocks.37.")}){"Modelo de difusão não corresponde ao FLUX.1 txt2img suportado"}
        require(has(1,"text_model.embeddings.token_embedding.weight",listOf(49408L,768L))&&(has(2,"shared.weight",listOf(32128L,4096L))||has(2,"encoder.embed_tokens.weight",listOf(32128L,4096L)))&&has(3,"decoder.conv_in.weight",listOf(512L,16L,3L,3L))&&has(3,"decoder.conv_out.weight",listOf(3L,128L,3L,3L))){"CLIP-L, T5-XXL ou VAE incompatível com FLUX.1"}
        val guidance=tensors[0].keys.any{it.contains("guidance_in.")};require(guidance==(m.getString("architecture")=="flux1-dev")){"FLUX dev/schnell não corresponde ao manifesto"};return m
    }
}
