package com.proxyslabs.haruna.image

import org.json.JSONObject
import java.io.File
import java.io.InputStream
import java.io.RandomAccessFile
import java.util.UUID
import java.util.zip.CRC32
import java.util.zip.ZipFile

/** ZIP is staged once, checked before extraction, then committed by rename. No sessions here. */
object NezumiPackage {
    const val format="nezumi_sd15"
    val stagingPrefix=".install-${UUID.randomUUID()}-"
    private val clips=setOf("clip.mnn","clip_v2.mnn","clip_fp16.mnn","clip1.mnn")
    private val unets=setOf("unet.mnn","unet_asym_block32.mnn","unet_min.bin")
    private val vaes=setOf("vae_decoder.mnn","vae_decoder_fp16.mnn","vae_decoder_min.bin")
    private val knownArchives=mapOf("99e70f3fb7a33276adec354bf466bfa8b4aa8e6f4131c86a9c17cc1c1e0a1042" to "Anything V5", "3fcd7c1bbc2a452a3f52fcae8edd54f3c212836cb8f1189ce422f8e9899bfa5a" to "CyberRealistic")
    private val graphs=clips+unets+vaes+setOf("vae_encoder.mnn","vae_encoder_fp16.mnn")
    private val allowed=graphs+graphs.map{"$it.weight"}+setOf("tokenizer.json","model.json","token_emb.bin","pos_emb.bin","LICENSE","LICENSE.txt","README.md","NOTICE")
    private fun safe(name:String):Boolean= name.isNotEmpty()&&name.length<=1024&&!name.contains('\\')&&!name.contains(':')&&!name.contains('\u0000')&&!name.startsWith('/')&&name.removeSuffix("/").split('/').all{it.isNotEmpty()&&it!="."&&it!=".."}
    /** Inspect central attributes too: ZipInputStream alone cannot reject Unix symlinks. */
    private fun central(file:File):Set<String> = RandomAccessFile(file,"r").use { r ->
        fun u16():Int {val a=r.read();val b=r.read();require(a>=0&&b>=0);return a or (b shl 8)}
        fun u32():Long=u16().toLong() or (u16().toLong() shl 16)
        fun u64():Long {val lo=u32();val hi=u32();require(hi<0x80000000L);return lo or (hi shl 32)}
        var end=-1L;var p=r.length()-22;val min=maxOf(0L,r.length()-65557)
        while(p>=min){r.seek(p);if(u32()==0x06054b50L){r.seek(p+20);if(p+22+u16()==r.length()){end=p;break}};p--}
        require(end>=0){"ZIP incompleto ou corrompido"};r.seek(end+4);require(u16()==0&&u16()==0){"ZIP dividido não suportado"};val diskCount=u16();var count=u16().toLong();var size=u32();var offset=u32()
        if(count==65535L||size==0xffffffffL||offset==0xffffffffL){require(end>=20);r.seek(end-20);require(u32()==0x07064b50L&&u32()==0L);val z=u64();require(u32()==1L&&z>=0&&z<end);r.seek(z);require(u32()==0x06064b50L);u64();u16();u16();require(u32()==0L&&u32()==0L);val per=u64();count=u64();require(per==count);size=u64();offset=u64()}else require(diskCount.toLong()==count)
        require(count in 1..128&&size in 46..1048576&&offset>=0&&offset<=end-size){"Diretório ZIP inválido"}
        r.seek(offset);val seen=linkedSetOf<String>()
        repeat(count.toInt()) {require(u32()==0x02014b50L);val made=u16();u16();val flags=u16();val method=u16();require(flags and 1==0&&method in setOf(0,8)){"ZIP criptografado ou compressão incompatível"};r.skipBytes(16);val len=u16();val extra=u16();val comment=u16();require(u16()==0);u16();val attr=u32();u32();require(len in 1..1024);val bytes=ByteArray(len);r.readFully(bytes);val name=bytes.toString(Charsets.UTF_8);require(safe(name)&&seen.add(name)){"Caminho inseguro ou duplicado no ZIP"};val mode=((attr ushr 16) and 0xf000).toInt();require((made ushr 8!=3||mode in setOf(0,0x8000,0x4000))&&attr and 0x400L==0L){"Links ou arquivos especiais não são permitidos"};r.skipBytes(extra+comment);require(r.filePointer<=offset+size)}
        require(r.filePointer==offset+size);seen
    }
    fun graphFiles(dir:File):Array<String> {val config=File(dir,"model.json").takeIf{it.isFile}?.let{JSONObject(it.readText())};fun pick(key:String,names:Set<String>):String {val name=config?.optString(key)?.takeIf{it.isNotEmpty()}?:names.firstOrNull{File(dir,it).isFile}?:error("Componente SD1.5 ausente");require(name in names&&File(dir,name).isFile){"Componente SD1.5 incompatível"};return File(dir,name).absolutePath};return arrayOf(pick("clip",clips),pick("unet",unets),pick("vae_decoder",vaes))}
    private fun validate(dir:File) {
        val names=dir.listFiles().orEmpty().map{it.name}.toSet();require(names.contains("tokenizer.json")){"Tokenizer Nezumi ausente"};graphFiles(dir)
        val tokenizer=File(dir,"tokenizer.json");require(tokenizer.length() in 1..16L*1024*1024);val model=JSONObject(tokenizer.readText()).getJSONObject("model");require(model.getJSONObject("vocab").length()>1000&&model.getJSONArray("merges").length()>100){"Tokenizer incompatível"}
        require(names.containsAll(setOf("token_emb.bin","pos_emb.bin"))){"Embeddings Nezumi ausentes"}
        if("token_emb.bin" in names)require(File(dir,"token_emb.bin").length() in setOf(49408L*768*2,49408L*768*4)&&File(dir,"pos_emb.bin").length() in setOf(77L*768*2,77L*768*4)){"Embeddings SD1.5 incompatíveis"}
        if("model.json" in names){val f=File(dir,"model.json");require(f.length() in 1..4095);val c=JSONObject(f.readText());require(c.optString("base","sd1.5") in setOf("sd1.5","sd15")&&!c.has("clip2")&&!c.has("tokenizer2")&&c.optInt("text_embedding_size",768)==768&&c.optInt("default_size",512)==512&&c.optInt("clip_skip",1) in 1..12){"Somente Nezumi SD1.5 é suportado"};for(k in listOf("clip","unet","vae_decoder","vae_encoder","tokenizer","token_embedding","position_embedding")){if(c.has(k)){val n=c.getString(k);require(n in allowed&&File(dir,n).isFile){"Referência de componente inválida"}}};require(!c.has("clip1")&&!c.has("tokenizer1")){"Configuração não suportada"}}
        for(g in graphFiles(dir)){val f=File(g);require(f.length()>=8){"Grafo incompleto"};require(File(g+".weight").isFile&&File(g+".weight").length()>0){"Pesos externos Nezumi ausentes"}}
    }
    fun verify(dir:File,cancelled:()->Boolean={false}):JSONObject {
        val mf=File(dir,"haruna-image-model.json");require(mf.length() in 1..65536);val m=JSONObject(mf.readText());require(m.getInt("version")==1&&m.getString("engine")=="mnn"&&m.getString("architecture")=="sd15"&&m.getString("format")==format);val files=m.getJSONObject("files");require(files.length() in 4..32&&files.keys().asSequence().all{it in allowed})
        for(n in files.keys()){val f=File(dir,n);require(f.isFile&&f.length()>0&&files.getString(n).matches(Regex("[0-9a-f]{64}"))&&ImagePackage.hash(f,cancelled)==files.getString(n)){"Modelo incompleto ou corrompido"}}
        require(dir.listFiles().orEmpty().all{it.name==mf.name||files.has(it.name)});validate(dir);return m
    }
    fun install(input:InputStream,root:File,cancelled:()->Boolean,available:()->Long,progress:(Long)->Unit,validateGraphs:(File)->Boolean={true}):File {
        root.mkdirs();val zipFile=File(root,stagingPrefix+UUID.randomUUID()+".zip");val temp=File(root,stagingPrefix+UUID.randomUUID()).apply{mkdirs()};var total=0L
        fun guard(n:Int){check(!cancelled()){"Instalação cancelada"};require(available()>n+128L*1024*1024){"Espaço insuficiente para instalar o modelo"}}
        try {
            java.io.DataInputStream(input.buffered()).use{source->zipFile.outputStream().use{out->guard(4);val header=ByteArray(4);source.readFully(header);require(header.contentEquals(byteArrayOf(80,75,3,4))){"Selecione um ZIP compatível"};out.write(header);total=4;val b=ByteArray(65536);while(true){guard(0);val n=source.read(b);if(n<0)break;total+=n;require(total<=ImagePackage.maxBytes){"Pacote excede 8 GiB"};guard(n);out.write(b,0,n);progress(total)}}}
            val archiveHash=ImagePackage.hash(zipFile,cancelled);val names=central(zipFile);ZipFile(zipFile).use{zip->val entries=zip.entries().asSequence().toList();require(entries.map{it.name}.toSet()==names);val files=entries.filter{!it.isDirectory};val parents=files.map{it.name.substringBeforeLast('/',"")}.toSet();require(parents.size==1){"Componentes devem estar juntos na raiz ou em uma pasta"};val prefix=parents.first().let{if(it.isEmpty())"" else "$it/"}
                if(files.any{it.name==prefix+"haruna-image-model.json"}){require(prefix.isEmpty()){"Pacote Haruna deve estar na raiz"};zipFile.inputStream().use{source->return ImagePackage.install(source,root,cancelled,available,progress)}}
                val flat=files.map{it.name.removePrefix(prefix)};require(flat.toSet().size==flat.size&&flat.all{it in allowed}){"Componente de imagem não permitido"};total=0
                for(entry in files){val name=entry.name.removePrefix(prefix);val crc=CRC32();var bytes=0L;zip.getInputStream(entry).use{source->File(temp,name).outputStream().use{out->val b=ByteArray(65536);while(true){guard(0);val n=source.read(b);if(n<0)break;bytes+=n;total+=n;require(total<=ImagePackage.maxBytes){"Pacote excede 8 GiB"};if(name.endsWith(".json"))require(bytes<=if(name=="model.json")4095 else 16L*1024*1024){"JSON de modelo inválido"};guard(n);crc.update(b,0,n);out.write(b,0,n);progress(total)}}};require(bytes==entry.size&&crc.value==entry.crc){"Pacote incompleto ou corrompido"}}
            }
            validate(temp);require(validateGraphs(temp)){"Grafo MNN inválido ou incompatível"};val hashes=JSONObject();temp.listFiles().orEmpty().forEach{hashes.put(it.name,ImagePackage.hash(it,cancelled))};val m=JSONObject().put("version",1).put("engine","mnn").put("architecture","sd15").put("format",format).put("displayName",knownArchives[archiveHash]?:"SD1.5 Nezumi").put("archiveSha256",archiveHash).put("files",hashes);File(temp,"haruna-image-model.json").writeText(m.toString());guard(0);val target=File(root,UUID.randomUUID().toString());check(temp.renameTo(target)){"Não foi possível concluir a instalação"};return target
        }finally{zipFile.delete();temp.deleteRecursively()}
    }
}
