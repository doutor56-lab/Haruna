'use strict';
const{app,BrowserWindow,ipcMain,protocol,dialog,shell,nativeImage}=require('electron');
const path=require('node:path');const fs=require('node:fs');const fsp=fs.promises;const crypto=require('node:crypto');
const{Controller,UUID}=require('./controller.cjs');const config=require('./image-config.cjs');const{atomicJson,readJson}=require('./models.cjs');const{probe}=require('./processes.cjs');const{systemPrompt}=require('./identity.cjs');
const smoke=process.argv.includes('--smoke-test');const smokeRoot=process.env.HARUNA_SMOKE_OUTPUT||path.join(process.cwd(),'smoke-output');if(smoke)app.disableHardwareAcceleration();
app.setName('Haruna Windows');app.setAppUserModelId('com.proxyslabs.haruna.windows');
app.setPath('userData',smoke?path.join(smokeRoot,'user-data'):path.join(app.getPath('appData'),'Haruna Windows'));
protocol.registerSchemesAsPrivileged([{scheme:'haruna',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
if(!app.requestSingleInstanceLock()){app.quit();}else{app.on('second-instance',()=>{window?.restore();window?.focus();});app.whenReady().then(start).catch(e=>{console.error(e.message);app.exit(1);});}
let window,controller,closing=false;const base=path.resolve(__dirname,'..');const runtimes=app.isPackaged?path.join(process.resourcesPath,'runtimes'):path.join(base,'runtimes');
function trusted(event){if(event.sender!==window?.webContents||!event.senderFrame?.url.startsWith('haruna://app/'))throw Error('Origem não permitida.');}
function push(snapshot,event){if(window&&!window.isDestroyed())window.webContents.send('haruna:update',{snapshot,event});}
function safeImage(id){if(!UUID.test(id))throw Error('Imagem inválida.');const file=path.join(controller.outputs,id+'.png');if(!fs.existsSync(file))throw Error('PNG não encontrado.');return file;}
async function pick(kind){const result=await dialog.showOpenDialog(window,{title:kind==='image'?'Importar checkpoint SDXL completo':'Importar modelo GGUF',properties:['openFile'],filters:[{name:kind==='image'?'Checkpoint SDXL / Illustrious (safetensors)':'Modelo GGUF',extensions:[kind==='image'?'safetensors':'gguf']}]});if(result.canceled){controller.emit({type:'model_import',phase:'cancelled'});return;}const m=await controller.register(result.filePaths[0],kind);if(kind==='llm'){controller.emit({type:'model_import',phase:'loading',name:m.name});await controller.load(m.id);}}
async function finalizePng(input,output,p){const image=nativeImage.createFromPath(input);if(image.isEmpty())throw Error('PNG inválido.');const size=image.getSize();if(size.width<p.width||size.height<p.height)throw Error('Imagem nativa menor que a solicitada.');const clipped=image.crop({x:Math.floor((size.width-p.width)/2),y:Math.floor((size.height-p.height)/2),width:p.width,height:p.height});const temp=output+'.part';await fsp.writeFile(temp,clipped.toPNG());await fsp.rename(temp,output);}
async function start(){
 const root=app.getPath('userData');controller=new Controller({root,runtimes,publish:push,systemPrompt,finalizePng,pictures:path.join(app.getPath('pictures'),'Haruna')});
 const attachments=path.join(root,'attachments');fs.mkdirSync(attachments,{recursive:true});
 const attachment=id=>{if(!UUID.test(id))throw Error('Anexo inválido.');return path.join(attachments,id+'.txt');};
 ipcMain.on('haruna:snapshot',(event)=>{try{trusted(event);const snapshot=controller.snapshot();snapshot.results={};for(const f of fs.readdirSync(controller.outputs).filter(n=>n.endsWith('.json'))){const id=f.slice(0,-5);if(UUID.test(id))snapshot.results[id]=controller.result(id);}event.returnValue=snapshot;}catch{event.returnValue={llm:{available:false},images:{},models:[]};}});
 ipcMain.on('haruna:small',(event,{op,args=[]}={})=>{try{trusted(event);let result={status:'ok'};switch(op){case'configure':controller.configure(typeof args[0]==='string'?JSON.parse(args[0]):args[0]);break;case'preset':result=config.preset(...args);break;case'imageResult':result=controller.result(args[0]);break;case'primary':controller.setPrimary(args[0]);break;case'selectImage':controller.select(args[0]);break;case'readAttachment':{const file=attachment(args[0]);if(fs.statSync(file).size>2*1024*1024)throw Error('Anexo muito grande.');result={status:'ok',text:fs.readFileSync(file,'utf8')};break;}case'deleteAttachment':fs.rmSync(attachment(args[0]),{force:true});break;default:throw Error('Operação indisponível.');}event.returnValue=JSON.stringify(result);}catch(e){event.returnValue=JSON.stringify({status:'error',error:e.message});}});
 ipcMain.handle('haruna:devices',async event=>{trusted(event);try{return{devices:await controller.devices()};}catch(e){return{devices:[],error:e.message};}});
 ipcMain.handle('haruna:command',async(event,{op,args=[]}={})=>{trusted(event);try{switch(op){
  case'pickSdxl':return await pick('image');case'pickGguf':return await pick('llm');case'load':return await controller.load(args[0]);case'remove':return await controller.remove(args[0]);
  case'unload':if(controller.image.busy||controller.maintenance||controller.request)throw Error('Aguarde a operação atual ou cancele a resposta antes de descarregar o GGUF.');return await controller.unload();
  case'chat':return controller.generate(args[0]);case'cancelChat':return controller.cancelChat(args[0]);
  case'image':if(!controller.startImage(...args))throw Error('O motor está ocupado.');return true;case'cancelImage':return controller.cancelImage(args[0]);
  case'openImage':{const file=safeImage(args[0]);return args[1]?shell.showItemInFolder(file):shell.openPath(file);}
  case'saveImage':{const file=safeImage(args[0]);const r=await dialog.showSaveDialog(window,{title:'Salvar imagem',defaultPath:path.join(app.getPath('pictures'),args[0]+'.png'),filters:[{name:'PNG',extensions:['png']}]});if(!r.canceled&&r.filePath&&path.resolve(r.filePath)!==file)await fsp.copyFile(file,r.filePath);return;}
  case'pickAttachment':{const r=await dialog.showOpenDialog(window,{properties:['openFile'],filters:[{name:'Texto local (até 2 MiB)',extensions:['txt','md','csv','json','log']}]});if(r.canceled)return;const file=r.filePaths[0];const stat=await fsp.stat(file);if(stat.size>2*1024*1024)throw Error('Anexos de texto aceitam até 2 MiB nesta versão Windows.');const id=crypto.randomUUID();await fsp.copyFile(file,attachment(id));controller.emit({type:'attachment',status:'ok',name:path.basename(file),path:id,bytes:stat.size});return;}
  case'unsupportedDownload':throw Error('No Windows, baixe o GGUF da fonte escolhida e use Adicionar modelo GGUF.');default:throw Error('Operação indisponível.');
 }}catch(e){if(op==='chat'&&args[0]?.requestId){controller.emit({type:'stream',requestId:args[0].requestId,sequence:1,delta:'',final:{type:'error',code:'runtime_error',message:e.message}});}else if(op==='image'){controller.emit({type:'image-rejected',request:args[0],error:e.message});}else controller.emit({type:'model_import',phase:'error',error:e.message});throw e;}});
 const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
 protocol.handle('haruna',async request=>{try{const url=new URL(request.url);if(url.host!=='app'||request.method!=='GET')return new Response('',{status:403});const name=decodeURIComponent(url.pathname);let file;
  if(name.startsWith('/generated/')){const id=name.slice('/generated/'.length).replace(/\.png$/,'');if(!name.endsWith('.png'))return new Response('',{status:404});file=safeImage(id);}
  else{const prefix=name.startsWith('/assets/haruna/')?'/assets/haruna/':name.startsWith('/desktop/')?'/desktop/':null;if(!prefix)return new Response('',{status:404});const rootDir=path.join(base,prefix==='/desktop/'?'renderer':'ui');const rel=name.slice(prefix.length);if(!rel||rel.includes('\\')||rel.split('/').some(x=>x==='..'||x==='.'||x===''))return new Response('',{status:403});file=path.join(rootDir,rel);}
  const data=await fsp.readFile(file);return new Response(data,{headers:{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Security-Policy':"default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-src 'none'",'X-Content-Type-Options':'nosniff'}});
 }catch{return new Response('',{status:404});}});
 window=new BrowserWindow({width:1180,height:880,minWidth:740,minHeight:600,title:'Haruna',icon:path.join(base,'renderer','haruna.ico'),backgroundColor:'#080c17',show:!smoke,autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',(event,url)=>{if(url!=='haruna://app/assets/haruna/index.html')event.preventDefault();});
 await window.loadURL('haruna://app/assets/haruna/index.html');
 if(smoke){await runSmoke();await controller.shutdown();app.exit(0);}
 app.on('activate',()=>{window?.show();});
}
async function runSmoke(){
 const output=smokeRoot;fs.mkdirSync(output,{recursive:true});
 const flags=await probe(controller.exe('image','cpu'),['--help']);
 for(const f of ['--prompt-file','--negative-prompt-file','--clip-skip','--vae-tiling','--params-backend','--backend'])
  if(!flags.includes(f))throw Error('Missing SDXL CLI flag: '+f);
 await probe(controller.exe('llm'),['--version']);
 if(!fs.existsSync(controller.exe('image','vulkan')))throw Error('Pinned Vulkan runtime not present in packaged application.');
 const inspect=()=>window.webContents.executeJavaScript("({title:document.querySelector('h1')?.textContent,images:!!window.HarunaImages,chat:!!window.harunaChatImages,chatReady:window.__HARUNA_CHAT_READY__===true,imageButton:!!document.querySelector('#generateImage'),imageSettings:!!document.querySelector('.image-settings-card'),imagePanel:!!document.querySelector('#imageGenerationPanel'),vulkanSelector:!!document.querySelector('#desktopVulkanSettings select'),node:typeof require})");
 let state;
 for(let i=0;i<40;i++){
  state=await inspect();
  if(state.chatReady&&state.imageButton&&state.imageSettings&&state.imagePanel&&state.vulkanSelector)break;
  await new Promise(r=>setTimeout(r,150));
 }
 if(state.title!=='Haruna'||!state.images||!state.chat||!state.chatReady||!state.imageButton||!state.imageSettings||!state.imagePanel||!state.vulkanSelector||state.node!=='undefined')
  throw Error('Android UI to Windows bootstrap failed: '+JSON.stringify(state));
 await window.webContents.executeJavaScript("localStorage.setItem('haruna_onboarding_v1','done');document.querySelector('#onboarding').hidden=true;document.querySelector('#generateImage').click()");
 const view=await window.webContents.executeJavaScript("document.querySelector('#imageGenerationPanel').open");
 if(!view)throw Error('Android image generation panel did not open');
 await window.webContents.executeJavaScript("(()=>{const panel=document.querySelector('#imageGenerationPanel');const ratio=panel.querySelector('[data-ratio-select]');ratio.value='3:5';ratio.dispatchEvent(new Event('change',{bubbles:true}));const quality=panel.querySelector('[data-quality-select]');quality.value='M';quality.dispatchEvent(new Event('change',{bubbles:true}));})()");
 const dimensions=await window.webContents.executeJavaScript("({width:Number(document.querySelector('#imageGenerationPanel [name=width]').value),height:Number(document.querySelector('#imageGenerationPanel [name=height]').value)})");
 if(dimensions.width!==768||dimensions.height!==1280)throw Error('Android image ratio preset 768x1280 failed');
 await window.webContents.executeJavaScript("document.querySelector('#imageGenerationPanel form').requestSubmit()");
 if(controller.settings.width!==768||controller.settings.height!==1280)throw Error('Android image dimensions did not persist in Windows controller');
 const reloaded=new Promise(resolve=>window.webContents.once('did-finish-load',resolve));
 window.webContents.reload();await reloaded;
 for(let i=0;i<40;i++){state=await inspect();if(state.chatReady&&state.imagePanel&&state.vulkanSelector)break;await new Promise(r=>setTimeout(r,150));}
 if(!state.chatReady||!state.imagePanel||!state.vulkanSelector)throw Error('Desktop UI failed to restore after reload');
 await window.webContents.executeJavaScript("window.harunaOpenImagePanel();document.querySelector('#imageGenerationPanel [data-orientation=landscape]').click()");
 const landscape=await window.webContents.executeJavaScript("({width:Number(document.querySelector('#imageGenerationPanel [name=width]').value),height:Number(document.querySelector('#imageGenerationPanel [name=height]').value)})");
 if(landscape.width!==1280||landscape.height!==768)throw Error('Android image resolution changed after Windows reload');
 const bitmap=nativeImage.createFromBitmap(Buffer.alloc(864*1408*4,128),{width:864,height:1408});
 const nativeFile=path.join(output,'crop-fixture.png'),croppedFile=path.join(output,'crop-840x1400.png');
 await fsp.writeFile(nativeFile,bitmap.toPNG());await finalizePng(nativeFile,croppedFile,{width:840,height:1400});
 const cropped=nativeImage.createFromPath(croppedFile).getSize();
 if(cropped.width!==840||cropped.height!==1400)throw Error('Exact output crop failed');
 await fsp.writeFile(path.join(output,'dimensions.png'),(await window.webContents.capturePage()).toPNG());
 atomicJson(path.join(output,'WINDOWS_SMOKE.json'),{...state,windows:process.platform,arch:process.arch,sdCliHelp:true,llamaVersion:true,vulkanRuntimePresent:true,dimensionsPreset:dimensions,landscapePreset:landscape,exactOutputCrop:cropped,realImageGenerated:false,modelInference:'Not executed; actual checkpoint and GPU validation required.'});
}
app.on('before-quit',event=>{if(closing||!controller)return;event.preventDefault();closing=true;controller.shutdown().finally(()=>app.quit());});app.on('window-all-closed',()=>app.quit());
