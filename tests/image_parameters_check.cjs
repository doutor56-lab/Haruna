// Browser-only UI checks with a mock Android image bridge, never inference.
const {chromium}=require('playwright');const fs=require('fs'),path=require('path');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
for(const [width,height]of [[360,800],[800,1280]]){
 const page=await browser.newPage({viewport:{width,height}});let errors=[];page.on('dialog',d=>d.dismiss());page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.pathname.startsWith('/generated/'))return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0e0AAAAASUVORK5CYII=','base64')});if(!u.pathname.startsWith('/assets/haruna/'))return route.fulfill({status:404,body:''});const file=path.join(path.resolve(process.env.HARUNA_SOURCE||process.cwd(),'app/src/main/assets/haruna'),u.pathname.slice('/assets/haruna/'.length));if(!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});const ext=path.extname(file);await route.fulfill({contentType:({'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.html':'text/html'})[ext]||'text/plain',body:fs.readFileSync(file)})});
 await page.addInitScript(()=>{localStorage.setItem('haruna_onboarding_v1','done');window.HarunaImages={s:{state:'INSTALLED',models:[{id:'00000000-0000-0000-0000-000000000001',name:'SD1.5 UI fixture',state:'INSTALLED'}],selected:'00000000-0000-0000-0000-000000000001',resolution:256,width:256,height:256,engineKind:'safetensors',nativeWidth:512,nativeHeight:512,maxSteps:100,cfg:7,clipSkip:-1,sampler:'default',scheduler:'default',seed:-1,negativePrompt:'',lowMemory:false,steps:5,performance:'balanced',autoSave:true,engineAvailable:true,busy:false},status(){return JSON.stringify(this.s)},result(){return '{}'},generate(id,p){this.s.busy=true;this.s.generation={request:id,state:'GENERATING'};this.s.nativeProgress=[3,2,5];return true},cancelGeneration(id){this.s.generation={request:id,state:'CANCELLED'};this.s.busy=false},configure(p){Object.assign(this.s,JSON.parse(p));return true},save(){this.s.saves=(this.s.saves||0)+1},open(id,share){this.s.opens=(this.s.opens||[]).concat(share)},add(){},cancel(){},select(){},load(){},unload(){},remove(){}}});
 await page.goto('https://appassets.androidplatform.net/assets/haruna/index.html');await page.waitForFunction(()=>window.harunaChatImages&&document.querySelector('#generateImage'));
 await page.evaluate(()=>{document.querySelector('#onboarding').hidden=true});if(await page.locator('.status-row #think').count()!==1)throw Error('Thinking not on model bar');await page.locator('#think').click();if(await page.locator('#think').getAttribute('aria-pressed')!=='true')throw Error('Thinking no longer toggles');await page.locator('#think').click();
 await page.locator('#generateImage').click();
 for(const [name,value] of [['steps','12'],['cfg','6.5']]){
  const input=page.locator('#imageGenerationPanel [data-'+name+']');
  if(!await input.isVisible())throw Error(name+' is hidden');await input.fill(value);
 }
 await page.locator('#imageGenerationPanel [data-panel-save]').click();
 const result=await page.evaluate(()=>({steps:HarunaImages.s.steps,cfg:HarunaImages.s.cfg}));
 if(result.steps!==12||result.cfg!==6.5)throw Error('Controls did not persist '+JSON.stringify(result));
 if(errors.length)throw Error(errors.join(';'));
 console.log('PASS visible + persisted steps/CFG at '+width+'x'+height+' (UI bridge fixture, no inference)');await page.close();
}await browser.close()})().catch(e=>{console.error(e);process.exit(1)});
