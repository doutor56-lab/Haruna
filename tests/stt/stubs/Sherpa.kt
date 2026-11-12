package com.k2fsa.sherpa.onnx
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
class FeatureConfig(val sampleRate:Int,val featureDim:Int)
class OfflineWhisperModelConfig(val encoder:String,val decoder:String,val language:String,val task:String,val tailPaddings:Int)
class OfflineModelConfig(val whisper:OfflineWhisperModelConfig,val tokens:String,val modelType:String,val numThreads:Int,val provider:String,val debug:Boolean)
class OfflineRecognizerConfig(val featConfig:FeatureConfig,val modelConfig:OfflineModelConfig,val decodingMethod:String)
class OfflineStream {fun acceptWaveform(samples:FloatArray,rate:Int){};fun release(){streams.decrementAndGet()};companion object{val streams=AtomicInteger()} }
class OfflineRecognizer(val config:OfflineRecognizerConfig) {
 private var released=false
 init {loadEntered.countDown();check(loadGate.await(5,TimeUnit.SECONDS));if(failLoad)error("load failed");creates.incrementAndGet()}
 fun createStream():OfflineStream{check(!released);OfflineStream.streams.incrementAndGet();return OfflineStream()}
 fun decode(stream:OfflineStream){check(!released);decodeEntered.countDown();check(decodeGate.await(5,TimeUnit.SECONDS));if(failDecode)error("decode failed")}
 class Result(val text:String)
 fun getResult(stream:OfflineStream)=Result("Esta é uma transcrição local.")
 fun release(){check(!released);released=true;releases.incrementAndGet()}
 companion object {
  val creates=AtomicInteger();val releases=AtomicInteger()
  @Volatile var failLoad=false;@Volatile var failDecode=false
  @Volatile var loadGate=CountDownLatch(0);@Volatile var loadEntered=CountDownLatch(1)
  @Volatile var decodeGate=CountDownLatch(0);@Volatile var decodeEntered=CountDownLatch(1)
 }
}
