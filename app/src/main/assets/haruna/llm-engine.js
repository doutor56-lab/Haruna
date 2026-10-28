import androidBridge from './android-bridge.js';
let state='basic'; let lastError=null;
const listeners=new Set();
function emit(){ const s=getState(); listeners.forEach(fn=>fn(s)); }
export function getState(){return {state,error:lastError,available:androidBridge.isAvailable()};}
export function subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}
export async function refreshStatus(){ if(!androidBridge.isAvailable()){state='basic';emit();return getState();} const s=androidBridge.getStatus(); state=s.state || (s.modelLoaded?'active':'not_loaded'); lastError=s.error||null;emit();return {...getState(),...s}; }
export async function loadModel(model={action:'pick_local_gguf'}){ if(!androidBridge.isAvailable()) return refreshStatus(); state='loading';lastError=null;emit(); try{const r=androidBridge.loadModel(model); if(r?.pendingSelection || r?.status==='loading') state='loading'; else state=r?.modelLoaded?'active':'not_loaded'; emit(); return r;}catch(e){state='error';lastError=e.message;emit();throw e;} }
export async function unloadModel(){const r=androidBridge.unloadModel();state='not_loaded';lastError=null;emit();return r;}
export async function resetConversation(){ if(!androidBridge.isAvailable()) throw new Error('LLM local indisponível'); state='loading';lastError=null;emit(); try{const r=androidBridge.resetConversation(); if(r?.status!=='ok') throw new Error(r?.error||'Não foi possível iniciar uma nova conversa'); state='active';emit();return r;}catch(e){state='error';lastError=e.message;emit();throw e;} }
export async function generate(messages,options={}){ if(!androidBridge.isAvailable()) throw new Error('LLM local indisponível'); const s=androidBridge.getStatus(); if(!s?.modelLoaded) throw new Error('Selecione e carregue um modelo GGUF primeiro.'); state='generating';lastError=null;emit(); try{const r=await androidBridge.generate(messages,options);state='active';emit();return r;}catch(e){const status=androidBridge.getStatus();if(status?.modelLoaded){state='active';lastError=null;}else{state='error';lastError=e.message;}emit();throw e;} }
export function stopGeneration(){const r=androidBridge.stopGeneration();if(!r?.draining)state='active';lastError=null;emit();return r;}
window.addEventListener('haruna-native-status-changed',()=>refreshStatus());
export default {getState,subscribe,refreshStatus,loadModel,unloadModel,resetConversation,generate,stopGeneration};
