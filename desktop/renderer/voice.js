// Offline microphone/playback adapter. Recognition and synthesis execute in native workers.
const desktop=window.HarunaDesktop;
let capture=null,playback=null;
async function stopCapture(id){const c=capture;if(!c||id&&c.id!==id)return;capture=null;c.processor?.disconnect();c.source?.disconnect();c.stream?.getTracks().forEach(t=>t.stop());await c.context?.close().catch(()=>{});}
async function startCapture(id){await stopCapture();const c={id};capture=c;try{c.stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true},video:false});if(capture!==c){c.stream.getTracks().forEach(t=>t.stop());return;}c.context=new AudioContext({sampleRate:16000});if(c.context.sampleRate!==16000)throw Error('O microfone não disponibilizou 16 kHz.');await c.context.resume();if(capture!==c){await c.context.close();return;}c.source=c.context.createMediaStreamSource(c.stream);c.processor=c.context.createScriptProcessor(2048,1,1);c.processor.onaudioprocess=e=>{if(capture!==c)return;desktop.voiceAudio(id,Float32Array.from(e.inputBuffer.getChannelData(0)));};c.source.connect(c.processor);c.processor.connect(c.context.destination);}catch{await stopCapture(id);desktop.voiceFailure(id);}}
async function releasePlayback(p){if(!p)return;clearInterval(p.meter);if(p.source){p.source.onended=null;try{p.source.stop();}catch{}}await p.context?.close().catch(()=>{});}
async function stopPlayback(){const p=playback;playback=null;await releasePlayback(p);}
async function play(event){
 const previous=playback,reuse=previous?.id===event.id&&!previous.source&&previous.context?.state!=='closed';
 const p={id:event.id,serial:event.serial,context:reuse?previous.context:null};playback=p;
 try{
  if(!reuse)await releasePlayback(previous);if(playback!==p)return;
  const context=p.context||(p.context=new AudioContext({sampleRate:event.sampleRate}));
  await context.resume();if(playback!==p)return;
  const source=context.createBufferSource(),gain=context.createGain();p.source=source;
  const samples=new Float32Array(event.samples),buffer=context.createBuffer(1,samples.length,event.sampleRate);buffer.copyToChannel(samples,0);source.buffer=buffer;gain.gain.value=event.volume;source.connect(gain);gain.connect(context.destination);
  source.onended=()=>{if(playback!==p)return;clearInterval(p.meter);source.onended=null;source.disconnect();gain.disconnect();p.source=null;desktop.voicePlayed(p.id,p.serial);};
  const started=context.currentTime;p.meter=setInterval(()=>{if(playback!==p||context.state!=='running')return;const at=Math.floor((context.currentTime-started)*event.sampleRate);let sum=0,n=0;for(let i=at;i<Math.min(samples.length,at+1024);i++){sum+=samples[i]*samples[i];n++;}window.dispatchEvent(new CustomEvent('haruna-tts-status',{detail:{messageId:p.id,meter:true,state:'playing',level:Math.min(1,Math.sqrt(sum/Math.max(1,n))*6)}}));},160);source.start();
 }catch{if(playback===p){await stopPlayback();desktop.voicePlaybackFailed(p.id);}}
}
async function changePlayback(action){const p=playback;try{await p?.context?.[action==='pause'?'suspend':'resume']()}catch{if(p&&playback===p)desktop.voicePlaybackFailed(p.id)}}
desktop?.subscribe(event=>{
 if(event.type==='voice-status')window.dispatchEvent(new CustomEvent(event.kind==='stt'?'haruna-stt-status':'haruna-tts-status',{detail:event.status}));
 else if(event.type==='voice-capture')event.action==='start'?startCapture(event.id):stopCapture(event.id);
 else if(event.type==='voice-audio')play(event);
 else if(event.type==='voice-playback'){if(event.action==='pause'||event.action==='resume')changePlayback(event.action);else stopPlayback();}
});
addEventListener('pagehide',()=>{stopCapture();stopPlayback();desktop?.voiceStop();});
