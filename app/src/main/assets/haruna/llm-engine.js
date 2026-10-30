import androidBridge from './android-bridge.js';
let snapshot={state:'basic',modelLoaded:false,error:null};
const listeners=new Set();
function emit(){const state=getState();listeners.forEach(fn=>fn(state));}
function transient(state){snapshot={...snapshot,state,error:null};if(['loading','switching','unloading','error','not_loaded'].includes(state))snapshot={...snapshot,modelLoaded:false,displayName:null};emit();}
export function getState(){return {...snapshot,available:androidBridge.isAvailable()};}
export function subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}
export async function refreshStatus(){
 if(!androidBridge.isAvailable())snapshot={state:'basic',modelLoaded:false,error:null};
 else{const status=androidBridge.getStatus();snapshot={...status,state:status.state||(status.modelLoaded?'active':'not_loaded'),error:status.error||null};}
 emit();return getState();
}
export async function loadModel(model={action:'pick_local_gguf'}){
 if(!androidBridge.isAvailable())return refreshStatus();
 const result=androidBridge.loadModel(model);await refreshStatus();return result;
}
export async function unloadModel(){const result=androidBridge.unloadModel();await refreshStatus();if(result?.status!=='ok')throw new Error(result?.error||'Falha ao descarregar modelo');return result;}
export async function resetConversation(){
 if(!androidBridge.isAvailable())throw new Error('LLM local indisponível');
 transient('loading');
 try{const result=androidBridge.resetConversation();if(result?.status!=='ok')throw new Error(result?.error||'Não foi possível iniciar uma nova conversa');return result;}
 finally{await refreshStatus();}
}
export async function generate(messages,options={}){
 if(!androidBridge.isAvailable())throw new Error('LLM local indisponível');
 const status=await refreshStatus();
 if(!status.modelLoaded||!['active','generating'].includes(status.state))throw new Error('Selecione e carregue um modelo GGUF primeiro.');
 transient('generating');
 try{return await androidBridge.generate(messages,options);}
 finally{await refreshStatus();}
}
export function stopGeneration(){const result=androidBridge.stopGeneration();if(!result?.draining)refreshStatus();return result;}
window.addEventListener('haruna-native-status-changed',()=>refreshStatus());
window.addEventListener('haruna-model-import-progress',event=>{if(['cancelled','error','completed','ready'].includes(event.detail?.state||event.detail?.phase))refreshStatus();});
export default {getState,subscribe,refreshStatus,loadModel,unloadModel,resetConversation,generate,stopGeneration};
