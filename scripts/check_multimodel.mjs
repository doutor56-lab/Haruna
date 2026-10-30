import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../app/src/main/assets/haruna/models/presentation.js',import.meta.url),'utf8');
const {presentModelStatus}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
for(const state of ['not_loaded','loading','switching','unloading','error']){
 const view=presentModelStatus({state,modelLoaded:false,displayName:'Phi-4',modelState:'READY'});
 assert.equal(view.title,'Haruna');assert.equal(view.ready,false);
}
assert.equal(presentModelStatus({state:'active',modelLoaded:true,displayName:'Phi-4',modelState:'LOADING'}).title,'Haruna');
for(const displayName of ['Phi-4','Qwen3.5'])for(const state of ['active','generating']){
 const view=presentModelStatus({state,modelLoaded:true,modelState:'READY',displayName});
 assert.equal(view.title,`Haruna — ${displayName}`);assert.equal(view.ready,true);
}
assert.equal(presentModelStatus({state:'active',modelLoaded:false,displayName:'Phi-4'}).ready,false);
console.log('PASS: UI only announces the confirmed READY model; selected/loading/error names never appear active.');
const handlers=new Map();globalThis.window={addEventListener(type,listener){handlers.set(type,listener)}};
let status={state:'not_loaded',modelLoaded:false},finish,calls=0;
globalThis.__modelBridge={isAvailable:()=>true,getStatus:()=>({...status}),
 generate:()=>{calls++;return new Promise(resolve=>{finish=resolve})},
 unloadModel:()=>({status:'error',error:'busy'})};
const engineSource=(await readFile(new URL('../app/src/main/assets/haruna/llm-engine.js',import.meta.url),'utf8')).replace("import androidBridge from './android-bridge.js';",'const androidBridge=globalThis.__modelBridge;');
const engine=await import(`data:text/javascript;base64,${Buffer.from(engineSource).toString('base64')}`);
await engine.refreshStatus();assert.equal(engine.getState().modelLoaded,false);
status={state:'active',modelLoaded:true,modelState:'READY',displayName:'Qwen3.5'};
await engine.refreshStatus();assert.equal(engine.getState().displayName,'Qwen3.5');
const generation=engine.generate([{role:'user',content:'fixture'}]);
await Promise.resolve();await Promise.resolve();assert.equal(calls,1);
status={state:'switching',modelLoaded:false,modelState:'SWITCHING',model:{selected:{displayName:'Phi-4'}}};
await engine.refreshStatus();finish({});await generation;
assert.equal(engine.getState().state,'switching');assert.equal(presentModelStatus(engine.getState()).title,'Haruna');
await assert.rejects(()=>engine.generate([]));assert.equal(calls,1);
status={state:'active',modelLoaded:true,modelState:'READY',displayName:'Phi-4'};
await assert.rejects(()=>engine.unloadModel());assert.equal(engine.getState().modelLoaded,true);
console.log('PASS: actual JS controller rejects generation during switch; stale completion and unload failure do not fabricate model state.');
