package com.proxyslabs.haruna.image
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.nio.file.Files
import java.util.zip.ZipOutputStream
import java.util.zip.ZipEntry
class ImagePackageTest {
 private fun zip(files:Map<String,ByteArray>):ByteArray {val b=ByteArrayOutputStream();ZipOutputStream(b).use{z->files.forEach{(n,v)->z.putNextEntry(ZipEntry(n));z.write(v);z.closeEntry()}};return b.toByteArray()}
 private fun fixture():Map<String,ByteArray> {val root=Files.createTempDirectory("fixture").toFile();try{val values=ImagePackage.required.associateWith{"component bytes, NOT a real MNN model".toByteArray()}.toMutableMap();val hashes=JSONObject();values.forEach{(n,b)->val f=java.io.File(root,n);f.writeBytes(b);hashes.put(n,ImagePackage.hash(f))};values["haruna-image-model.json"]=JSONObject().put("version",1).put("engine","mnn").put("architecture","sd15").put("files",hashes).toString().toByteArray();return values}finally{root.deleteRecursively()}}
 @Test fun installRestoreAndRejectUnsafePackages(){val root=Files.createTempDirectory("images").toFile();try{
 val files=fixture();var progress=0L;val dir=ImagePackage.install(zip(files).inputStream(),root,{false},{Long.MAX_VALUE}){progress=it};assertTrue(progress>0);assertEquals("sd15",ImagePackage.verify(dir).getString("architecture"));assertTrue(dir.exists())
 assertEquals("mnn",ImagePackage.verify(java.io.File(root,dir.name)).getString("engine"))
 val bad=files.toMutableMap();bad["../outside"]=byteArrayOf(1);expectFailure{ImagePackage.install(zip(bad).inputStream(),root,{false},{Long.MAX_VALUE}){}}
 expectFailure{ImagePackage.install(zip(files).inputStream(),root,{false},{0}){}}
 expectFailure{ImagePackage.install(zip(files).inputStream(),root,{true},{Long.MAX_VALUE}){}}
 expectFailure{ImagePackage.install("safetensors or arbitrary file".byteInputStream(),root,{false},{Long.MAX_VALUE}){}}
 expectFailure{ImagePackage.install(zip(files-"unet.mnn").inputStream(),root,{false},{Long.MAX_VALUE}){}}
 java.io.File(dir,"unet.mnn").appendText("corrupted");expectFailure{ImagePackage.verify(dir)}
 assertEquals(1,root.listFiles()!!.size);assertFalse(java.io.File(root.parentFile,"outside").exists());assertTrue(dir.deleteRecursively());assertEquals(0,root.listFiles()!!.size)
 }finally{root.deleteRecursively()}}
 private fun expectFailure(action:()->Unit){try{action();fail("Expected rejection")}catch(e:Exception){assertNotNull(e.message)}}
}
