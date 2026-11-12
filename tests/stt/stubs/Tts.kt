package com.proxyslabs.haruna.speech
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
class TestAudio(val samples:FloatArray=FloatArray(16),val sampleRate:Int=24000)
interface TtsEngine:AutoCloseable{fun load(directory:File):Int;fun synthesize(text:String,speaker:Int,speed:Float):TestAudio}
class SupertonicTtsEngine:TtsEngine {
 private var loaded=false
 override fun load(directory:File):Int{if(!loaded){loaded=true;loads.incrementAndGet()};return 1}
 override fun synthesize(text:String,speaker:Int,speed:Float):TestAudio{check(loaded);return TestAudio()}
 override fun close(){if(loaded){loaded=false;releases.incrementAndGet()}}
 companion object{val loads=AtomicInteger();val releases=AtomicInteger()}
}
class TtsModelManager(context:android.content.Context){
 val directory=File("/tmp/tts-fixture");val cancelled=AtomicBoolean()
 fun installed()=true;fun bytes()=100L;fun speakers()=1;fun cleanTemporary(){};fun cancel(){};fun remove(){}
 fun install(uri:android.net.Uri?,progress:(String,Long,Long?)->Unit){}
 companion object{const val ARCHIVE_BYTES=100L}
}
class TtsAudioPlayer(context:android.content.Context,lost:()->Unit){
 fun volume(value:Float){};fun stop(){};fun pause(){};fun resume(){};fun begin(rate:Int){}
 fun write(samples:FloatArray,alive:()->Boolean,meter:(Double)->Unit){if(alive())meter(.1)}
 fun drain(alive:()->Boolean){}
}
