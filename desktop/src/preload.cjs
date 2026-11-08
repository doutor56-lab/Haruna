'use strict';
const{contextBridge,ipcRenderer}=require('electron');
let cache=ipcRenderer.sendSync('haruna:snapshot');
const listeners=new Set();
ipcRenderer.on('haruna:update',(_,data)=>{cache=data.snapshot;for(const fn of listeners)fn(data.event||{type:'status'});});
const sync=(op,...args)=>ipcRenderer.sendSync('haruna:small',{op,args});
function command(op,...args){ipcRenderer.invoke('haruna:command',{op,args}).catch(e=>{if(op==='chat'||op==='image')return;for(const fn of listeners)fn({type:'desktop-error',message:e.message.replace(/^Error invoking remote method[^:]*:\s*/, '')});});}
contextBridge.exposeInMainWorld('HarunaDesktop',{subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},snapshot:()=>cache,devices:()=>ipcRenderer.invoke('haruna:devices'),configure:p=>sync('configure',p),preset:(r,q,o)=>sync('preset',r,q,o),cancelImage:id=>command('cancelImage',id)});
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
 status:()=>JSON.stringify(cache.images),add:()=>command('pickSdxl'),select:id=>sync('selectImage',id),configure:json=>sync('configure',JSON.parse(json)),
 remove:(id,confirmed)=>{if(confirmed)command('remove',id);},load:id=>sync('selectImage',id),unload:()=>JSON.stringify({status:'ok'}),
 generate:(id,prompt)=>{if(cache.images.busy||cache.llm.state==='generating')return false;cache.images.busy=true;command('image',id,prompt);return true;},
 cancel:()=>command('cancelImage',cache.images.generation?.request),cancelGeneration:id=>command('cancelImage',id),result:id=>sync('imageResult',id),
 save:id=>command('saveImage',id),open:(id,share)=>command('openImage',id,share)
});
