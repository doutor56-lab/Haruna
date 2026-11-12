package com.proxyslabs.haruna.speech
import android.app.ActivityManager
import android.content.Context
import com.k2fsa.sherpa.onnx.OfflineRecognizer as R
import com.k2fsa.sherpa.onnx.OfflineStream
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.CopyOnWriteArrayList
import org.json.JSONObject
fun awaitValue(test:()->Boolean){val until=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);while(!test()){check(System.nanoTime()<until){"Timed out"};Thread.sleep(2)}}
fun main(){
 val events=CopyOnWriteArrayList<JSONObject>();val context=Context();val manager=SttManager(context){events.add(it)}
 fun start(id:String){SttAudioRecorder.recording=CountDownLatch(1);manager.start("dictation",id);check(SttAudioRecorder.recording.await(2,TimeUnit.SECONDS))}
 fun finish(){manager.finish();awaitValue{!manager.status().getBoolean("busy")}}
 R.loadGate=CountDownLatch(1);R.loadEntered=CountDownLatch(1)
 start("a");check(R.loadEntered.await(2,TimeUnit.SECONDS));check(manager.status().getString("state")=="listening") // capture overlaps a blocked load
 R.loadGate.countDown();finish();awaitValue{manager.status().getBoolean("loaded")};check(R.creates.get()==1)
 start("b");finish();check(R.creates.get()==1);check(manager.status().getJSONObject("diagnostics").getBoolean("sessionReused"))
 manager.stop();awaitValue{manager.status().getBoolean("loaded")};start("idle-stop");finish();check(R.creates.get()==1)
 check(events.count{it.optString("state")=="result"&&it.has("text")}==3);check(OfflineStream.streams.get()==0)
 // Pressure evicts idle sessions; selection invalidates before switching files.
 manager.onLowMemory();awaitValue{!manager.status().getBoolean("loaded")};check(R.releases.get()==1)
 start("c");finish();check(R.creates.get()==2)
 manager.select("whisper-base-int8");awaitValue{manager.status().getString("selectedId")=="whisper-base-int8"};check(!manager.status().getBoolean("loaded"))
 start("d");finish();check(R.creates.get()==3)
 // The large model must be released after each utterance.
 manager.select("whisper-small-int8");awaitValue{manager.status().getString("selectedId")=="whisper-small-int8"}
 start("large");finish();awaitValue{!manager.status().getBoolean("loaded")}
 manager.select("whisper-tiny-int8");awaitValue{manager.status().getString("selectedId")=="whisper-tiny-int8"}
 // Cancel a native operation that cannot abort in sherpa: discard text and defer release safely.
 R.decodeGate=CountDownLatch(1);R.decodeEntered=CountDownLatch(1);start("cancel");manager.finish();check(R.decodeEntered.await(2,TimeUnit.SECONDS));manager.stop();R.decodeGate.countDown();awaitValue{!manager.status().getBoolean("busy")};awaitValue{!manager.status().getBoolean("loaded")}
 check(events.none{it.optString("requestId")=="cancel"&&it.has("text")});check(OfflineStream.streams.get()==0)
 R.failDecode=true;start("error");finish();awaitValue{!manager.status().getBoolean("loaded")};check(events.any{it.optString("requestId")=="error"&&it.optString("state")=="error"});R.failDecode=false
 R.failLoad=true;start("load-error");finish();awaitValue{!manager.status().getBoolean("loaded")};check(events.any{it.optString("requestId")=="load-error"&&it.optString("state")=="error"});R.failLoad=false
 ActivityManager.available=700L*1024*1024;start("low");finish();awaitValue{!manager.status().getBoolean("loaded")};ActivityManager.available=3L*1024*1024*1024
 start("resource-switch");finish();val priorReleases=R.releases.get();IdleSpeechSessions.releaseIdle();awaitValue{!manager.status().getBoolean("loaded")};check(R.releases.get()==priorReleases+1)
 manager.close();awaitValue{R.releases.get()==R.creates.get()};check(context.callbacks.isEmpty());check(OfflineStream.streams.get()==0)
 R.loadGate=CountDownLatch(1);R.loadEntered=CountDownLatch(1);SttAudioRecorder.recording=CountDownLatch(1)
 val priorLoads=R.creates.get()
 val secondContext=Context();val second=SttManager(secondContext){};second.start("dictation","closing");check(R.loadEntered.await(2,TimeUnit.SECONDS));second.close();R.loadGate.countDown();awaitValue{R.creates.get()==priorLoads+1&&R.releases.get()==R.creates.get()};check(secondContext.callbacks.isEmpty())
 ActivityManager.available=3L*1024*1024*1024
 val tts=TtsManager(Context()){}
 fun read(){tts.speak("Um texto curto para leitura local.","read");awaitValue{tts.status().getString("state")=="idle"}}
 fun listen(warm:Boolean){val ready=CountDownLatch(1);tts.prepareForListening(warm){ready.countDown()};check(ready.await(2,TimeUnit.SECONDS))}
 read();check(SupertonicTtsEngine.loads.get()==1);listen(true);check(SupertonicTtsEngine.releases.get()==0)
 read();check(SupertonicTtsEngine.loads.get()==1);listen(false);check(SupertonicTtsEngine.releases.get()==1)
 read();check(SupertonicTtsEngine.loads.get()==2);ActivityManager.available=1024L*1024*1024;listen(true);check(SupertonicTtsEngine.releases.get()==2)
 ActivityManager.available=3L*1024*1024*1024;read();IdleSpeechSessions.releaseIdle();check(SupertonicTtsEngine.loads.get()==SupertonicTtsEngine.releases.get())
 tts.close();IdleSpeechSessions.releaseIdle();ActivityManager.available=3L*1024*1024*1024
 val n=TtsTextNormalizer();val input="Esta primeira frase deve sair cedo. "+"Outra frase com palavras completas e emoji 🌸. ".repeat(12)
 val chunks=n.chunks(input);check(chunks.first().length<=120);check(chunks.drop(1).all{it.length<=240});check(chunks.joinToString(" ")==input.trim());check(chunks.none{it.last().isHighSurrogate()||it.first().isLowSurrogate()})
 println("PASS production STT manager/ONNX session: overlap, reuse, pressure, switch, large-model release, stale cancel, errors, cleanup; TTS first chunk/content (fake audio/inference; not device speed)")
}
