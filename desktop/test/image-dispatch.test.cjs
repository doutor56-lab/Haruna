'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('image dispatch after classifier ignores stale LLM status but preserves image exclusion and rejection recovery',()=>{
 const api={},handlers={},commands=[];
 const ipc={sendSync:()=>({llm:{state:'generating'},images:{busy:false}}),on:(name,fn)=>{handlers[name]=fn;},invoke:(channel,payload)=>{commands.push({channel,...payload});return Promise.resolve(true);}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/preload.cjs'),'utf8'),{require:name=>{assert.equal(name,'electron');return{ipcRenderer:ipc,contextBridge:{exposeInMainWorld:(name,value)=>api[name]=value}};}});
 // Stream completion reaches the renderer before the following idle-status IPC.
 assert.equal(api.HarunaImages.generate('request-1','Crie uma imagem de uma bola.'),true);
 assert.equal(commands.length,1);assert.equal(commands[0].op,'image');assert.equal(commands[0].args[1],'Crie uma imagem de uma bola.');
 assert.equal(api.HarunaImages.generate('request-2','Concurrent'),false);
 handlers['haruna:update'](null,{snapshot:{llm:{state:'active'},images:{busy:false}},event:{type:'image-rejected',request:'request-1',error:'native guard'}});
 assert.equal(api.HarunaImages.generate('request-3','Retry after rejection'),true);
 assert.equal(commands.length,2);
 handlers['haruna:update'](null,{snapshot:{llm:{state:'not_loaded'},images:{busy:true}},event:{type:'status'}});
 assert.equal(api.HarunaImages.generate('request-4','While native image runs'),false);assert.equal(commands.length,2);
});
test('refused image stays in its conversation card, without throwing a storage error or poisoning the next request',()=>{
 const entries=[],button={setAttribute(){}};let accept=false;
 const chat={state:()=>({busy:false,attachments:0,draft:''}),begin:(request,prompt)=>entries.push({request,prompt,state:'LOADING'}),update:job=>Object.assign(entries.find(e=>e.request===job.request),job),refresh(){},entries:()=>entries};
 const images={status:()=>JSON.stringify({selected:'model',models:[],busy:false,generationAvailable:true,state:'INSTALLED'}),generate:()=>accept};
 const window={HarunaImages:images,harunaChatImages:chat,addEventListener(){},dispatchEvent(){}};
 const document={hidden:false,createElement:()=>button,querySelector:selector=>selector==='#attach'?{after(){}}:['#stop','#send'].includes(selector)?{}:null};
 const source=fs.readFileSync(path.join(__dirname,'../../app/src/main/assets/haruna/image-chat.js'),'utf8').replace('export function progressLabel','function progressLabel');
 vm.runInNewContext(source,{window,document,crypto:require('node:crypto'),setInterval(){},CustomEvent:class{},prompt:()=>''});
 assert.equal(window.harunaStartImage('Crie uma imagem de uma bola.',{rememberUser:true}),false);
 assert.equal(entries[0].state,'ERROR');assert.match(entries[0].error,/ocupado/);assert(!window.harunaImagesBusy);
 accept=true;window.harunaStartImage('Crie outra imagem.',{rememberUser:true});assert.equal(entries.length,2);assert.equal(entries[1].state,'LOADING');assert.equal(window.harunaImagesBusy,true);
});
