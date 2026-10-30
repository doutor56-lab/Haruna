import {inferenceCorrelation} from './inference.js';
let voice=null;
export function voiceObservation(){return voice?{...voice}:{} }
if(window.HarunaDiagnostics?.labAvailable?.()){
 window.addEventListener('haruna-stt-status',({detail:d})=>{
  if(!d||d.meter)return;const now=performance.now();
  if(d.state==='preparing'&&d.mode==='call')voice={request:d.requestId,captureStart:now,model:d.modelName,engine:d.selectedId?.startsWith('whisper-cpp-')?'whisper.cpp':'sherpa-onnx',note:'Tempos observados na recepção JS; incluem transporte. Não medem DAC nem final físico da fala.'};
  if(!voice||d.requestId!==voice.request)return;
  if(d.state==='transcribing'&&voice.captureEnd==null){voice.captureEnd=now;voice.audioMs=d.diagnostics?.audioMs??null}
  if(d.state==='result'&&voice.resultAt==null){voice.resultAt=now;voice.sttPipelineMs=voice.captureEnd!=null?now-voice.captureEnd:null}
 });
 window.addEventListener('haruna-tts-status',({detail:d})=>{
  if(!voice||!d||d.meter||!d.messageId?.startsWith('local-call-audio-')||voice.resultAt==null)return;
  const now=performance.now();
  if(d.state==='preparing'&&voice.firstTtsPrepareMs==null)voice.firstTtsPrepareMs=now-voice.resultAt;
  if(d.state==='playing'&&voice.firstAudioMs==null){voice.firstAudioMs=now-voice.resultAt;voice.captureEndToAudioMs=voice.captureEnd!=null?now-voice.captureEnd:null;const llm=inferenceCorrelation();if(llm.startPerfMs>=voice.resultAt){voice.llmTtftMs=llm.clientFirstDeltaMs;voice.beforeLlmMs=llm.startPerfMs-voice.resultAt}}
 });
}
export function voiceScalars(){const {request,captureStart,captureEnd,resultAt,...value}=voice||{};return value}
