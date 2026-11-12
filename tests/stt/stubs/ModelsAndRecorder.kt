package com.proxyslabs.haruna.speech
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import org.json.JSONArray
class SttModelManager(context:android.content.Context) {
 val cancelled=AtomicBoolean()
 fun selected()=selection
 val directory get()=File("/tmp/stt-fixture/"+selection.id)
 fun installed(model:WhisperModels.Model=selection)=true
 fun bytes()=100L
 fun list()=JSONArray()
 fun cancel(){}
 fun cleanTemporary(){}
 fun install(uri:android.net.Uri?,progress:(String,Long,Long?)->Unit,id:String){selection=WhisperModels.byId(id)}
 fun select(id:String){selection=WhisperModels.byId(id)}
 fun remove(id:String){}
 companion object {@Volatile var selection=WhisperModels.onnx.first()}
}
class SttAudioRecorder(context:android.content.Context) {
 @Volatile private var done=CountDownLatch(1)
 fun prepare(){done=CountDownLatch(1)}
 fun finish(){done.countDown()}
 fun cancel()=finish()
 fun capture(alive:()->Boolean,started:()->Unit,level:(Double)->Unit,automaticPause:Boolean):FloatArray {
  started();recording.countDown();check(done.await(5,TimeUnit.SECONDS));return if(alive())FloatArray(1600){.1f}else FloatArray(0)
 }
 companion object{const val RATE=16000;@Volatile var recording=CountDownLatch(1)}
}
