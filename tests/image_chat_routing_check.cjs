// Browser-only UI checks with a mock Android image bridge, never inference.
const {chromium}=require('playwright');const fs=require('fs'),path=require('path');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
for(const [width,height]of [[360,800],[800,1280]]){
 const page=await browser.newPage({viewport:{width,height}});let errors=[],alerts=[];page.on('dialog',d=>{alerts.push(d.message());d.dismiss()});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.pathname.startsWith('/generated/'))return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0e0AAAAASUVORK5CYII=','base64')});if(!u.pathname.startsWith('/assets/haruna/'))return route.fulfill({status:404,body:''});const file=path.join(path.resolve(process.env.HARUNA_SOURCE||process.cwd(),'app/src/main/assets/haruna'),u.pathname.slice('/assets/haruna/'.length));if(!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});const ext=path.extname(file);await route.fulfill({contentType:({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.html':'text/html'})[ext]||'text/plain',body:fs.readFileSync(file)})});
 await page.addInitScript(()=>{localStorage.setItem('haruna_onboarding_v1','done');window.HarunaImages={s:{state:'INSTALLED',models:[{id:'00000000-0000-0000-0000-000000000001',name:'SD1.5 UI fixture',state:'INSTALLED'}],selected:'00000000-0000-0000-0000-000000000001',resolution:256,width:256,height:256,engineKind:'safetensors',nativeWidth:512,nativeHeight:512,maxSteps:100,cfg:7,clipSkip:-1,sampler:'default',scheduler:'default',seed:-1,negativePrompt:'',lowMemory:false,steps:5,performance:'balanced',autoSave:true,engineAvailable:true,busy:false},status(){return JSON.stringify(this.s)},result(){return '{}'},generate(id,p){this.s.busy=true;this.s.generation={request:id,state:'GENERATING'};this.s.nativeProgress=[3,2,5];return true},cancelGeneration(id){this.s.generation={request:id,state:'CANCELLED'};this.s.busy=false},configure(p){Object.assign(this.s,JSON.parse(p));return true},save(){this.s.saves=(this.s.saves||0)+1},open(id,share){this.s.opens=(this.s.opens||[]).concat(share)},add(){},cancel(){},select(){},load(){},unload(){},remove(){}}});
 await page.addInitScript(()=>{
  window.textRequests=[];window.imageRequests=[];
  const generate=HarunaImages.generate.bind(HarunaImages);
  HarunaImages.generate=(id,prompt)=>{window.imageRequests.push(prompt);return generate(id,prompt)};
  window.HarunaAndroid={isAvailable:()=>true,getStatus:()=>JSON.stringify({modelLoaded:true,state:'active',modelName:'UI fixture'}),listModels:()=>'{"models":[]}',loadModel:()=> '{}',unloadModel:()=> '{}',resetConversation:()=>'{"status":"ok"}',stopGeneration:()=>'{"status":"ok"}',generate:raw=>{
   const r=JSON.parse(raw);window.textRequests.push(r);
   const classifier=r.options.conversationId.startsWith('image-intent-');
   setTimeout(()=>window.harunaAndroidOnEvent({type:'stream',requestId:r.requestId,sequence:1,delta:classifier?' {"action":"generate_image"}':'Resposta de teste.',final:{type:'completed'}}),10);
   return '{"streaming":true}';
  }};
 });
 await page.goto('https://appassets.androidplatform.net/assets/haruna/index.html');await page.waitForFunction(()=>window.harunaChatImages&&document.querySelector('#generateImage'));

 await page.evaluate(()=>document.querySelector('#onboarding').hidden=true);
 async function send(text,image=false){
  await page.locator('#input').fill(text);
  await page.evaluate(()=>document.querySelector('#composer').requestSubmit());
  if(image)await page.waitForFunction(()=>imageRequests.length>0,null,{timeout:5000});
  else await page.waitForFunction(()=>!harunaChatVoice.state().busy,null,{timeout:5000});
 }
 // Opening settings must never turn an ordinary message into an image request,
 // whether an image model is selected or missing, or however the panel closes.
 for(const selected of [null,'00000000-0000-0000-0000-000000000001']){
  await page.evaluate(selected=>HarunaImages.s.selected=selected,selected);
  for(const close of ['open','icon','cross','save']){
   await page.locator('#generateImage').click();
   if(!await page.locator('#imageGenerationPanel').isVisible())throw Error('Panel failed to open');
   if(close==='icon')await page.locator('#generateImage').click();
   if(close==='cross')await page.locator('#imageGenerationPanel [data-close]').click();
   if(close==='save')await page.locator('#imageGenerationPanel [data-panel-save]').click();
   await send('oi');
   if(alerts.length)throw Error('Greeting triggered image warning: '+alerts.join(';'));
   if(await page.evaluate(()=>imageRequests.length||harunaChatImages.entries().length))throw Error('Greeting started an image job');
   if(await page.locator('#input').inputValue())throw Error('Greeting did not enter text chat');
   if(await page.locator('#imageGenerationPanel').isVisible())await page.locator('#imageGenerationPanel [data-close]').click();
  }
 }
 await send('Como gerar uma imagem?');
 if(await page.evaluate(()=>imageRequests.length||textRequests.some(r=>r.options.conversationId.startsWith('image-intent-'))))throw Error('Ordinary text invoked image classifier or engine');
 const original='Crie uma imagem de um touro.';
 await send(original,true);
 if(!await page.evaluate(original=>JSON.stringify(imageRequests)===JSON.stringify([original])&&harunaChatImages.entries().length===1,original))throw Error('Explicit image request failed or prompt changed');
 if(alerts.length||errors.length)throw Error([...alerts,...errors].join(';'));
 console.log(`PASS ${width}x${height}: greeting stays text with panel open/icon-close/cross/save, with/without image model; question stays text; explicit request reaches image engine unchanged. Mock native inference only.`);
 await page.close();
}
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
