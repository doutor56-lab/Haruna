'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {EventEmitter}=require('node:events');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('TTS prepares one clip ahead during playback, preserves order and rejects stale/cancelled audio (fake worker)',async()=>{
 const workers=[],events=[],root=fs.mkdtempSync(path.join(os.tmpdir(),'haruna-voice-stream-'));
 class Worker extends EventEmitter{
  constructor(){super();this.pending=[];this.requests=[];workers.push(this);queueMicrotask(()=>this.emit('message',{type:'ready'}));}
  postMessage(data){this.pending.push(data);this.requests.push(data.text);}
  finish(){assert(this.pending.shift());this.emit('message',{type:'audio',samples:new Float32Array(160),sampleRate:16000});}
  terminate(){this.emit('exit',0);return Promise.resolve(0);}
 }
 const models={catalog:[{id:'fixture'}],tts:{id:'tts-fixture'},installed:()=>true,installedBytes:()=>0,verify:async()=>{}};
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/voice.cjs'),'utf8'),{module,exports:module.exports,require:name=>name==='./voice-process.cjs'?{VoiceProcess:Worker}:name==='./voice-models.cjs'?models:name==='./models.cjs'?require('../src/models.cjs'):require(name),__dirname:path.join(__dirname,'../src'),Float32Array,setTimeout,clearTimeout});
 const voice=new module.exports.Voice(root,e=>events.push(e),'unused');voice.preferences.speaker=0;
 const clips=()=>events.filter(e=>e.type==='voice-audio');
 try{
  voice.begin('reply');voice.append('reply','Primeiro.');voice.append('reply','Segundo.');voice.append('reply','Terceiro.');voice.end('reply');await tick();
  const worker=workers[0];assert.deepEqual(worker.requests,['Primeiro.']);worker.finish();await tick();
  assert.equal(clips().length,1);assert.deepEqual(worker.requests,['Primeiro.','Segundo.'],'next synthesis starts BEFORE playback ACK');
  worker.finish();await tick();assert.equal(clips().length,1,'no overlapping playback');assert.equal(worker.requests.length,2,'only one audio clip ahead');
  voice.played('reply',999);assert.equal(clips().length,1);voice.played('reply',1);await tick();assert.equal(clips().length,2);assert.equal(worker.requests.at(-1),'Terceiro.');
  voice.played('reply',1);assert.equal(clips().length,2,'duplicate ACK cannot skip a clip');
  worker.finish();await tick();voice.played('reply',2);assert.equal(clips().length,3);assert(voice.speech,'final clip must finish before idle');voice.played('reply',3);assert.equal(voice.speech,null);
  voice.begin('reply');voice.append('reply','Repetir leitura.');voice.append('reply','Próxima parte.');await tick();const repeat=workers.at(-1);repeat.finish();await tick();repeat.finish();await tick();const repeatCount=clips().length;assert.equal(clips().at(-1).serial,4);voice.played('reply',1);assert.equal(clips().length,repeatCount,'ACK from an older reading of the same message must not advance playback');voice.stopTts();voice.played('reply',4);assert.equal(clips().length,repeatCount,'stop discards prepared audio too');
  voice.begin('cancelled');voice.append('cancelled','Interromper.');await tick();const pending=workers.at(-1);voice.stopTts();const count=clips().length;pending.finish();await tick();assert.equal(clips().length,count,'late audio after stop must be discarded');
  await voice.start('call','silent');await tick();for(let i=0;i<400;i++)voice.audio('silent',new Float32Array(512));assert(voice.capture,'silence must keep the call listening');assert(voice.capture.count<160000,'silent PCM must be bounded');voice.stop();
  const failedRelease=voice.release({terminate(){return Promise.reject(Error('synthetic release failure'))}},'vad');await assert.rejects(failedRelease);await tick();
 }finally{voice.close();fs.rmSync(root,{recursive:true,force:true});}
});
test('renderer keeps one AudioContext between consecutive clips and closes it on stop (fake Web Audio)',async()=>{
 let listener,contexts=0,closed=0,rejectPause=false;const sources=[],acks=[],failures=[];
 class AudioContext{
  constructor(){contexts++;this.state='running';this.currentTime=0;this.destination={};}
  resume(){this.state='running';return Promise.resolve();}suspend(){if(rejectPause)return Promise.reject(Error('synthetic pause failure'));this.state='suspended';return Promise.resolve();}close(){closed++;this.state='closed';return Promise.resolve();}
  createBuffer(){return{copyToChannel(){}};}
  createGain(){return{gain:{},connect(){},disconnect(){}};}
  createBufferSource(){const source={connect(){},disconnect(){},start(){},stop(){},onended:null};sources.push(source);return source;}
 }
 const window={HarunaDesktop:{subscribe:fn=>listener=fn,voicePlayed:(...args)=>acks.push(args),voicePlaybackFailed:id=>failures.push(id)},dispatchEvent(){}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../renderer/voice.js'),'utf8'),{window,AudioContext,Float32Array,CustomEvent:class{},addEventListener(){},setInterval:()=>1,clearInterval(){}});
 const clip=serial=>({type:'voice-audio',id:'reply',serial,sampleRate:16000,samples:new Float32Array(160),volume:1});
 listener(clip(1));await tick();sources[0].onended();await tick();assert.deepEqual(acks,[['reply',1]]);assert.equal(closed,0);
 listener(clip(2));await tick();assert.equal(contexts,1);listener({type:'voice-playback',action:'pause'});assert.equal(closed,0);listener({type:'voice-playback',action:'resume'});sources[1].onended();await tick();
 assert.deepEqual(acks,[['reply',1],['reply',2]]);assert.equal(failures.length,0);rejectPause=true;listener({type:'voice-playback',action:'pause'});await tick();assert.deepEqual(failures,['reply']);listener({type:'voice-playback',action:'stop'});await tick();assert.equal(closed,1);
});
test('shared voice segmentation preserves thinking/cancellation and emits short sentences and clauses early',async()=>{await import('../../scripts/check_voice.mjs');});

test('turn cue is short, honors voice volume, and cannot play after closing',async()=>{
 const{TurnCue}=await import('../../app/src/main/assets/haruna/voice/turn-cue.js');
 const previous=global.AudioContext,starts=[],gains=[];let closed=0;
 class Context{constructor(){this.state='running';this.currentTime=0;this.destination={}}resume(){return Promise.resolve()}close(){this.state='closed';closed++;return Promise.resolve()}createOscillator(){return{frequency:{value:0},connect(){},disconnect(){},start:t=>starts.push(t),stop(){}}}createGain(){return{gain:{setValueAtTime(){},linearRampToValueAtTime:(value,t)=>gains.push([value,t])},connect(){},disconnect(){}}}}
 global.AudioContext=Context;try{const cue=new TurnCue();await cue.play(.5);assert.equal(starts.length,1);assert(gains.some(([v,t])=>v===.035&&t<.01));assert(gains.some(([v,t])=>v===0&&t<=.1));await cue.play(0);assert.equal(starts.length,1);cue.close();await cue.play();assert.equal(starts.length,1);assert.equal(closed,1);}finally{global.AudioContext=previous}
});
