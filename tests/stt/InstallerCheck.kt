package com.proxyslabs.haruna.speech

import android.content.Context
import android.net.Uri
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLConnection
import java.net.URLStreamHandler
import java.security.MessageDigest
import java.util.concurrent.CancellationException
import org.apache.commons.compress.archivers.tar.TarArchiveEntry
import org.apache.commons.compress.archivers.tar.TarArchiveOutputStream
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorOutputStream
import org.json.JSONObject

fun sha(file: File): String = file.inputStream().use { source ->
    val digest=MessageDigest.getInstance("SHA-256");val buffer=ByteArray(128*1024)
    while(true){val n=source.read(buffer);if(n<0)break;digest.update(buffer,0,n)}
    digest.digest().joinToString(""){"%02x".format(it)}
}
fun main(args:Array<String>){
    require(args.size==1){"Pass the official sherpa-onnx-whisper-tiny.tar.bz2; no model is downloaded by this test"}
    val archive=File(args[0]);check(sha(archive)==SttModelManager.SHA256)
    URL.setURLStreamHandlerFactory { scheme -> if(scheme!="https")null else object:URLStreamHandler(){
        override fun openConnection(url:URL):URLConnection {
            check(url.toString()==SttModelManager.URL_OFFICIAL)
            return object:HttpURLConnection(url){override fun connect(){};override fun disconnect(){};override fun usingProxy()=false
                override fun getResponseCode()=200;override fun getInputStream()=archive.inputStream();override fun getContentLengthLong()=archive.length()
            }
        }
    } }
    val root=java.nio.file.Files.createTempDirectory("haruna-stt-installer-").toFile()
    val context=Context(root);val manager=SttModelManager(context)
    fun assertClean(){check(!File(root,"stt/.whisper-stage").exists());check(!File(root,"stt/.whisper.tar.bz2.part").exists())}
    fun digestInstalled()=WhisperModels.onnx.first().files.associateWith{sha(File(manager.directory,it))}
    try {
        // Real official bytes through the actual download branch; the connection alone is substituted.
        val phases=mutableListOf<String>();val counts=mutableListOf<Long>()
        manager.install(null,{phase,count,total->
            phases.add(phase);if(phase=="extracting"){check(total==archive.length());check(count in 0..total);counts.add(count)}
        })
        check(manager.installed());check(manager.selected().id=="whisper-tiny-int8");check(manager.bytes()==103609903L)
        check(counts.distinct().size>5&&counts.zipWithNext().all{(a,b)->b>=a});check(phases.last()=="installed")
        val manifest=JSONObject(File(manager.directory,"installed.json").readText());val original=digestInstalled()
        check(original.all{(name,hash)->manifest.getJSONObject("hashes").getString(name)==hash})
        val restored=SttModelManager(context);check(restored.installed()&&restored.selected().id==manager.selected().id);assertClean()
        // Cancel while TAR automatically skips the unused FP32 encoder. Existing installation survives.
        var cancelled=false
        try { manager.install(Uri(archive),{phase,count,_->if(phase=="extracting"&&count>=512*1024)manager.cancel()}) }
        catch(failure:Exception){check(manager.cancelled.get());check(failure is CancellationException||failure is java.io.IOException);cancelled=true}
        check(cancelled&&manager.installed()&&digestInstalled()==original);assertClean();manager.cancelled.set(false)
        // A dangerous trailing entry is still checked, even after all required components are present.
        val bad=File(root,"unsafe.tar.bz2")
        BZip2CompressorOutputStream(bad.outputStream()).use{bz->TarArchiveOutputStream(bz).use{tar->
            for((name,body) in listOf("tiny-encoder.int8.onnx" to byteArrayOf(1),"tiny-decoder.int8.onnx" to byteArrayOf(2),"tiny-tokens.txt" to "<|pt|> 1\n<|startoftranscript|> 2\n".toByteArray(),"../escape" to byteArrayOf(3))){
                val entry=TarArchiveEntry(name);entry.size=body.size.toLong();tar.putArchiveEntry(entry);tar.write(body);tar.closeArchiveEntry()
            }
        }}
        check(runCatching{manager.install(Uri(bad),{_,_,_->})}.isFailure);check(!File(root,"escape").exists());check(digestInstalled()==original);assertClean()
        println("PASS official Tiny download/install/select/restore (real 103 MB of components); hashes, live extraction progress, cancellation during ignored entries, traversal rejection and preservation. No inference/device performance test.")
    }finally{root.deleteRecursively()}
}
