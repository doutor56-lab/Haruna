import {requestStarted,deltaReceived,discardedStreamEvent} from './diagnostics/inference.js';
const BRIDGE_NAME='HarunaAndroid';const pending=new Map();let activeRequestId=null;function runtime(){return window[BRIDGE_NAME]||null}function parse(v){if(typeof v!=='string')return v;try{return JSON.parse(v)}catch{return v}}export function isAvailable(){const r=runtime();return !!r&&['isAvailable','getStatus','loadModel','unloadModel','resetConversation','generate','stopGeneration'].every(k=>typeof r[k]==='function')}export function getStatus(){return isAvailable()?parse(runtime().getStatus()):{available:false,modelLoaded:false,state:'basic'}}export function loadModel(model={action:'pick_local_gguf'}){if(!isAvailable())throw new Error('Android bridge unavailable');return parse(runtime().loadModel(JSON.stringify(model)))}export function downloadModel(model){const r=runtime();if(!r?.downloadModel)throw new Error('Download de modelos indisponível nesta versão');return parse(r.downloadModel(JSON.stringify(model)))}export function listModels(){const r=runtime();return r?.listModels?parse(r.listModels()):{models:[]}}export function useModel(path){return parse(runtime().useModel(path))}export function setPrimaryModel(path){return parse(runtime().setPrimaryModel(path))}export function setModelDisplayName(path,name){const r=runtime();return r?.setModelDisplayName?parse(r.setModelDisplayName(path,name)):{status:"error",error:"Nome do modelo indisponível"}}export function deleteModel(path){return parse(runtime().deleteModel(path))}export function pickAttachment(){const r=runtime();if(!r?.pickAttachment)throw new Error('Seletor de arquivos indisponível');return parse(r.pickAttachment())}export function readTextAttachment(path){const r=runtime();return r?.readTextAttachment?parse(r.readTextAttachment(path)):{status:'error',error:'Leitura de anexos indisponível'}}export function deleteAttachment(path){const r=runtime();return r?.deleteAttachment?parse(r.deleteAttachment(path)):{status:'error'}}export function unloadModel(){return parse(runtime().unloadModel())}export function resetConversation(){return parse(runtime().resetConversation())}

export async function generate(messages,options={}){
 if(!isAvailable())throw new Error('Android bridge unavailable');
 const requestId=`haruna-${Date.now()}-${Math.random().toString(36).slice(2)}`;
 activeRequestId=requestId;requestStarted(requestId);
 let resolvePending,rejectPending;
 const streamPromise=new Promise((resolve,reject)=>{resolvePending=resolve;rejectPending=reject});
 pending.set(requestId,{resolve:resolvePending,reject:rejectPending,onToken:options.onToken,
  parts:options.streamOnly?null:[],nextSequence:1,cancelRequested:false});
 const nativeOptions={...options};delete nativeOptions.onToken;delete nativeOptions.streamOnly;
 try{
  const result=parse(runtime().generate(JSON.stringify({requestId,messages,options:nativeOptions})));
  if(result?.streaming)return await streamPromise;
  pending.delete(requestId);if(activeRequestId===requestId)activeRequestId=null;
  if(result?.status==='ok')return{requestId,text:result.text||''};
  throw new Error(result?.error?.message||'Generation failed');
 }catch(e){pending.delete(requestId);if(activeRequestId===requestId)activeRequestId=null;throw e}
}
function settle(id,p,final){
 pending.delete(id);if(activeRequestId===id)activeRequestId=null;
 if(p.cancelRequested)p.reject(Object.assign(new Error('Geração interrompida pelo usuário.'),{code:'cancelled'}));
 else if(final.type==='completed')p.resolve({requestId:id,text:p.parts?.join('')});
 else p.reject(Object.assign(new Error(final.message||'Native generation error'),{code:final.code||'generation_failed'}));
}
export function stopGeneration(requestId=null){
 const id=requestId||activeRequestId||'',p=pending.get(id);if(p)p.cancelRequested=true;
 try{
  const result=parse(runtime().stopGeneration(id));
  // New bridge drains all accepted deltas before its terminal event. Legacy fallback only.
  if(p&&!result?.draining)settle(id,p,{type:'error',code:'cancelled'});
  return result;
 }catch(error){if(p)settle(id,p,{type:'error',code:'cancelled'});throw error}
}
function receiveNativeEvent(raw){
 const event=parse(raw);if(!event)return;
 if(event.type==='status'){window.dispatchEvent(new CustomEvent('haruna-native-status-changed',{detail:event}));return}
 if(event.type==='model_import'||event.type==='import-progress'&&event.kind==='model'){window.dispatchEvent(new CustomEvent('haruna-model-import-progress',{detail:event}));return}
 if(event.type==='attachment'){window.dispatchEvent(new CustomEvent('haruna-attachment-imported',{detail:event}));return}
 const p=pending.get(event.requestId);
 if(event.type==='stream'){
  const ack={requestId:event.requestId,sequence:event.sequence,accepted:false};
  if(!p){discardedStreamEvent();return ack}
  try{
   if(!Number.isSafeInteger(event.sequence)||event.sequence!==p.nextSequence||typeof event.delta!=='string')throw new Error('Ordem inválida no transporte da resposta.');
   p.nextSequence++;
   if(event.delta){
    deltaReceived(event.requestId);
    p.parts?.push(event.delta);
    if(typeof p.onToken==='function')p.onToken(event.delta);
   }
   if(event.final){
    if(!['completed','error'].includes(event.final.type))throw new Error('Finalização inválida no transporte da resposta.');
    settle(event.requestId,p,event.final);
   }
   ack.accepted=true;
  }catch(error){
   discardedStreamEvent();pending.delete(event.requestId);
   if(activeRequestId===event.requestId)activeRequestId=null;
   p.reject(Object.assign(error,{code:'stream_protocol'}));
  }
  return ack;
 }
 if(!p){if(event.type==='token')discardedStreamEvent();return}
 // Preserve compatibility with a legacy bridge without rebuilding an accumulated string per delta.
 if(event.type==='token'){
  deltaReceived(event.requestId);const delta=event.token||'';p.parts?.push(delta);
  if(typeof p.onToken==='function')p.onToken(delta);return;
 }
 settle(event.requestId,p,event.type==='completed'?{type:'completed'}:
  {type:'error',code:event.error?.code,message:event.error?.message});
}
window.harunaAndroidOnEvent=receiveNativeEvent;
export default{isAvailable,getStatus,loadModel,downloadModel,listModels,useModel,setPrimaryModel,setModelDisplayName,deleteModel,pickAttachment,readTextAttachment,deleteAttachment,unloadModel,resetConversation,generate,stopGeneration};

