'use strict';
const fs=require('node:fs');const fsp=fs.promises;const path=require('node:path');const os=require('node:os');const crypto=require('node:crypto');const net=require('node:net');
const config=require('./image-config.cjs');const {inspectSdxl,inspectGguf,atomicJson,readJson}=require('./models.cjs');const {launch,stop,probe,pngDimensions}=require('./processes.cjs');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
class Controller{
 constructor({root,runtimes,publish,systemPrompt,finalizePng,pictures=path.join(os.homedir(),'Pictures','Haruna'),processLauncher=launch}){
  Object.assign(this,{root,runtimes,publish,systemPrompt,finalizePng,pictures});this.launch=processLauncher;fs.mkdirSync(root,{recursive:true});
  this.file=path.join(root,'desktop-models.json');const data=readJson(this.file,{})||{};
  this.models=Array.isArray(data.models)?data.models.filter(m=>m&&UUID.test(m.id)&&['image','llm'].includes(m.kind)&&typeof m.file==='string'):[];
  this.primary=data.primary||null;this.selected=data.selected||null;try{this.settings=config.validate(data.settings);}catch{this.settings={...config.DEFAULTS};}
  this.image={state:'INSTALLED',busy:false,generation:{}};this.llm={available:true,modelLoaded:false,state:'not_loaded',incrementalConversation:false};this.port=null;this.maintenance=false;this.closed=false;
  this.outputs=path.join(root,'generated-images');fs.mkdirSync(this.outputs,{recursive:true});
  for(const f of fs.readdirSync(this.outputs))if(f.startsWith('.work-'))fs.rmSync(path.join(this.outputs,f),{recursive:true,force:true});
 }
 save(){atomicJson(this.file,{models:this.models,primary:this.primary,selected:this.selected,settings:this.settings});}
 list(kind){return this.models.filter(m=>m.kind===kind).map(m=>({id:m.id,path:m.id,name:m.name,bytes:m.bytes,primary:m.id===this.primary,active:m.id===this.loaded,engineAvailable:fs.existsSync(this.exe('image',this.settings.backend)),state:fs.existsSync(m.file)?'INSTALLED':'MISSING'}));}
 snapshot(){return{llm:this.llm,models:this.list('llm'),images:{...this.image,models:this.list('image'),selected:this.selected,loaded:null,engine:'stable-diffusion.cpp • SDXL',engineAvailable:fs.existsSync(this.exe('image',this.settings.backend)),generationAvailable:fs.existsSync(this.exe('image',this.settings.backend)),imageEngineBusy:!!this.image.busy,nativeProgress:this.progress||[0,0,0],...this.settings},version:'0.1.0-windows-sdxl'};}
 emit(event){this.publish(this.snapshot(),event);}
 model(id,kind){const m=this.models.find(m=>m.id===id&&m.kind===kind);if(!m)throw Error('Modelo não encontrado.');if(!fs.existsSync(m.file))throw Error('O arquivo foi movido ou removido. Importe-o novamente.');return m;}
 exe(kind,backend='cpu'){const name=kind==='llm'?'llama-server.exe':'sd-cli.exe';return path.join(this.runtimes,kind==='llm'?'llama':backend,name);}
 async register(file,kind){if(this.maintenance||this.image.busy||this.request)throw Error('Aguarde a operação atual.');this.maintenance=true;try{
  const info=await(kind==='image'?inspectSdxl(file):inspectGguf(file));const absolute=path.resolve(file);let m=this.models.find(m=>m.file===absolute&&m.kind===kind);
  if(!m){m={id:crypto.randomUUID(),kind,file:absolute,name:path.basename(file).replace(/\.(safetensors|gguf)$/i,'').slice(0,100),...info};delete m.metadata;this.models.push(m);}else Object.assign(m,info);
  if(kind==='image'&&!this.selected)this.selected=m.id;if(kind==='llm'&&!this.primary)this.primary=m.id;this.save();this.emit({type:'model_import',phase:'completed',name:m.name});return m;
 }finally{this.maintenance=false;this.emit();}}
 configure(p){if(this.image.busy||this.maintenance)throw Error('Aguarde a operação atual.');this.settings=config.validate(p);this.save();this.emit();}
 select(id){this.model(id,'image');if(this.image.busy||this.maintenance)throw Error('Aguarde a geração atual.');this.selected=id;this.save();this.emit();}
 setPrimary(id){this.model(id,'llm');this.primary=id;this.save();this.emit();}
 async remove(id){if(this.image.busy||this.maintenance||this.request)throw Error('Aguarde a operação atual.');if(this.loaded===id)await this.unload();this.models=this.models.filter(m=>m.id!==id);if(this.primary===id)this.primary=null;if(this.selected===id)this.selected=null;this.save();this.emit();}
 async unload(){this.abort?.abort();if(this.server)this.server.expectedExit=true;await stop(this.server);this.server=null;this.port=null;this.loaded=null;this.llm={...this.llm,modelLoaded:false,state:'not_loaded',modelName:null,error:null};this.emit();}
 async load(id,{imageOwner=null}={}){if(this.maintenance||(this.image.busy&&this.job!==imageOwner)||this.request)throw Error('O runtime está ocupado.');this.maintenance=true;try{
  await this.unload();this.llm={...this.llm,state:'loading',modelLoaded:false};this.emit();const m=this.model(id,'llm');await inspectGguf(m.file);
  const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
  const key=crypto.randomBytes(32).toString('hex');this.apiKey=key;
  this.server=this.launch(this.exe('llm'),['--model',m.file,'--host','127.0.0.1','--port',String(port),'--api-key',key,'--ctx-size','8192','--threads','2','--threads-batch','6','--n-gpu-layers','0','--parallel','1','--no-webui']);
  this.server.child.stdout.resume();this.server.child.stderr.resume();let exited=false;const owned=this.server;
  const observeExit=()=>{exited=true;if(this.server===owned&&!owned.expectedExit){this.runtimeCrashed=true;this.abort?.abort();this.server=null;this.port=null;this.loaded=null;this.llm={...this.llm,modelLoaded:false,state:'error',error:'O processo LLM encerrou. Carregue o modelo novamente.'};this.emit();}};owned.done.then(observeExit,observeExit);
  for(let i=0;i<600;i++){if(this.closed||exited)throw Error('O modelo não pôde ser carregado pelo llama.cpp.');try{const r=await fetch(`http://127.0.0.1:${port}/health`,{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(1500)});if(r.ok&&!exited&&this.server===owned&&!this.closed){this.port=port;this.loaded=id;this.llm={...this.llm,modelLoaded:true,state:'active',modelName:m.name,error:null};this.emit({type:'model_import',phase:'ready',name:m.name});return;}}catch{}await wait(200);}
  throw Error('Tempo de carregamento excedido.');
 }catch(e){await this.unload();this.llm={...this.llm,state:'error',error:e.message};this.emit({type:'model_import',phase:'error',error:e.message});throw e;}finally{this.maintenance=false;}}
 generate(payload){if(this.closed||this.maintenance||this.image.busy||this.request||!this.port||!this.llm.modelLoaded)throw Error('Carregue um GGUF e aguarde a operação atual.');if(!payload||typeof payload.requestId!=='string'||!payload.requestId.trim()||payload.requestId.length>120||!Array.isArray(payload.messages)||payload.messages.length>128)throw Error('Solicitação inválida.');
  const messages=payload.messages.map(m=>{if(!['user','assistant','system'].includes(m.role)||typeof m.content!=='string'||m.content.length>60000)throw Error('Mensagem inválida.');return{role:m.role,content:m.content};});
  if(messages.reduce((n,m)=>n+m.content.length,0)>200000)throw Error('Contexto muito grande.');
  const id=payload.requestId,abort=new AbortController();this.runtimeCrashed=false;this.abort=abort;this.request=id;this.llm.state='generating';this.emit();
  this.runChat(id,messages,payload.options||{},abort).catch(()=>{});return true;
 }
 async runChat(id,messages,options,abort){let seq=0;const send=(delta,final)=>this.emit({type:'stream',requestId:id,sequence:++seq,delta,...(final?{final}:{})});try{
  const model=this.model(this.loaded,'llm');const extra=typeof options.essentialContext==='string'?options.essentialContext.slice(0,16000):'';
  const all=[{role:'system',content:this.systemPrompt(path.basename(model.file))+(extra?'\n'+extra:'')},...messages];
  const requestedTokens=Number(options.maxTokens);const maxTokens=Number.isFinite(requestedTokens)?Math.max(1,Math.min(2048,Math.trunc(requestedTokens))):256;
  const response=await fetch(`http://127.0.0.1:${this.port}/v1/chat/completions`,{method:'POST',signal:abort.signal,headers:{'Content-Type':'application/json',Authorization:`Bearer ${this.apiKey}`},body:JSON.stringify({messages:all,stream:true,max_tokens:maxTokens,temperature:0.3,top_k:40,top_p:0.95,min_p:0.05,repeat_penalty:1,chat_template_kwargs:{enable_thinking:options.enableThinking===true}})});
  if(!response.ok)throw Error('O llama.cpp recusou a geração.');let pending='',seenFinal=false;const decoder=new TextDecoder();
  for await(const chunk of response.body){if(this.closed||this.request!==id)break;pending+=decoder.decode(chunk,{stream:true});if(pending.length>262144)throw Error('Stream nativo inválido.');const lines=pending.split('\n');pending=lines.pop();for(const line of lines){if(!line.startsWith('data:'))continue;const data=line.slice(5).trim();if(!data)continue;if(data==='[DONE]'){seenFinal=true;continue;}const event=JSON.parse(data);if(event.choices?.[0]?.finish_reason)seenFinal=true;const text=event.choices?.[0]?.delta?.content;if(typeof text==='string'&&text)send(text);}}
  if(!seenFinal&&!abort.signal.aborted)throw Error('O runtime encerrou a resposta sem finalização.');
  send('',this.runtimeCrashed?{type:'error',code:'runtime_crashed',message:'O motor GGUF encerrou inesperadamente. Carregue o modelo novamente.'}:abort.signal.aborted?{type:'error',code:'cancelled',message:'Geração cancelada.'}:{type:'completed'});
 }catch(e){const crashed=this.runtimeCrashed;send('',{type:'error',code:crashed?'runtime_crashed':abort.signal.aborted?'cancelled':'generation_failed',message:crashed?'O motor GGUF encerrou inesperadamente. Carregue o modelo novamente.':abort.signal.aborted?'Geração cancelada.':e.message});}
 finally{if(this.request===id){this.request=null;this.abort=null;this.llm.state=this.llm.modelLoaded?'active':this.llm.error?'error':'not_loaded';this.emit();}}
 }
 cancelChat(id){if(this.request===id)this.abort?.abort();}
 startImage(id,prompt){if(this.closed||this.image.busy||this.maintenance||this.request||!UUID.test(id)||typeof prompt!=='string'||!prompt.trim()||prompt.length>2000||fs.existsSync(path.join(this.outputs,id+'.json'))||fs.existsSync(path.join(this.outputs,id+'.png')))return false;
  this.model(this.selected,'image');this.job=id;this.cancelled=false;this.image={state:'LOADING',busy:true,generation:{request:id,state:'LOADING'}};this.progress=[1,0,this.settings.steps];this.emit();this.imageTask=this.runImage(id,prompt).catch(()=>{}).finally(()=>{this.imageTask=null;});return true;
 }
 async runImage(id,prompt){const restoreId=this.loaded;const work=path.join(this.outputs,'.work-'+id);const final=path.join(this.outputs,id+'.png');let p;
  try{await this.unload();if(this.cancelled)throw Error('Geração cancelada.');const model=this.model(this.selected,'image');await inspectSdxl(model.file);const settings=config.validate(this.settings),native=config.nativeSize(settings);
   if(os.freemem()<2*1024**3)throw Error('Memória livre insuficiente; feche outros aplicativos antes de gerar SDXL.');await fsp.mkdir(work);const promptFile=path.join(work,'prompt.txt'),negativeFile=path.join(work,'negative.txt'),output=path.join(work,'native.png');await fsp.writeFile(promptFile,prompt,{mode:0o600});await fsp.writeFile(negativeFile,settings.negativePrompt,{mode:0o600});
   if(this.cancelled)throw Error('Geração cancelada.');p=this.launch(this.exe('image',settings.backend),config.command({model:model.file,promptFile,negativeFile,output,settings}));this.imageProcess=p;let tail='',technical='',denoising=false;
   const consume=chunk=>{tail=(tail+chunk.toString()).slice(-4096);const begin=tail.lastIndexOf('generating image:'),end=Math.max(tail.lastIndexOf('sampling completed'),tail.lastIndexOf('decoding '));if(begin>end)denoising=true;else if(end>=0){denoising=false;this.progress=[4,this.progress?.[1]||0,settings.steps];this.emit();}const matches=[...tail.matchAll(/(?:^|[\r\n\s|])(\d+)\s*\/\s*(\d+)\s*[-|]/g)];const m=matches.at(-1);if(m&&denoising&&Number(m[2])===settings.steps&&Number(m[1])<=settings.steps){this.progress=[3,Number(m[1]),settings.steps];this.image.state='GENERATING';this.image.generation.state='GENERATING';this.emit();tail=tail.slice(m.index+m[0].length);}if(/out of memory|not enough memory|bad_alloc|allocation failed/i.test(tail))technical='memoria';else if(/VK_ERROR|vulkan.*failed/i.test(tail))technical='vulkan';};
   p.child.stdout.on('data',consume);p.child.stderr.on('data',consume);const result=await p.done;this.imageProcess=null;
   if(this.cancelled||this.closed)throw Error('Geração cancelada.');if(result.code!==0)throw Error(technical==='memoria'?'O motor ficou sem memória. Reduza a resolução ou use CPU com pouca memória.':technical==='vulkan'?'Falha no driver Vulkan. Selecione CPU ou atualize o driver AMD.':'O motor SDXL falhou. Confira o checkpoint e a memória disponível.');
   const size=pngDimensions(output);if(size.width!==native.width||size.height!==native.height)throw Error('O motor retornou uma resolução diferente da solicitada.');this.progress=[5,settings.steps,settings.steps];this.emit();await this.finalizePng(output,final,settings);if(this.cancelled||this.closed){await fsp.rm(final,{force:true});throw Error('Geração cancelada.');}
   this.image.generation={request:id,state:'COMPLETED',file:id+'.png',outputWidth:settings.width,outputHeight:settings.height,nativeWidth:native.width,nativeHeight:native.height,steps:settings.steps,backendRequested:settings.backend};
   if(settings.autoSave){try{const pictures=this.pictures;await fsp.mkdir(pictures,{recursive:true});await fsp.copyFile(final,path.join(pictures,id+'.png'),fs.constants.COPYFILE_EXCL);}catch{this.image.generation.saveWarning='PNG salvo na Haruna; não foi possível copiar para Imagens/Haruna.';}}
  }catch(e){this.image.generation={request:id,state:this.cancelled||this.closed?'CANCELLED':'ERROR',error:this.cancelled||this.closed?'Geração cancelada.':e.message};}
  finally{
   // Native image .close was observed before this boundary: never reload GGUF
   // while its image process still owns CPU/GPU model resources.
   this.imageProcess=null;await fsp.rm(work,{recursive:true,force:true}).catch(()=>{this.image.generation.cleanupWarning=true;});
   if(restoreId&&!this.closed){this.image.state='RESTORING_LLM';this.emit();try{await this.load(restoreId,{imageOwner:id});}catch{this.image.generation.restoreWarning='Imagem finalizada; não foi possível recarregar o GGUF anterior. Carregue-o novamente em Configurações.';}}
   try{atomicJson(path.join(this.outputs,id+'.json'),this.image.generation);}catch{this.image.generation.saveWarning='Não foi possível persistir os metadados da imagem.';}this.image.busy=false;this.image.state=this.image.generation.state==='ERROR'?'ERROR':'INSTALLED';this.job=null;this.emit();
  }
 }
 cancelImage(id){if(this.job!==id)return;this.cancelled=true;this.imageProcess?.child.kill();}
 result(id){const r=UUID.test(id)?readJson(path.join(this.outputs,id+'.json'),{}):{};return r&&typeof r==='object'&&!Array.isArray(r)?r:{};}
 async devices(){const out=await probe(this.exe('image','vulkan'),['--list-devices']);return out.split(/\r?\n/).filter(l=>/^\s*vulkan\d*[:\t]/i.test(l)).slice(0,8).map(l=>l.trim().slice(0,240));}
 async shutdown(){this.closed=true;this.cancelImage(this.job);this.abort?.abort();await Promise.allSettled([stop(this.imageProcess),this.unload()]);if(this.imageTask)await this.imageTask;}
}
module.exports={Controller,UUID};
