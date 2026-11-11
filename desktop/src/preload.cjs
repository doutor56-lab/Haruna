'use strict';
const{contextBridge,ipcRenderer}=require('electron');
let cache=ipcRenderer.sendSync('haruna:snapshot');
const listeners=new Set();
ipcRenderer.on('haruna:update',(_,data)=>{cache=data.snapshot;for(const fn of listeners)fn(data.event||{type:'status'});});
const sync=(op,...args)=>ipcRenderer.sendSync('haruna:small',{op,args});
function command(op,...args){ipcRenderer.invoke('haruna:command',{op,args}).catch(e=>{if(op==='chat'||op==='image')return;for(const fn of listeners)fn({type:'desktop-error',message:e.message.replace(/^Error invoking remote method[^:]*:\s*/, '')});});}
contextBridge.exposeInMainWorld('HarunaDesktop',{subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},snapshot:()=>cache,devices:()=>ipcRenderer.invoke('haruna:devices'),configure:p=>sync('configure',p),preset:(r,q,o)=>sync('preset',r,q,o),cancelImage:id=>command('cancelImage',id),voiceAudio:(id,samples)=>ipcRenderer.send('haruna:voice-audio',{id,samples}),voiceFailure:id=>ipcRenderer.send('haruna:voice-failed',id),voicePlayed:(id,serial)=>ipcRenderer.send('haruna:voice-played',{id,serial}),voicePlaybackFailed:id=>ipcRenderer.send('haruna:voice-played',{id,failed:true}),voiceStop:()=>{voice('stt','stop');voice('tts','stop');}});
contextBridge.exposeInMainWorld('HarunaAndroid',{
 isAvailable:()=>true,getStatus:()=>JSON.stringify(cache.llm),listModels:()=>JSON.stringify({models:cache.models}),
 loadModel:()=>{command('pickGguf');return JSON.stringify({pendingSelection:true,status:'loading'});},
 useModel:id=>{command('load',id);return JSON.stringify({status:'loading'});},setPrimaryModel:id=>sync('primary',id),deleteModel:id=>{command('remove',id);return JSON.stringify({status:'ok'});},
 unloadModel:()=>{command('unload');return JSON.stringify({status:'ok'});},resetConversation:()=>JSON.stringify({status:'ok'}),
 generate:json=>{let p;try{p=JSON.parse(json);}catch{return JSON.stringify({status:'error',error:{message:'Solicitação inválida.'}});}command('chat',p);return JSON.stringify({streaming:true});},
 stopGeneration:id=>{command('cancelChat',id);return JSON.stringify({draining:true});},
 downloadModel:()=>{command('unsupportedDownload');return JSON.stringify({status:'error',error:'No Windows, importe o GGUF do dispositivo.'});},
 pickAttachment:()=>{command('pickAttachment');return JSON.stringify({status:'pending'});},readTextAttachment:id=>sync('readAttachment',id),deleteAttachment:id=>sync('deleteAttachment',id)
});
contextBridge.exposeInMainWorld('HarunaImages',{
 status:()=>JSON.stringify(cache.images),add:()=>command('pickSdxl'),addComponents:()=>command('pickComponents'),select:id=>sync('selectImage',id),configure:json=>{try{return JSON.parse(sync('configure',JSON.parse(json))).status==='ok';}catch{return false;}},
 remove:(id,confirmed)=>{if(confirmed)command('remove',id);},load:id=>sync('selectImage',id),unload:()=>JSON.stringify({status:'ok'}),
 generate:(id,prompt)=>{if(cache.images.busy||cache.llm.state==='generating')return false;cache.images.busy=true;command('image',id,prompt);return true;},
 cancel:()=>command('cancelImage',cache.images.generation?.request),cancelGeneration:id=>command('cancelImage',id),result:id=>sync('imageResult',id),
 save:id=>command('saveImage',id),saveBatch:id=>command('saveBatch',id),open:(id,share)=>command('openImage',id,share)
});
function voice(kind,method,...args){return ipcRenderer.sendSync('haruna:voice',{kind,method,args});}
contextBridge.exposeInMainWorld('HarunaRecognition',{
 getStatus:()=>voice('stt','status'),start:(...a)=>voice('stt','start',...a),finish:()=>voice('stt','finish'),stop:()=>voice('stt','stop'),configure:j=>voice('stt','configure',j),
 downloadModel:id=>voice('stt','download',id),importModel:()=>voice('stt','import'),selectModel:id=>voice('stt','select',id),removeInstalledModel:id=>voice('stt','remove',id),removeModel:()=>voice('stt','remove'),cancelInstallation:()=>voice('stt','cancelInstallation')
});
contextBridge.exposeInMainWorld('HarunaSpeech',{
 getStatus:()=>voice('tts','status'),configure:j=>voice('tts','configure',j),speak:(...a)=>voice('tts','speak',...a),stop:()=>voice('tts','stop'),pause:()=>voice('tts','pause'),resume:()=>voice('tts','resume'),
 beginStream:id=>voice('tts','begin',id),appendStream:(id,t)=>voice('tts','append',id,t),endStream:id=>voice('tts','end',id),download:()=>voice('tts','download'),importModel:()=>voice('tts','import'),removeModel:()=>voice('tts','remove'),cancelInstallation:()=>voice('tts','cancelInstallation')
});
const documentMethods=['status','list','search','context','preview','visionStatus','cancel','prepare','processDocument','renderPreview','analyzePage','docxBatch','docxFailed','keepAttachment','remove','toggle','selectVision','removeVision','downloadVision'];
contextBridge.exposeInMainWorld('HarunaDocuments',Object.fromEntries(documentMethods.map(method=>[method,(...args)=>ipcRenderer.sendSync('haruna:documents',{method,args})])));
contextBridge.exposeInMainWorld('HarunaDocumentPicker',{pickDocument:()=>ipcRenderer.invoke('haruna:document-picker',{kind:'document'}),pickVision:role=>ipcRenderer.invoke('haruna:document-picker',{kind:'vision',role})});

contextBridge.exposeInMainWorld('HarunaVoiceCall',{status:()=>voice('stt','callStatus'),end:()=>voice('stt','endCall')});
