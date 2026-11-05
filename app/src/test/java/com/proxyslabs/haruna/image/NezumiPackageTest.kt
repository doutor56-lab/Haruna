package com.proxyslabs.haruna.image

import org.junit.Assert.*
import org.junit.Test
import org.json.JSONObject
import java.io.File
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

class NezumiPackageTest {
    private fun files():Map<String,ByteArray>{val vocab=JSONObject();repeat(49406){vocab.put("t$it",it)};vocab.put("<|startoftext|>",49406).put("<|endoftext|>",49407);val tokenizer=JSONObject().put("model",JSONObject().put("type","BPE").put("vocab",vocab).put("merges",org.json.JSONArray(List(101){"a b"})));return mapOf("clip_v2.mnn" to ByteArray(8),"unet.mnn" to ByteArray(8),"vae_decoder_fp16.mnn" to ByteArray(8),"clip_v2.mnn.weight" to byteArrayOf(1),"unet.mnn.weight" to byteArrayOf(1),"vae_decoder_fp16.mnn.weight" to byteArrayOf(1),"token_emb.bin" to ByteArray(49408*768*2),"pos_emb.bin" to ByteArray(77*768*4),"tokenizer.json" to tokenizer.toString().toByteArray())}
    private fun zip(files:Map<String,ByteArray>):ByteArray {val b=ByteArrayOutputStream();ZipOutputStream(b).use{z->files.forEach{(n,bytes)->z.putNextEntry(ZipEntry(n));z.write(bytes);z.closeEntry()}};return b.toByteArray()}
    private fun root()=kotlin.io.path.createTempDirectory("nezumi-test").toFile()
    private fun rejects(bytes:ByteArray,available:Long=Long.MAX_VALUE,cancelled:Boolean=false){val r=root();try{try{NezumiPackage.install(ByteArrayInputStream(bytes),r,{cancelled},{available},{ });fail("Must reject")}catch(e:Exception){};assertTrue(r.listFiles()!!.isEmpty())}finally{r.deleteRecursively()}}
    @Test fun atomicInstallWrappedIntegrityAndNoSession(){val r=root();try{val bytes=zip(files().mapKeys{"model/${it.key}"});var validations=0;val dir=NezumiPackage.install(ByteArrayInputStream(bytes),r,{false},{Long.MAX_VALUE},{}){validations++;true};assertEquals(1,validations);assertEquals(NezumiPackage.format,ImagePackage.verify(dir).getString("format"));assertEquals(1,r.listFiles()!!.size);File(dir,"unet.mnn").appendText("corrupt");try{ImagePackage.verify(dir);fail()}catch(e:Exception){}}finally{r.deleteRecursively()}}
    @Test fun rejectsTraversalUnknownCancelledSpaceAndBrokenZip(){rejects(zip(files()+mapOf("../bad" to byteArrayOf(1))));rejects(zip(files()+mapOf("extra.exe" to byteArrayOf(1))));rejects(zip(files()),available=1);rejects(zip(files()),cancelled=true);rejects(zip(files()).dropLast(12).toByteArray());rejects(byteArrayOf(1,2,3,4))}
    @Test fun rejectsSymlinkCentralAttribute(){val bytes=zip(files());val signature=byteArrayOf(80,75,1,2);var p=bytes.indices.first{it+4<=bytes.size&&bytes.copyOfRange(it,it+4).contentEquals(signature)};bytes[p+5]=3;bytes[p+40]=0;bytes[p+41]=0xa0.toByte();rejects(bytes)}
    @Test fun failedNativeValidationDoesNotCommit(){val r=root();try{try{NezumiPackage.install(ByteArrayInputStream(zip(files())),r,{false},{Long.MAX_VALUE},{}){false};fail()}catch(e:Exception){};assertTrue(r.listFiles()!!.isEmpty())}finally{r.deleteRecursively()}}
    @Test fun rejectsFp16PositionsAndWrongTokenizer(){rejects(zip(files()+mapOf("pos_emb.bin" to ByteArray(77*768*2))));val tokenizer="{\"model\":{\"type\":\"BPE\",\"vocab\":{},\"merges\":[]}}".toByteArray();rejects(zip(files()+mapOf("tokenizer.json" to tokenizer)))}
    @Test fun rejectsWrongArchitecture(){val c=JSONObject().put("base","sdxl").toString().toByteArray();rejects(zip(files()+mapOf("model.json" to c)))}
}
