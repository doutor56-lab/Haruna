import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,stat,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(process.env.HARUNA_PLAYWRIGHT_PACKAGE||'/tmp/haruna-stage6-browser/package.json');
const {chromium}=require('playwright');
const root=resolve('app/src/main/assets/haruna');
const server=createServer(async(req,res)=>{
 try{const file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!file.startsWith(root+'/'))throw Error('path');
  const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'}[extname(file)]||'application/octet-stream';
  res.writeHead(200,{'Content-Type':mime});res.end(await readFile(file));
 }catch{res.writeHead(404);res.end()}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.HARUNA_CHROME||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
await mkdir('stage6-browser',{recursive:true});
try{
 for(const width of [360,768]){
  const context=await browser.newContext({viewport:{width,height:900}});
  const page=await context.newPage();const errors=[];page.on('pageerror',error=>{errors.push(error.message);console.log('BROWSER ERROR',error.stack)});page.on('dialog',dialog=>dialog.accept());
  await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:')?route.continue():route.abort());
  await page.addInitScript(()=>{
   localStorage.setItem('haruna_onboarding_v1','done');
   const clone=x=>JSON.parse(JSON.stringify(x)),json=JSON.stringify;
   const event=(name,detail)=>window.dispatchEvent(new CustomEvent(name,{detail:clone(detail)}));
   const f=window.__voiceFixture={calls:[],segments:[],model:'Qwen3.5-2B-Q4_K_M.gguf',selected:'whisper-tiny-int8',models:[{id:'whisper-tiny-int8',name:'Whisper Tiny',installed:true,bytes:103600000}],capture:null,cycle:0,ttsId:null,generating:false,firstTts:null,llmEnd:null};
   const stt=()=>({state:'idle',installed:true,modelName:f.models.find(x=>x.id===f.selected)?.name||'Whisper Tiny',selectedId:f.selected,models:f.models.map(x=>({...x,selected:x.id===f.selected})),bytes:103600000,busy:false,loaded:false});
   const tts=()=>({volume:1,state:'idle',installed:true,speaker:0,speed:1,speakers:10,voiceLabels:['F1','F2','F3','F4','F5','M1','M2','M3','M4','M5'],bytes:145000000,pronunciations:{}});
   const status=()=>({available:true,modelLoaded:true,state:f.generating?'generating':'active',modelName:f.model});
   const ok=()=>json({status:'ok'});
   window.HarunaAndroid={isAvailable:()=>true,getStatus:()=>json(status()),getAssistantIdentity:()=> 'Haruna',getBehaviorProfile:()=>json({}),
    listModels:()=>json({models:[{name:f.model,path:'/private/model.gguf',bytes:1280835840,active:true,primary:true}]}),
    loadModel:()=>ok(),unloadModel:()=>ok(),resetConversation:()=>ok(),setPrimaryModel:()=>ok(),deleteModel:()=>ok(),pickAttachment:()=>ok(),
    generate:payload=>{
     const p=JSON.parse(payload);f.generating=true;f.request={id:p.requestId,sequence:0,timers:[]};const request=f.request;
     const send=(delta,final)=>{if(f.request!==request)return;window.harunaAndroidOnEvent({type:'stream',requestId:request.id,sequence:++request.sequence,delta,final})};
     window.harunaAndroidOnEvent({type:'status'});
     request.timers.push(setTimeout(()=>send('A água recebe energia durante o aquecimento e suas moléculas passam a se movimentar mais. '),120));
     request.timers.push(setTimeout(()=>send('Quando a pressão de vapor iguala a pressão externa, bolhas de vapor se formam e sobem. '),1400));
     request.timers.push(setTimeout(()=>{f.generating=false;f.llmEnd=performance.now();send('',{type:'completed'});f.request=null},2600));
     return json({streaming:true});
    },
    stopGeneration:()=>{const r=f.request;if(r){r.timers.forEach(clearTimeout);f.generating=false;window.harunaAndroidOnEvent({type:'stream',requestId:r.id,sequence:++r.sequence,delta:'',final:{type:'error',code:'cancelled',message:'Geração interrompida'}});f.request=null}return json({status:'ok',draining:!!r})}
   };
   window.HarunaVoiceCall={status:()=>json({running:f.callRunning===true}),end:()=>{f.callRunning=false;f.calls.push(['service-end']);return ok()}};
   window.HarunaSpeech={getStatus:()=>json(tts()),pause:()=>{f.calls.push(['pause-audio']);event('haruna-tts-status',{...tts(),state:'paused',messageId:f.ttsId});return ok()},resume:()=>{f.calls.push(['resume-audio']);event('haruna-tts-status',{...tts(),state:'playing',messageId:f.ttsId});return ok()},configure:config=>{f.calls.push(['tts-config',JSON.parse(config)]);return ok()},speak:()=>ok(),download:()=>ok(),importModel:()=>ok(),removeModel:()=>ok(),cancelInstallation:()=>ok(),
    beginStream:id=>{f.ttsId=id;f.calls.push(['begin',id]);event('haruna-tts-status',{...tts(),state:'buffering',messageId:id});return ok()},
    appendStream:(id,text)=>{assertId(id);f.segments.push(text);if(f.firstTts===null)f.firstTts=performance.now();f.calls.push(['segment',text]);setTimeout(()=>{event('haruna-tts-status',{...tts(),state:'playing',messageId:id});event('haruna-tts-status',{meter:true,state:'playing',messageId:id,level:.8})},20);return ok()},
    endStream:id=>{assertId(id);f.calls.push(['end',id]);setTimeout(()=>event('haruna-tts-status',{...tts(),state:'idle',messageId:id}),100);return ok()},
    stop:()=>{const id=f.ttsId;f.ttsId=null;event('haruna-tts-status',{...tts(),state:'idle',messageId:id});return ok()}
   };
   function assertId(id){if(id!==f.ttsId)throw Error('stale TTS request')}
   window.HarunaRecognition={configure:config=>{f.calls.push(['stt-config',JSON.parse(config)]);return ok()},getStatus:()=>json(stt()),start:(mode,id)=>{
    f.capture=id;if(mode==='call')f.callRunning=true;f.cycle++;const cycle=f.cycle;f.calls.push(['start',mode,id]);
    setTimeout(()=>{if(f.capture!==id)return;event('haruna-stt-status',{...stt(),state:'listening',requestId:id,mode});event('haruna-stt-status',{meter:true,state:'listening',requestId:id,level:.6})},20);
    if(cycle===1)setTimeout(()=>{if(f.capture!==id)return;f.capture=null;event('haruna-stt-status',{...stt(),state:'result',requestId:id,mode,text:'Explique por que a água ferve quando é aquecida.'})},200);
    return ok();},
    finish:()=>ok(),stop:()=>{f.capture=null;setTimeout(()=>event('haruna-stt-status',stt()),0);return ok()},download:()=>ok(),downloadModel:id=>{f.calls.push(['download',id]);return ok()},cancelInstallation:()=>ok(),
    importModel:()=>{f.calls.push(['import']);f.models.push({id:'whisper-base-int8',name:'Whisper Base',installed:true,bytes:200000000});f.selected='whisper-base-int8';setTimeout(()=>event('haruna-stt-status',{...stt(),state:'installed'}),20);return ok()},
    selectModel:id=>{f.calls.push(['select',id]);f.selected=id;setTimeout(()=>event('haruna-stt-status',stt()),10);return ok()},
    removeInstalledModel:id=>{f.calls.push(['remove',id]);f.models=f.models.filter(x=>x.id!==id);if(f.selected===id)f.selected=f.models[0]?.id;setTimeout(()=>event('haruna-stt-status',stt()),10);return ok()},removeModel:()=>ok()
   };
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  try{await page.waitForFunction(()=>window.__HARUNA_CHAT_READY__&&document.querySelector('.haruna-credits')&&document.querySelector('.recommended-model[data-tier=capable] strong')?.textContent==='Phi-4 Mini 3.8B',null,{timeout:8000})}catch(error){console.log(await page.evaluate(()=>({ready:window.__HARUNA_CHAT_READY__,credits:!!document.querySelector('.haruna-credits'),catalog:document.querySelector('.recommended-model[data-tier=capable]')?.textContent})));throw error}
  await context.setOffline(true);
  assert.equal(await page.locator('.brand h1').textContent(),'Haruna');
  assert.equal(await page.locator('#brain').textContent(),'Qwen3.5 local ativo');
  assert.deepEqual(await page.locator('.recommended-model strong').allTextContents(),['Qwen 0.5B','Qwen3.5 2B','Phi-4 Mini 3.8B']);
  await page.getByRole('button',{name:'Conversa por voz local',exact:true}).click();
  await page.getByRole('button',{name:'Iniciar conversa',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.voice-call-orb')?.dataset.state==='listening');
  assert(Number(await page.locator('.voice-call-orb').evaluate(x=>x.style.getPropertyValue('--voice-scale')))>1);
  await page.waitForFunction(()=>window.__voiceFixture.firstTts!==null&&window.__voiceFixture.llmEnd===null);
  await page.waitForFunction(()=>document.querySelector('.voice-call-orb')?.dataset.state==='speaking');
  assert.equal(await page.locator('.brand h1').textContent(),'Haruna');
  assert(Number(await page.locator('.voice-call-orb').evaluate(x=>x.style.getPropertyValue('--voice-scale')))>1);
  const orbStyle=await page.locator('.voice-call-orb').evaluate(x=>({background:getComputedStyle(x).backgroundImage,radius:getComputedStyle(x).borderRadius}));assert(orbStyle.background.includes('radial-gradient'));assert.equal(orbStyle.radius,'50%');
  const bounds=await page.locator('.voice-call').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width+1);
  await page.getByRole('button',{name:'Pausar áudio',exact:true}).click();assert.equal(await page.locator('.voice-call-orb').getAttribute('data-state'),'paused');
  await page.getByRole('button',{name:'Continuar áudio',exact:true}).click();assert.equal(await page.locator('.voice-call-orb').getAttribute('data-state'),'speaking');
  await page.getByRole('button',{name:'Voltar ao chat',exact:true}).click();assert(await page.locator('.voice-miniplayer').isVisible());assert.equal(await page.locator('.voice-call').getAttribute('open'),null);
  await page.screenshot({path:`stage6-browser/miniplayer-${width}.png`});
  await page.getByRole('button',{name:'Abrir chamada',exact:true}).click();assert(await page.locator('.voice-call').isVisible());assert(await page.locator('.voice-miniplayer').isHidden());
  await page.screenshot({path:`stage6-browser/call-${width}.png`});
  await page.waitForFunction(()=>window.__voiceFixture.llmEnd!==null);
  await page.waitForFunction(()=>document.querySelector('.voice-call-orb')?.dataset.state==='listening');
  const fixture=await page.evaluate(()=>({first:__voiceFixture.firstTts,last:__voiceFixture.llmEnd,segments:__voiceFixture.segments,calls:__voiceFixture.calls}));
  assert(fixture.first<fixture.last);assert.equal(fixture.segments.length,2);assert.equal(new Set(fixture.segments).size,2);
  await page.getByRole('button',{name:'Pausar conversa',exact:true}).click();assert.equal(await page.locator('.voice-call-orb').getAttribute('data-state'),'paused');
  await page.getByRole('button',{name:'Retomar',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.voice-call-orb')?.dataset.state==='listening');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('haruna-stt-status',{detail:{state:'error',error:'microfone indisponível',requestId:__voiceFixture.capture,installed:true,models:__voiceFixture.models,modelName:'Whisper Tiny'}})));
  assert.equal(await page.locator('.voice-call-orb').getAttribute('data-state'),'error');
  await page.locator('.voice-call [data-settings]').click();assert(await page.getByRole('dialog',{name:'Configurações de voz',exact:true}).isVisible());
  await page.locator('.call-voice-settings [data-stream]').uncheck();assert.equal(await page.evaluate(()=>localStorage.getItem('haruna_voice_stream')),'off');
  await page.locator('.call-voice-settings [data-stream]').check();
  await page.locator('.call-voice-settings [data-auto]').uncheck();assert(await page.evaluate(()=>__voiceFixture.calls.some(x=>x[0]==='stt-config'&&x[1].automaticPause===false)));
  await page.screenshot({path:`stage6-browser/voice-settings-${width}.png`});
  await page.getByRole('button',{name:'Fechar configurações de voz',exact:true}).click();
  await page.getByRole('button',{name:'Encerrar',exact:true}).click();assert.equal(await page.locator('.voice-call').count(),0);
  await page.locator('.nav-item[data-view=settings]').click();
  await page.locator('.recognition-settings [data-import]').click();await page.waitForFunction(()=>document.querySelector('.recognition-settings [data-state]')?.textContent.includes('Whisper Base'));
  const tiny=page.locator('.stt-model-row').filter({hasText:'Whisper Tiny'});await tiny.getByRole('button',{name:'Selecionar'}).click();await page.waitForFunction(()=>__voiceFixture.selected==='whisper-tiny-int8');
  const base=page.locator('.stt-model-row').filter({hasText:'Whisper Base'});await base.getByRole('button',{name:'Remover',exact:true}).click();await page.waitForFunction(()=>!__voiceFixture.models.some(x=>x.id==='whisper-base-int8'));
  assert.equal(await page.locator('#settingsView > :last-child').getAttribute('class'),'haruna-credits');
  assert.equal(await page.locator('.haruna-credits').innerText(),'Haruna © 2026\nJoão Victor — Proxys Labs\nDesenvolvido com Inteligência Artificial.');
  for(const selector of ['.recognition-settings','.haruna-credits']){const box=await page.locator(selector).boundingBox();assert(box.x>=0&&box.x+box.width<=width+1);const size=await page.locator(selector).evaluate(x=>({scroll:x.scrollWidth,width:x.clientWidth}));assert(size.scroll<=size.width+1)}
  await page.locator('[data-theme-option=light]').click();await page.screenshot({path:`stage6-browser/settings-light-${width}.png`});
  for(const [model,label]of [['microsoft_Phi-4-mini-instruct-Q4_K_M.gguf','Phi-4'],['qwen2.5-0.5b-instruct-q4_k_m.gguf','Qwen 0.5B']]){
   await page.evaluate(model=>{__voiceFixture.model=model;window.dispatchEvent(new CustomEvent('haruna-native-status-changed'));},model);
   assert.equal(await page.locator('#brain').textContent(),`${label} local ativo`);assert.equal(await page.locator('.brand h1').textContent(),'Haruna');
  }
  await page.locator('.nav-item[data-view=chat]').click();
  await page.getByRole('button',{name:'Conversa por voz local',exact:true}).click();await page.getByRole('button',{name:'Iniciar conversa',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.voice-call-orb')?.dataset.state==='listening');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{get:()=>__voiceFixture.hidden===true,configurable:true});__voiceFixture.hidden=true;document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new CustomEvent('haruna-tts-status',{detail:{state:'idle',reason:'app_background'}}))});
  assert.equal(await page.locator('.voice-call').count(),1);assert(await page.locator('html').evaluate(x=>x.classList.contains('voice-background')));
  await page.evaluate(()=>{__voiceFixture.hidden=false;document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new CustomEvent('haruna-call-stop'))});
  assert.equal(await page.locator('.voice-call').count(),0);assert.equal(await page.evaluate(()=>__voiceFixture.callRunning),false);
  assert.deepEqual(errors,[]);await context.close();
  console.log(`PASS voice browser ${width}px: offline UI/bridge-fake call, early TTS, mic/PCM levels, pause/resume/error/end, real DOM miniplayer/configuration/background-service-event wiring, STT list/import/select/remove wiring, header/status/catalog/footer and bounded new components.`);
 }
}finally{await browser.close();server.close()}
console.log('SIMULATION ONLY: no real microphone, ONNX/GGUF model, speech recognition or physical audio tested.');
