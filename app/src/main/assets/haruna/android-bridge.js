const BRIDGE_NAME = 'HarunaAndroid';
const pending = new Map();
let activeRequestId = null;

function runtime() { return window[BRIDGE_NAME] || null; }
function parse(v) { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return v; } }
export function isAvailable() { const r=runtime(); return !!r && ['isAvailable','getStatus','loadModel','unloadModel','resetConversation','generate','stopGeneration'].every(k=>typeof r[k]==='function'); }
export function getStatus() { if(!isAvailable()) return {available:false,modelLoaded:false,state:'basic'}; return parse(runtime().getStatus()); }
export function loadModel(model={action:'pick_local_gguf'}) { if(!isAvailable()) throw new Error('Android bridge unavailable'); return parse(runtime().loadModel(JSON.stringify(model))); }
export function unloadModel() { if(!isAvailable()) return {status:'ok',modelLoaded:false}; return parse(runtime().unloadModel()); }
export function resetConversation() { if(!isAvailable()) throw new Error('Android bridge unavailable'); return parse(runtime().resetConversation()); }
export async function generate(messages, options={}) {
  if(!isAvailable()) throw new Error('Android bridge unavailable');
  const requestId=`haruna-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  activeRequestId=requestId;
  let resolvePending, rejectPending;
  const streamPromise=new Promise((resolve,reject)=>{resolvePending=resolve;rejectPending=reject;});
  pending.set(requestId,{resolve:resolvePending,reject:rejectPending,onToken:options.onToken,buffer:''});
  const nativeOptions={...options}; delete nativeOptions.onToken;
  try {
    const result=parse(runtime().generate(JSON.stringify({requestId,messages,options:nativeOptions})));
    if(result?.streaming) return await streamPromise;
    pending.delete(requestId); if(activeRequestId===requestId) activeRequestId=null;
    if(result?.status==='ok') return {requestId,text:result.text||''};
    throw new Error(result?.error?.message || 'Generation failed');
  } catch(e) { pending.delete(requestId); if(activeRequestId===requestId) activeRequestId=null; throw e; }
}
export function stopGeneration(requestId=null) { if(!isAvailable()) return {status:'ok'}; return parse(runtime().stopGeneration(requestId||activeRequestId||'')); }
function receiveNativeEvent(raw) {
  const event=parse(raw); if(!event) return;
  if(event.type==='status') { window.dispatchEvent(new CustomEvent('haruna-native-status-changed',{detail:event})); return; }
  const p=pending.get(event.requestId); if(!p) return;
  if(event.type==='token') { p.buffer+=event.token||''; if(typeof p.onToken==='function') p.onToken(event.token||'',p.buffer); return; }
  pending.delete(event.requestId); if(activeRequestId===event.requestId) activeRequestId=null;
  if(event.type==='completed') p.resolve({requestId:event.requestId,text:event.text??p.buffer});
  else if(event.type==='error') p.reject(new Error(event.error?.message||'Native generation error'));
}
window.harunaAndroidOnEvent=receiveNativeEvent;
export default {isAvailable,getStatus,loadModel,unloadModel,resetConversation,generate,stopGeneration};
