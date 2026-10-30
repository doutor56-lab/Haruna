// DEBUG-only scalar observations; no payloads, logs or permanent history.
const enabled=window.HarunaDiagnostics?.labAvailable?.()===true;
let current=null;
export function beginPipeline(){if(enabled)current={started:performance.now(),spans:{}}}
export function pipelineMark(key){if(current&&current.spans[key]===undefined)current.spans[key]=performance.now()-current.started}
export function measured(key,fn){if(!current)return fn();const owner=current,start=performance.now();try{return fn()}finally{owner.spans[key]=(owner.spans[key]||0)+performance.now()-start}}
export async function measuredAsync(key,fn){if(!current)return await fn();const owner=current,start=performance.now();try{return await fn()}finally{owner.spans[key]=(owner.spans[key]||0)+performance.now()-start}}
export function pipelineSnapshot(){return current?{...current.spans,note:'Relógio JS desde confirmação de envio; fases aninhadas são inclusivas, não somar indiscriminadamente.'}:{}}

let inspectorArmed=false;
export function armInspector(){if(enabled)inspectorArmed=true}
export function takeInspectorRequest(){const armed=enabled&&inspectorArmed;inspectorArmed=false;return armed}
