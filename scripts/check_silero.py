"""Compile the actual recorder with deterministic Android/VAD doubles. No microphone/inference claim."""
import os, re, subprocess, tempfile
from pathlib import Path

root=Path(__file__).resolve().parents[1]
if os.environ.get('HARUNA_KOTLIN_TOOLS'):
    jars=list(Path(os.environ['HARUNA_KOTLIN_TOOLS']).glob('*.jar'))
else:
    cache=Path.home()/'.gradle/caches/modules-2/files-2.1'
    artifacts=[('org.jetbrains.kotlin',name) for name in ['kotlin-compiler-embeddable','kotlin-stdlib','kotlin-script-runtime','kotlin-reflect','kotlin-daemon-embeddable']]
    artifacts += [('org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm'),('org.jetbrains.intellij.deps','trove4j'),('org.jetbrains','annotations')]
    jars=[]
    for group,name in artifacts:
        candidates=list((cache/group/name).glob('*/*/*.jar'))
        if candidates:jars.append(max(candidates,key=lambda p:tuple(map(int,re.findall(r'\d+',p.parents[1].name)))))
if not any(p.name.startswith('kotlin-compiler-embeddable') for p in jars):
    raise SystemExit('Run Gradle compileDebugKotlin first or set HARUNA_KOTLIN_TOOLS to existing compiler jars.')
cp=os.pathsep.join(map(str,jars));stdlib=[p for p in jars if p.name.startswith(('kotlin-stdlib-','annotations-'))]
sources={
 'Context.kt':'''package android.content
class Context {val assets=android.content.res.AssetManager()}
''',
 'Assets.kt':'''package android.content.res
class AssetManager
''',
 'Clock.kt':'''package android.os
object SystemClock {private var value=1000L;fun elapsedRealtime():Long{value+=200;return value}}
''',
 'Media.kt':'''package android.media
object AudioFormat {const val CHANNEL_IN_MONO=1;const val ENCODING_PCM_16BIT=2;class Builder {fun setSampleRate(x:Int)=this;fun setChannelMask(x:Int)=this;fun setEncoding(x:Int)=this;fun build()=AudioFormat}}
object MediaRecorder {object AudioSource {const val VOICE_RECOGNITION=1}}
class AudioRecord {
 companion object {const val STATE_INITIALIZED=1;const val RECORDSTATE_RECORDING=3;const val READ_BLOCKING=0;var releases=0;var reads=0;var failStart=false;var failRead=false;fun getMinBufferSize(rate:Int,channel:Int,encoding:Int)=4096;fun reset(){releases=0;reads=0;failStart=false;failRead=false}}
 val state=STATE_INITIALIZED;val sampleRate=16000;val channelCount=1;val audioFormat=AudioFormat.ENCODING_PCM_16BIT;var recordingState=0
 fun startRecording(){check(!failStart);recordingState=RECORDSTATE_RECORDING};fun stop(){recordingState=0};fun release(){releases++}
 fun read(frame:ShortArray,start:Int,count:Int,mode:Int):Int{reads++;if(failRead)return -3;for(i in 0 until count)frame[i]=8192;return count}
 class Builder {fun setAudioSource(x:Int)=this;fun setAudioFormat(x:Any)=this;fun setBufferSizeInBytes(x:Int)=this;fun build()=AudioRecord()}
}
''',
 'Vad.kt':'''package com.k2fsa.sherpa.onnx
import android.content.res.AssetManager
class SileroVadModelConfig(val model:String,val threshold:Float,val minSilenceDuration:Float,val minSpeechDuration:Float,val windowSize:Int,val maxSpeechDuration:Float)
class VadModelConfig(val sileroVadModelConfig:SileroVadModelConfig,val sampleRate:Int,val numThreads:Int,val provider:String,val debug:Boolean)
class SpeechSegment(val samples:FloatArray)
class Vad(assetManager:AssetManager?,val config:VadModelConfig){
 companion object {var failCreate=false;var releases=0;var speech=true;var segmentAt=2;var flushSegment=true;fun reset(){failCreate=false;releases=0;speech=true;segmentAt=2;flushSegment=true}}
 var frames=0;var queued=false
 init {check(!failCreate);check(config.sampleRate==16000&&config.sileroVadModelConfig.windowSize==512&&config.sileroVadModelConfig.model=="silero_vad.int8.onnx")}
 fun acceptWaveform(samples:FloatArray){check(samples.isNotEmpty()&&samples.all{it==.25f});frames++;if(speech&&frames==segmentAt)queued=true}
 fun isSpeechDetected()=speech&&frames>0;fun empty()=!queued;fun front()=SpeechSegment(FloatArray(640){.5f});fun pop(){queued=false};fun flush(){if(flushSegment&&speech&&frames>0)queued=true};fun release(){releases++}
}
''',
 'Diagnostics.kt':'''package com.proxyslabs.haruna.speech
object SttDiagnostics {fun captureRate(rate:Int){check(rate==16000)}}
''',
 'Check.kt':'''import android.content.Context
import android.media.AudioRecord
import com.k2fsa.sherpa.onnx.Vad
import com.proxyslabs.haruna.speech.SttAudioRecorder
fun reset(){AudioRecord.reset();Vad.reset()}
fun main(){
 reset();var recorder=SttAudioRecorder(Context());var got=recorder.capture({true},{},{ });check(got.size==640&&got.all{it==.5f});check(AudioRecord.reads==2&&AudioRecord.releases==1&&Vad.releases==1)
 reset();Vad.failCreate=true;recorder=SttAudioRecorder(Context());check(runCatching{recorder.capture({true},{},{ })}.isFailure);check(AudioRecord.releases==1&&Vad.releases==0)
 reset();AudioRecord.failStart=true;recorder=SttAudioRecorder(Context());check(runCatching{recorder.capture({true},{},{ })}.isFailure);check(AudioRecord.releases==1&&Vad.releases==1)
 reset();AudioRecord.failRead=true;recorder=SttAudioRecorder(Context());check(runCatching{recorder.capture({true},{},{ })}.isFailure);check(AudioRecord.releases==1&&Vad.releases==1)
 reset();Vad.segmentAt=Int.MAX_VALUE;recorder=SttAudioRecorder(Context());got=recorder.capture({true},{},{recorder.finish()});check(got.size==640&&AudioRecord.reads==1&&Vad.releases==1&&AudioRecord.releases==1)
 reset();recorder=SttAudioRecorder(Context());got=recorder.capture({true},{},{if(AudioRecord.reads==3)recorder.finish()},false);check(got.size==1536&&got.all{it==.25f}&&AudioRecord.reads==3)
 reset();var alive=true;recorder=SttAudioRecorder(Context());got=recorder.capture({alive},{},{alive=false;recorder.cancel()});check(got.isEmpty()&&Vad.releases==1&&AudioRecord.releases==1)
 reset();Vad.speech=false;recorder=SttAudioRecorder(Context());got=recorder.capture({true},{},{ });check(got.isEmpty()&&AudioRecord.reads in 312..313&&Vad.releases==1&&AudioRecord.releases==1)
 println("PASS actual recorder: VAD segment, constructor/start/read failure cleanup, manual flush, automatic pause OFF, cancellation and bounded no-speech. Android/VAD DOUBLES ONLY; no physical microphone or neural inference.")
}
'''}
with tempfile.TemporaryDirectory(prefix='haruna-silero-') as folder:
    tmp=Path(folder)
    for name,text in sources.items():(tmp/name).write_text(text)
    inputs=[str(root/'app/src/main/java/com/proxyslabs/haruna/speech/SttAudioRecorder.kt'),*map(str,tmp.glob('*.kt'))]
    out=tmp/'classes';command=['java','-cp',cp,'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler','-no-stdlib','-no-reflect','-jvm-target','17','-nowarn','-classpath',os.pathsep.join(map(str,stdlib)),'-d',str(out),*inputs]
    subprocess.run(command,check=True)
    subprocess.run(['java','-cp',str(out)+os.pathsep+os.pathsep.join(map(str,stdlib)),'CheckKt'],check=True)
