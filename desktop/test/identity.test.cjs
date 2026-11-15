'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const{CONFIG,systemPrompt}=require('../src/identity.cjs');
const{ggufTensors}=require('../src/image-components.cjs');
test('shared identity distinguishes application developer and declared model origin',async()=>{
 const canonical=JSON.parse(fs.readFileSync(path.join(__dirname,'../../app/src/main/assets/haruna/identity/config.json'),'utf8'));
 assert.deepEqual(CONFIG,canonical);assert.equal(CONFIG.developer,'Proxys Labs');
 for(const metadata of [{},{name:'Model A',author:'Fornecedor A',license:'apache-2.0'},{name:'Model B',organization:'Fornecedor B',license:'mit'}]){
  const prompt=systemPrompt('selected.gguf',metadata);assert(prompt.startsWith('Você é Haruna'));assert(prompt.includes('Proxys Labs'));assert(prompt.includes('não prova de origem'));assert(prompt.includes('nem parceria ou afiliação'));assert(prompt.includes(JSON.stringify(metadata)));
 }
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'haruna-model-identity-'));
 try{
  const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b},u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b},str=s=>Buffer.concat([u64(Buffer.byteLength(s)),Buffer.from(s)]);
  const entries={'general.name':'Test model','general.author':'Fornecedor real declarado','general.license':'apache-2.0','general.url':'https://example.test/model','tokenizer.chat_template':'not identity metadata'};
  const file=path.join(dir,'Misleading-OpenAI.gguf');fs.writeFileSync(file,Buffer.concat([Buffer.from('GGUF'),u32(3),u64(1),u64(Object.keys(entries).length),...Object.entries(entries).map(([k,v])=>Buffer.concat([str(k),u32(8),str(v)]))]));
  const metadata=await ggufTensors(file,{metadataOnly:true});assert.equal(metadata.author,entries['general.author']);assert.equal(metadata.url,entries['general.url']);assert.equal(metadata.license,'apache-2.0');assert(!Object.hasOwn(metadata,'tokenizer.chat_template'));assert(!systemPrompt(path.basename(file),metadata).includes('desenvolvida pela OpenAI'));
  fs.writeFileSync(file,'GGUF');await assert.rejects(ggufTensors(file,{metadataOnly:true}));
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
 for(const file of CONFIG.licenseFiles)assert(fs.existsSync(path.join(__dirname,'../../app/src/main/assets/licenses',file)),file);
});

test('actual controller reinjects system identity after model switch and restoring saved conversation (fake runtime)',async()=>{
 const {Controller}=require('../src/controller.cjs'),http=require('node:http'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'haruna-identity-session-')),captured=[];let controller;
 const launch=(exe,args)=>{const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.exitCode=null;let resolve;const done=new Promise(r=>resolve=r);const server=http.createServer((req,res)=>{if(req.url==='/health')return res.end('{}');if(req.url==='/props')return res.end('{}');let body='';req.on('data',c=>body+=c);req.on('end',()=>{captured.push(JSON.parse(body));res.setHeader('Content-Type','text/event-stream');res.end('data: '+JSON.stringify({choices:[{delta:{content:'fixture'}}]})+'\n\ndata: [DONE]\n\n')});});server.listen(Number(args[args.indexOf('--port')+1]),'127.0.0.1');child.kill=()=>{server.closeAllConnections();server.close(()=>{child.exitCode=0;resolve({code:0})});return true};return{child,done}};
 const make=()=>new Controller({root,runtimes:root,publish:()=>{},systemPrompt,finalizePng:()=>{},processLauncher:launch});
 const wait=async()=>{for(let i=0;i<1000&&controller.request;i++)await new Promise(r=>setTimeout(r,5));assert(!controller.request)};
 try{
  const string=s=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(Buffer.byteLength(s)));return Buffer.concat([b,Buffer.from(s)])};
  const files=['A','B'].map(letter=>{const head=Buffer.alloc(24);head.write('GGUF');head.writeUInt32LE(3,4);head.writeBigUInt64LE(1n,8);head.writeBigUInt64LE(1n,16);const type=Buffer.alloc(4);type.writeUInt32LE(8);const file=path.join(root,letter+'.gguf');fs.writeFileSync(file,Buffer.concat([head,string('general.author'),type,string('Fornecedor '+letter),Buffer.alloc(2048)]));return file});
  fs.mkdirSync(path.join(root,'llama-vulkan'),{recursive:true});fs.writeFileSync(path.join(root,'llama-vulkan/llama-server.exe'),'fake');controller=make();const models=[];for(const file of files)models.push(await controller.register(file,'llm'));
  const history=[{role:'user',content:'Oi'},{role:'assistant',content:'Olá'},{role:'user',content:'Quem criou você e qual modelo usa?'}];
  for(const model of models){await controller.load(model.id);controller.generate({requestId:model.id,messages:history,options:{conversationId:'saved-chat'}});await wait();const sent=captured.at(-1).messages;assert.equal(sent[0].role,'system');assert(sent[0].content.includes('Proxys Labs'));assert(sent[0].content.includes('Fornecedor '+path.basename(model.file,'.gguf')));assert.deepEqual(sent.slice(1),history)}
  await controller.shutdown();controller=make();assert.equal(controller.lastModel,models[1].id);await controller.load(controller.lastModel);controller.generate({requestId:'restored',messages:history,options:{conversationId:'saved-chat'}});await wait();assert(captured.at(-1).messages[0].content.includes('Fornecedor B'));assert(!captured.at(-1).messages[0].content.includes('Fornecedor A'));assert.deepEqual(captured.at(-1).messages.slice(1),history);
 }finally{await controller?.shutdown();fs.rmSync(root,{recursive:true,force:true})}
});
