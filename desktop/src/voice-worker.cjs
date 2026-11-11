'use strict';
// Each worker owns its native handles. Termination releases ONNX sessions and PCM.
const {parentPort,workerData}=require('node:worker_threads');
const path=require('node:path');
const sherpa=require('sherpa-onnx-node');
const send=(type,value={})=>parentPort.postMessage({type,...value});
const file=name=>path.join(workerData.directory,name);
try {
 if(workerData.kind==='stt'){
  const family=workerData.family;
  const recognizer=new sherpa.OfflineRecognizer({featConfig:{sampleRate:16000,featureDim:80},modelConfig:{whisper:{encoder:file(`${family}-encoder.int8.onnx`),decoder:file(`${family}-decoder.int8.onnx`),language:'pt',task:'transcribe',tailPaddings:300},tokens:file(`${family}-tokens.txt`),modelType:'whisper',numThreads:2,provider:'cpu',debug:false},decodingMethod:'greedy_search'});
  const stream=recognizer.createStream();stream.acceptWaveform({sampleRate:16000,samples:new Float32Array(workerData.samples)});recognizer.decode(stream);
  send('result',{text:recognizer.getResult(stream).text});parentPort.close();
 }else if(workerData.kind==='vad'){
  const vad=new sherpa.Vad({sileroVad:{model:workerData.model,threshold:0.5,minSilenceDuration:0.45,minSpeechDuration:0.10,windowSize:512,maxSpeechDuration:20},sampleRate:16000,numThreads:1,provider:'cpu',debug:false},25);
  parentPort.on('message',data=>{try{vad.acceptWaveform(new Float32Array(data));const speech=vad.isDetected(),end=!vad.isEmpty();if(end)while(!vad.isEmpty())vad.pop();send('vad',{speech,end});}catch{send('error');}});send('ready');
 }else if(workerData.kind==='tts'){
  const tts=new sherpa.OfflineTts({model:{supertonic:{durationPredictor:file('duration_predictor.int8.onnx'),textEncoder:file('text_encoder.int8.onnx'),vectorEstimator:file('vector_estimator.int8.onnx'),vocoder:file('vocoder.int8.onnx'),ttsJson:file('tts.json'),unicodeIndexer:file('unicode_indexer.bin'),voiceStyle:file('voice.bin')},numThreads:2,provider:'cpu',debug:false},maxNumSentences:1});
  parentPort.on('message',data=>{try{const audio=tts.generate({text:data.text,generationConfig:{sid:data.speaker,speed:data.speed,numSteps:5,extra:{lang:'pt',max_len:'240',silence_duration:'0.1'}},enableExternalBuffer:false});const samples=Float32Array.from(audio.samples);parentPort.postMessage({type:'audio',samples,sampleRate:audio.sampleRate},[samples.buffer]);}catch{send('error');}});send('ready',{speakers:tts.numSpeakers});
 }
}catch{send('error');parentPort.close();}
