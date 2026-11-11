// Opt-in native test with official local archives; never downloads or uses user data.
'use strict';
const {Worker}=require('node:worker_threads'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const models=require('../src/voice-models.cjs'),sherpa=require('sherpa-onnx-node');
const inputs=process.env.HARUNA_REAL_VOICE_INPUTS;
if(!inputs)throw Error('Set HARUNA_REAL_VOICE_INPUTS to a directory containing supertonic.tar.bz2 and whisper-tiny.tar.bz2.');
const root=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'haruna-real-voice-'));
function task(data,onReady){return new Promise((resolve,reject)=>{const w=new Worker(path.join(__dirname,'../src/voice-worker.cjs'),{workerData:data});const timer=setTimeout(()=>{w.terminate();reject(Error('Native test timeout'));},180000);w.on('error',reject);w.on('message',async e=>{if(e.type==='ready'){if(onReady)onReady(w);return;}if(e.type==='audio'||e.type==='result'){clearTimeout(timer);await w.terminate();resolve(e);}else if(e.type==='error'){clearTimeout(timer);await w.terminate();reject(Error('Native worker failed'));}});});}
(async()=>{const signal=new AbortController().signal;
 await models.install(root,models.tts,path.join(inputs,'supertonic.tar.bz2'),signal,()=>{});
 await models.install(root,models.catalog[0],path.join(inputs,'whisper-tiny.tar.bz2'),signal,()=>{});
 await models.verify(root,models.tts);await models.verify(root,models.catalog[0]);
 const phrase='Olá Haruna, que horas são?';const audio=await task({kind:'tts',directory:path.join(root,models.tts.id)},w=>w.postMessage({text:phrase,speaker:0,speed:1}));assert(audio.samples.length>audio.sampleRate);assert(audio.samples.some(v=>v!==0));
 const samples=new sherpa.LinearResampler(audio.sampleRate,16000).flush(audio.samples);
 await new Promise((resolve,reject)=>{const w=new Worker(path.join(__dirname,'../src/voice-worker.cjs'),{workerData:{kind:'vad',model:path.join(inputs,'silero_vad.int8.onnx')}});let speech=false;const timer=setTimeout(()=>{w.terminate();reject(Error('VAD timeout'));},20000);w.on('error',reject);w.on('message',async e=>{if(e.type==='ready'){for(let at=0;at<samples.length;at+=512){const frame=new Float32Array(512);frame.set(samples.subarray(at,at+512));w.postMessage(frame);}for(let i=0;i<32;i++)w.postMessage(new Float32Array(512));}else if(e.type==='error'){clearTimeout(timer);await w.terminate();reject(Error('VAD failed'));}else if(e.type==='vad'){speech||=e.speech;if(e.end){clearTimeout(timer);await w.terminate();speech?resolve():reject(Error('VAD no speech'));}}});});
 const result=await task({kind:'stt',directory:path.join(root,models.catalog[0].id),family:'tiny',samples});assert(result.text.trim());
 console.log(JSON.stringify({runtime:sherpa.version,platform:process.platform,realSynthesis:true,realTranscription:true,realVadEndpoint:true,input:phrase,transcription:result.text,sampleRate:audio.sampleRate,durationSeconds:audio.samples.length/audio.sampleRate,physicalMicrophoneTest:false}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>fs.rmSync(root,{recursive:true,force:true}));
