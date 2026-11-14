'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const settings=require('../src/inference-config.cjs'),{Controller}=require('../src/controller.cjs');
test('Overdrive per-model bounds, SmolLM3 auto policy and classifier output budget',()=>{
 const smol=settings.resolve('SmolLM3-Q4_K_M'),qwen=settings.resolve('qwen3.5-2b');
 assert.equal(smol.temperature,.6);assert.equal(smol.flashAttention,'off');assert.equal(qwen.flashAttention,'auto');
 assert.deepEqual([settings.configured(smol,'SmolLM3',8).threads,settings.configured(smol,'SmolLM3',8).threadsBatch],[6,6]);
 assert.equal(settings.configured({...smol,threads:3},'SmolLM3',8).threads,3);
 assert.equal(settings.configured(qwen,'qwen3.5-2b',8).threadsBatch,6);
 for(const change of [{seed:4294967295},{threads:17},{nUbatch:1024},{nBatch:64,nUbatch:128},{nCtx:1024,maxTokens:1024},{topP:0},{temperature:NaN},{topK:'40'},{flashAttention:'fake'}])assert.throws(()=>settings.validate({...smol,...change}));
 const sampling=settings.sampling({...smol,seed:424242},64);assert.equal(sampling.seed,424242);assert.equal(sampling.max_tokens,64);assert.equal(sampling.temperature,.6);
});
function fakeGguf(file){
 const str=s=>{const b=Buffer.from(s),n=Buffer.alloc(8);n.writeBigUInt64LE(BigInt(b.length));return Buffer.concat([n,b]);};
 const head=Buffer.alloc(24);head.write('GGUF');head.writeUInt32LE(3,4);head.writeBigUInt64LE(1n,8);head.writeBigUInt64LE(1n,16);
 const type=Buffer.alloc(4);type.writeUInt32LE(8);fs.writeFileSync(file,Buffer.concat([head,str('general.architecture'),type,str('smollm3'),Buffer.alloc(2048)]));
}
test('Windows preferences persist per model; native flags reload, warm prefix and SSE observations (fake native/HTTP)',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'haruna-inference-')),launches=[],events=[];let c;
 try{
  const file=path.join(root,'SmolLM3-fixture.gguf');fakeGguf(file);
  c=new Controller({root,runtimes:root,systemPrompt:()=> 'STATIC_ONLY',publish:(s,e)=>{if(e)events.push(e)},finalizePng:()=>{},processLauncher:(exe,args)=>{
   launches.push(args);const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.exitCode=null;child.signalCode=null;
   let resolve;const done=new Promise(r=>resolve=r),port=Number(args[args.indexOf('--port')+1]);
   const server=http.createServer((req,res)=>{let raw='';req.on('data',b=>raw+=b);req.on('end',()=>{
    const body=raw?JSON.parse(raw):{};
    if(req.url==='/health')return res.end('{}');
    if(req.url==='/props')return res.end(JSON.stringify({default_generation_settings:{n_ctx:Number(args[args.indexOf('--ctx-size')+1])}}));
    if(req.url==='/apply-template'){assert.deepEqual(body.messages,[{role:'system',content:'STATIC_ONLY'}]);return res.end(JSON.stringify({prompt:'FORMATTED_STATIC_FIXTURE'}));}
    if(req.url==='/tokenize')return res.end(JSON.stringify({tokens:Array.from({length:100},(_,i)=>i)}));
    if(req.url==='/completion'){assert.equal(body.n_predict,0);assert.equal(body.prompt.length,84);return res.end(JSON.stringify({tokens_evaluated:84}));}
    assert.equal(body.cache_prompt,true);assert.equal(body.id_slot,0);assert.equal(body.stream_options.include_usage,true);assert.equal(body.max_tokens,64);assert.equal(body.temperature,.45);assert.equal(body.seed,42);assert.equal(body.messages[1].content,'PRIVATE_FIXTURE_NOT_EXPORTED');
    res.setHeader('Content-Type','text/event-stream');res.end('data: '+JSON.stringify({choices:[{delta:{content:'ok'},finish_reason:'stop'}],timings:{prompt_n:16,prompt_ms:12,predicted_ms:3},usage:{prompt_tokens:100,completion_tokens:1,prompt_tokens_details:{cached_tokens:84}}})+'\n\ndata: [DONE]\n\n');
   })});server.listen(port,'127.0.0.1');child.kill=()=>{server.close(()=>{child.exitCode=0;resolve({code:0})});return true};return{child,done};
  }});
  fs.mkdirSync(path.dirname(c.exe('llm')),{recursive:true});fs.writeFileSync(c.exe('llm'),'FAKE');const m=await c.register(file,'llm');await c.load(m.id);
  assert.equal(c.observation.runtime.startup.systemPrefixTokens,84);assert.equal(c.observation.runtime.nCtx,8192);
  const value={...c.inferenceSettings().settings,temperature:.45,seed:42,nCtx:4096,threads:3,threadsBatch:4};c.configureInference(value);assert.equal(launches.length,1);assert.equal(c.llm.settingsPending,true);
  assert.equal(new Controller({root,runtimes:root,publish:()=>{}}).inferenceProfiles[m.id].temperature,.45);
  c.generate({requestId:'settings',messages:[{role:'user',content:'PRIVATE_FIXTURE_NOT_EXPORTED'}],options:{maxTokens:64}});
  assert.throws(()=>c.configureInference(value),/Aguarde/);
  for(let i=0;c.request&&i<500;i++)await new Promise(r=>setTimeout(r,10));assert.equal(c.request,null);
  assert.equal(events.filter(e=>e.requestId==='settings').at(-1).final.type,'completed');assert.equal(launches.length,2);const a=launches[1];assert.equal(a[a.indexOf('--ctx-size')+1],'4096');assert.equal(a[a.indexOf('--threads')+1],'3');assert.equal(a[a.indexOf('--threads-batch')+1],'4');assert.equal(a[a.indexOf('--flash-attn')+1],'off');assert(a.includes('--jinja'));
  assert.equal(c.observation.prefix.reusedTokens,84);assert.equal(c.observation.generation.prefillTokens,16);assert.equal(c.llm.settingsPending,false);assert(!JSON.stringify(c.inferenceSettings()).includes('PRIVATE_FIXTURE'));
  c.configureInference({...value,temperature:.5});assert.equal(c.llm.settingsPending,false,'sampler change must preserve native context');c.configureInference({restoreDefaults:true});assert.equal(c.inferenceSettings().settings.profile,'smollm3');
 }finally{await c?.shutdown();fs.rmSync(root,{recursive:true,force:true});}
});
