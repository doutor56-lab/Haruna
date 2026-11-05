package com.proxyslabs.haruna.image

import org.json.JSONObject
import java.io.File
import java.io.InputStream
import java.security.MessageDigest
import java.util.UUID
import java.util.zip.ZipInputStream

/** Installation never opens an inference session. Each committed directory is self contained. */
object ImagePackage {
    val required=setOf("text_encoder.mnn","unet.mnn","vae_decoder.mnn","tokenizer.mtok")
    private val allowed=required+setOf("text_encoder.mnn.weight","unet.mnn.weight","vae_decoder.mnn.weight","haruna-image-model.json")
    const val maxBytes=8L*1024*1024*1024
    fun hash(file:File):String {val md=MessageDigest.getInstance("SHA-256");file.inputStream().use{input->val b=ByteArray(65536);while(true){val n=input.read(b);if(n<0)break;md.update(b,0,n)}};return md.digest().joinToString(""){"%02x".format(it)}}
    fun verify(dir:File):JSONObject {
        val mf=File(dir,"haruna-image-model.json");require(mf.isFile&&mf.length()<=65536){"Manifesto de modelo ausente ou inválido"}
        val m=JSONObject(mf.readText());require(m.getInt("version")==1&&m.getString("architecture")=="sd15"&&m.getString("engine")=="mnn"){"Pacote incompatível: requer SD1.5 MNN"}
        val files=m.getJSONObject("files");require(required.all{files.has(it)}){"Componentes SD1.5 ausentes"}
        require(files.length()<=7&&files.keys().asSequence().all{it in allowed&&it!="haruna-image-model.json"}){"Componente não permitido"}
        for(name in files.keys()) {val file=File(dir,name);val h=files.getString(name);require(h.matches(Regex("[0-9a-f]{64}"))&&file.isFile&&file.length()>0&&hash(file)==h){"Modelo incompleto ou corrompido"}}
        require(dir.listFiles()!!.all{it.name=="haruna-image-model.json"||files.has(it.name)}){"Arquivo sem integridade declarada"}
        return m
    }
    fun install(input:InputStream, root:File, cancelled:()->Boolean, available:()->Long, progress:(Long)->Unit):File {
        root.mkdirs();val temp=File(root,".install-"+UUID.randomUUID()).apply{mkdirs()};var total=0L;val seen=mutableSetOf<String>()
        try {
            ZipInputStream(input.buffered()).use{zip->while(true){check(!cancelled()){"Instalação cancelada"};val entry=zip.nextEntry?:break
                val name=entry.name;require(!entry.isDirectory&&name in allowed&&seen.add(name)){"Pacote inválido: arquivos devem estar na raiz, sem caminhos ou duplicatas"}
                require(seen.size<=8){"Pacote inválido"};File(temp,name).outputStream().use{out->val buffer=ByteArray(65536);while(true){check(!cancelled()){"Instalação cancelada"};val n=zip.read(buffer);if(n<0)break;total+=n;require(total<=maxBytes){"Pacote excede o limite de 8 GiB"};require(available()>n+128L*1024*1024){"Espaço insuficiente para instalar o modelo"};if(name=="haruna-image-model.json")require(out.channel.position()+n<=65536){"Manifesto inválido"};out.write(buffer,0,n);progress(total)}}
            }}
            verify(temp);check(!cancelled()){"Instalação cancelada"};val target=File(root,UUID.randomUUID().toString());check(temp.renameTo(target)){"Não foi possível concluir a instalação"};return target
        }catch(e:Throwable){temp.deleteRecursively();throw e}
    }
}
