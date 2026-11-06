package com.proxyslabs.haruna.image

import org.json.JSONObject
import java.io.File
import java.io.InputStream
import java.util.UUID

/** Installs the original bytes, with a local digest; no conversion or inference. */
object SafetensorsPackage {
    const val format="safetensors_sd15"
    const val sdxlFormat="safetensors_sdxl"
    const val checkpoint="model.safetensors"
    fun verify(dir:File,cancelled:()->Boolean={false}):JSONObject {
        check(!cancelled()){ "Operação cancelada" };val mf=File(dir,"haruna-image-model.json");require(mf.length() in 1..65536){"Manifesto inválido"};val m=JSONObject(mf.readText())
        require(m.getInt("version")==1&&m.getString("engine")=="stable-diffusion.cpp"&&m.getString("architecture") in setOf("sd15","sdxl")&&m.getString("format") in setOf(format,sdxlFormat)){"Modelo incompatível"}
        require(m.getString("format")==if(m.getString("architecture")=="sdxl")sdxlFormat else format){"Formato e arquitetura incompatíveis"}
        require(dir.listFiles().orEmpty().map{it.name}.toSet()==setOf(mf.name,checkpoint)){"Pacote de checkpoint inválido"}
        val file=File(dir,checkpoint);val sha=m.getJSONObject("files").also{require(it.length()==1)}.getString(checkpoint)
        require(sha.matches(Regex("[0-9a-f]{64}"))&&file.isFile&&ImagePackage.hash(file,cancelled)==sha){"Checkpoint incompleto ou corrompido"}
        val info=SafetensorsInspector.inspect(file);require(if(m.getString("architecture")=="sdxl")info.sdxlCompatible else info.sd15Compatible){"Requer checkpoint SD1.5 ou SDXL completo com CLIP, UNet e VAE"};return m
    }
    fun install(input:InputStream,root:File,cancelled:()->Boolean,available:()->Long,progress:(Long)->Unit,displayName:String="SD1.5 safetensors"):File {
        root.mkdirs();check(!cancelled()){ "Instalação cancelada" }
        // Inspect header/components before committing disk space to gigabytes of weights.
        val header=SafetensorsInspector.readHeader(input)
        require(header.result.sd15Compatible||header.result.sdxlCompatible){"Requer checkpoint SD1.5 ou SDXL completo (.safetensors), com CLIP, UNet e VAE; SD2, LoRA e componentes separados não são suportados"}
        require(available()>header.result.fileBytes+128L*1024*1024){"Espaço insuficiente para instalar o checkpoint"}
        val temp=File(root,NezumiPackage.stagingPrefix+UUID.randomUUID()).apply{check(mkdirs())};var total=0L
        try {
            val file=File(temp,checkpoint);val md=java.security.MessageDigest.getInstance("SHA-256")
            file.outputStream().use{out->for(bytes in listOf(header.prefix,header.json)){check(!cancelled()){ "Instalação cancelada" };out.write(bytes);md.update(bytes);total+=bytes.size};progress(total)
                val bytes=ByteArray(65536);while(total<header.result.fileBytes){check(!cancelled()){ "Instalação cancelada" };require(available()>128L*1024*1024+bytes.size){"Espaço insuficiente para instalar o checkpoint"};val n=input.read(bytes,0,minOf(bytes.size.toLong(),header.result.fileBytes-total).toInt());require(n>0){"Checkpoint incompleto ou corrompido"};out.write(bytes,0,n);md.update(bytes,0,n);total+=n;progress(total)}
                require(input.read()==-1){"Dados extras no checkpoint"}
            }
            check(!cancelled()){ "Instalação cancelada" };val sha=md.digest().joinToString(""){"%02x".format(it)}
            val m=JSONObject().put("version",1).put("engine","stable-diffusion.cpp").put("architecture",if(header.result.sdxlCompatible)"sdxl" else "sd15").put("format",if(header.result.sdxlCompatible)sdxlFormat else format).put("displayName",displayName.map{if(it.isISOControl()) ' ' else it}.joinToString("").trim().take(64).ifEmpty{"SD1.5 safetensors"}).put("files",JSONObject().put(checkpoint,sha)).put("bytes",total)
            File(temp,"haruna-image-model.json").writeText(m.toString());val target=File(root,UUID.randomUUID().toString());check(temp.renameTo(target)){"Não foi possível concluir a instalação"};return target
        }catch(e:Throwable){temp.deleteRecursively();throw e}
    }
}
