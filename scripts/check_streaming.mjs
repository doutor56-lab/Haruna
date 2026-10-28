import assert from 'node:assert/strict';
import {ThinkParser} from '../app/src/main/assets/haruna/streaming/think-parser.js';
const cases=[
 ['Olá 🌸! 1:1:1:1:1...', 'Olá 🌸! 1:1:1:1:1...'],
 ['  começo <think>interno</think> fim','começo  fim'],
 ['<ThInK>oculto</THINK>   Resposta normal.','Resposta normal.'],
 ['<think>incompleto',''],['valor < 3 e <thi','valor < 3 e <thi'],
 ['antes<think>a</think>meio<think>b</think>fim','antesmeiofim'],
 ['raciocínio implícito</think> resposta','resposta']
];
for(const [source,expected] of cases)for(let size=1;size<=source.length+1;size++){
 const parser=new ThinkParser();let visible='';
 for(let at=0;at<source.length;at+=size){const change=parser.feed(source.slice(at,at+size));if(change.reset)visible='';visible+=change.append}
 const end=parser.finish();visible+=end.append;
 assert.equal(visible,expected);assert.equal(parser.snapshot(),expected);assert.equal(parser.rawLength,source.length);
}

const listeners=new Map(),docListeners=new Map();
let frames=new Map(),timers=new Map(),serial=0;
globalThis.requestAnimationFrame=fn=>{const id=++serial;frames.set(id,fn);return id};
globalThis.cancelAnimationFrame=id=>frames.delete(id);
const actualSetTimeout=globalThis.setTimeout,actualClearTimeout=globalThis.clearTimeout;
globalThis.setTimeout=fn=>{const id=++serial;timers.set(id,fn);return id};
globalThis.clearTimeout=id=>timers.delete(id);
globalThis.CustomEvent=class{constructor(type,{detail}){this.type=type;this.detail=detail}};
globalThis.window={addEventListener:(k,fn)=>listeners.set(k,fn),removeEventListener:k=>listeners.delete(k),dispatchEvent:()=>{}};
globalThis.document={visibilityState:'visible',addEventListener:(k,fn)=>docListeners.set(k,fn),removeEventListener:k=>docListeners.delete(k),
 createTextNode:data=>({data,appendData(s){this.data+=s}})};
const {createMessageView}=await import('../app/src/main/assets/haruna/streaming/message-view.js');
const runFrame=()=>{const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn())};
let saves=[],visual=0,scrolls=0,top=900;
const container={scrollHeight:1000,clientHeight:100,get scrollTop(){return top},set scrollTop(v){top=v;scrolls++},
 addEventListener:(k,fn)=>listeners.set('scroll',fn),removeEventListener:()=>listeners.delete('scroll')};
const bubble={isConnected:true,textContent:'placeholder',appendChild(node){this.node=node}};
let view=createMessageView({bubble,container,onVisual:()=>visual++,checkpoint:s=>saves.push(s)});
view.push('<thi');view.push('nk>oculto</think>Olá');view.push(' mundo');
assert.equal(frames.size,1);assert.equal(visual,0);assert.equal(saves.length,0);
runFrame();assert.equal(bubble.node.data,'Olá mundo');assert.equal(visual,1);assert.equal(scrolls,1);
top=200;listeners.get('scroll')();view.push('!');runFrame();assert.equal(scrolls,1);
[...timers.values()].forEach(fn=>fn());assert.deepEqual(saves,['Olá mundo!']);
view.push(' fim');const final=view.finish();assert.equal(final.text,'Olá mundo! fim');assert.equal(final.follow,false);
assert.equal(frames.size,0);assert.equal(timers.size,0);assert.equal(listeners.has('pagehide'),false);
view.push('velho');assert.equal(frames.size,0);
globalThis.setTimeout=actualSetTimeout;globalThis.clearTimeout=actualClearTimeout;

let currentId,stopCalls=0;
window.HarunaAndroid={isAvailable:()=>true,getStatus:()=>({modelLoaded:true}),loadModel:()=>{},unloadModel:()=>{},resetConversation:()=>{},
 generate:payload=>{currentId=JSON.parse(payload).requestId;return JSON.stringify({streaming:true})},
 stopGeneration:()=>{stopCalls++;return JSON.stringify({status:'ok',draining:true})}};
const bridge=await import('../app/src/main/assets/haruna/android-bridge.js');
const send=(id,sequence,delta,final)=>window.harunaAndroidOnEvent(JSON.stringify({requestId:id,type:'stream',sequence,delta,final}));
let chunks=[];
let result=bridge.generate([{role:'user',content:'test'}],{onToken:d=>chunks.push(d),streamOnly:true});
const first=currentId;
assert.equal(send(first,1,'a').accepted,true);
bridge.stopGeneration();assert.equal(stopCalls,1);
assert.equal(send(first,2,'b',{type:'error',code:'cancelled',message:'interrompida'}).accepted,true);
await assert.rejects(result,e=>e.code==='cancelled');assert.deepEqual(chunks,['a','b']);
result=bridge.generate([],{onToken:d=>chunks.push(d)});const next=currentId;
assert.equal(send(first,3,'old').accepted,false);
send(next,1,'Olá');send(next,2,' 🌸',{type:'completed'});
assert.equal((await result).text,'Olá 🌸');assert.deepEqual(chunks,['a','b','Olá',' 🌸']);
result=bridge.generate([]);bridge.stopGeneration();send(currentId,1,'',{type:'error',code:'cancelled'});
await assert.rejects(result,e=>e.code==='cancelled');
result=bridge.generate([]);send(currentId,1,'parcial',{type:'error',code:'generation_failed',message:'erro técnico'});
await assert.rejects(result,e=>e.code==='generation_failed');
result=bridge.generate([]);assert.equal(send(currentId,2,'fora de ordem').accepted,false);
await assert.rejects(result,e=>e.code==='stream_protocol');
console.log('PASS: marker boundaries, plain/repetitive text integrity, RAF/scroll/checkpoint cleanup, ACK/order, cancel and next request.');
