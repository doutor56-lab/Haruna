package com.proxyslabs.haruna.image

import org.json.JSONObject
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.io.RandomAccessFile

class SafetensorsPackageTest {
    private val roles=mapOf(
        "model.diffusion_model.input_blocks.0.0.weight" to listOf(320,4,3,3),
        "model.diffusion_model.input_blocks.1.1.transformer_blocks.0.attn2.to_k.weight" to listOf(320,768),
        "cond_stage_model.transformer.text_model.embeddings.token_embedding.weight" to listOf(49408,768),
        "cond_stage_model.transformer.text_model.embeddings.position_embedding.weight" to listOf(77,768),
        "first_stage_model.decoder.conv_out.weight" to listOf(3,128,3,3),
        "first_stage_model.post_quant_conv.weight" to listOf(4,4,1,1))
    private fun fixture(root:File,components:Map<String,List<Int>> = roles):File {val header=JSONObject();var offset=0L;for((name,shape) in components){val bytes=shape.fold(2L){a,b->a*b};header.put(name,JSONObject().put("dtype","F16").put("shape",JSONArray(shape)).put("data_offsets",JSONArray(listOf(offset,offset+bytes))));offset+=bytes};val json=header.toString().toByteArray();return File(root,"fixture.safetensors").also{file->RandomAccessFile(file,"rw").use{f->var n=json.size.toLong();repeat(8){f.write((n and 255).toInt());n=n ushr 8};f.write(json);f.setLength(8L+json.size+offset)}}}
    private fun root()=kotlin.io.path.createTempDirectory("sf-test").toFile()
    @Test fun installsOriginalBytesAndRestoresIntegrity(){val root=root();try{val source=fixture(root);val target=File(root,"models");val dir=source.inputStream().use{SafetensorsPackage.install(it,target,{false},{Long.MAX_VALUE},{},"Checkpoint test")};val m=ImagePackage.verify(dir);assertEquals("Checkpoint test",m.getString("displayName"));assertTrue(SafetensorsInspector.inspect(File(dir,SafetensorsPackage.checkpoint)).sd15Compatible);assertEquals(ImagePackage.hash(source),ImagePackage.hash(File(dir,SafetensorsPackage.checkpoint)));File(dir,SafetensorsPackage.checkpoint).appendText("bad");try{ImagePackage.verify(dir);fail()}catch(e:Exception){}}finally{root.deleteRecursively()}}
    @Test fun rejectsSd2AndMissingVaeBeforeCopyingWeights(){val root=root();try{for(components in listOf(roles.filterKeys{!it.startsWith("first_stage_model.")},roles+mapOf("model.diffusion_model.input_blocks.1.1.transformer_blocks.0.attn2.to_k.weight" to listOf(320,1024)))){val source=fixture(root,components);val target=File(root,"models");var copied=0L;try{source.inputStream().use{SafetensorsPackage.install(it,target,{false},{Long.MAX_VALUE},{copied=it})};fail()}catch(e:IllegalArgumentException){};assertEquals(0L,copied);assertTrue(target.listFiles().orEmpty().isEmpty())}}finally{root.deleteRecursively()}}
    @Test fun cancelsAndRejectsSpaceWithoutTouchingOtherModels(){val root=root();try{val source=fixture(root);val target=File(root,"models").apply{mkdirs()};val old=File(target,"existing-user-model").apply{mkdirs()};File(old,"keep").writeText("original");for(space in listOf(1L,Long.MAX_VALUE)){var cancelled=false;try{source.inputStream().use{SafetensorsPackage.install(it,target,{cancelled},{space},{cancelled=true})};fail()}catch(e:Exception){};assertEquals("original",File(old,"keep").readText());assertEquals(listOf(old.name),target.listFiles()!!.map{it.name})}}finally{root.deleteRecursively()}}
    @Test fun rejectsTruncatedAndTrailingDataAtomically(){val root=root();try{for(delta in listOf(-1,1)){val source=fixture(root);RandomAccessFile(source,"rw").use{it.setLength(it.length()+delta)};val target=File(root,"models");try{source.inputStream().use{SafetensorsPackage.install(it,target,{false},{Long.MAX_VALUE},{})};fail()}catch(e:Exception){};assertTrue(target.listFiles().orEmpty().isEmpty())}}finally{root.deleteRecursively()}}
}
