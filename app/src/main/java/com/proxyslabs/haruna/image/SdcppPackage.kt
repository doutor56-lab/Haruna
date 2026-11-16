package com.proxyslabs.haruna.image

import org.json.JSONObject
import java.io.File

/** Verified component sets for FLUX.1 and Anima 2B; arbitrary LLM files are not image models. */
internal object SdcppPackage {
    const val format="sdcpp_components_v1"
    val filenames=setOf("diffusion.gguf","diffusion.safetensors","clip_l.safetensors","t5xxl.gguf","t5xxl.safetensors","ae.safetensors","llm.safetensors","llm.gguf","vae.safetensors")
    fun files(dir:File):Array<String> = if(File(dir,"llm.gguf").isFile||File(dir,"llm.safetensors").isFile)arrayOf(listOf("diffusion.gguf","diffusion.safetensors").single{File(dir,it).isFile},listOf("llm.gguf","llm.safetensors").single{File(dir,it).isFile},"vae.safetensors").map{File(dir,it).absolutePath}.toTypedArray() else arrayOf(
        listOf("diffusion.gguf","diffusion.safetensors").single{File(dir,it).isFile},"clip_l.safetensors",
        listOf("t5xxl.gguf","t5xxl.safetensors").single{File(dir,it).isFile},"ae.safetensors"
    ).map{File(dir,it).absolutePath}.toTypedArray()
    fun verify(dir:File,cancelled:()->Boolean={false}):JSONObject {
        val mf=File(dir,"haruna-image-model.json");require(mf.length() in 1..65536){"Manifesto de imagem inválido"};val m=JSONObject(mf.readText())
        require(m.getInt("version")==1&&m.getString("format")==format&&m.getString("engine")=="stable-diffusion.cpp"&&m.getString("architecture") in setOf("flux1-dev","flux1-schnell","anima")){"Pacote FLUX.1 incompatível"}
        val paths=files(dir);val names=paths.map{File(it).name}.toSet();val hashes=m.getJSONObject("files")
        require(hashes.keys().asSequence().toSet()==names&&dir.listFiles().orEmpty().map{it.name}.toSet()==names+mf.name){"Inclua somente difusão FLUX.1, CLIP-L, T5-XXL, VAE e manifesto"}
        val tensors=paths.map{p->check(!cancelled()){"Operação cancelada"};val f=File(p);require(f.length()>0&&hashes.getString(f.name).matches(Regex("[0-9a-f]{64}"))&&ImagePackage.hash(f,cancelled)==hashes.getString(f.name)){"Componente FLUX incompleto ou corrompido"};if(f.extension=="gguf")ImageGguf.tensors(f) else SafetensorsInspector.tensorMap(f)}
        fun has(index:Int,suffix:String,shape:List<Long>)=tensors[index].any{(name,t)->name.endsWith(suffix)&&t.shape==shape}
        if(m.getString("architecture")=="anima"){
            require(paths.size==3&&has(0,"llm_adapter.blocks.0.cross_attn.q_proj.weight",listOf(1024L,1024L))&&has(0,"x_embedder.proj.1.weight",listOf(2048L,68L))&&(has(1,"model.embed_tokens.weight",listOf(151936L,1024L))||has(1,"token_embd.weight",listOf(151936L,1024L)))&&has(2,"decoder.conv_out.weight",listOf(3L,96L,3L,3L,3L))){"Requer Anima 2B, Qwen3-0.6B-Base e Qwen Image/Wan VAE compatíveis"};return m
        }
        require(paths.size==4){"Conjunto FLUX incompleto"}
        require(has(0,"img_in.weight",listOf(3072,64).map{it.toLong()})&&has(0,"txt_in.weight",listOf(3072,4096).map{it.toLong()})&&has(0,"double_blocks.0.img_attn.qkv.weight",listOf(9216,3072).map{it.toLong()})&&tensors[0].keys.any{it.contains("double_blocks.18.")}&&tensors[0].keys.any{it.contains("single_blocks.37.")}){"Modelo de difusão não corresponde ao FLUX.1 txt2img suportado"}
        require(has(1,"text_model.embeddings.token_embedding.weight",listOf(49408L,768L))&&(has(2,"shared.weight",listOf(32128L,4096L))||has(2,"encoder.embed_tokens.weight",listOf(32128L,4096L)))&&has(3,"decoder.conv_in.weight",listOf(512L,16L,3L,3L))&&has(3,"decoder.conv_out.weight",listOf(3L,128L,3L,3L))){"CLIP-L, T5-XXL ou VAE incompatível com FLUX.1"}
        val guidance=tensors[0].keys.any{it.contains("guidance_in.")};require(guidance==(m.getString("architecture")=="flux1-dev")){"FLUX dev/schnell não corresponde ao manifesto"};return m
    }
}
