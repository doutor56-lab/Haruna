// Opt-in REAL llama-server check. Requires the existing tiny RANDOM fixture,
// never a user's checkpoint: see tests/native/make_smollm3_fixture.py.
'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const{Controller}=require('../src/controller.cjs'),settings=require('../src/inference-config.cjs');
async function check(executable,fixture){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'haruna-native-overdrive-')),events=[];
 const system='Static harmless engineering fixture. '.repeat(12),messages=[{role:'user',content:'Public fixture only'}];
 const c=new Controller({root,runtimes:root,publish:(s,e)=>{if(e)events.push(e)},systemPrompt:()=>system,finalizePng:()=>{}});c.exe=()=>path.resolve(executable);
 try{
  const m=await c.register(path.resolve(fixture),'llm');m.name='SmolLM3 RANDOM fixture';c.settings.llmBackend='cpu';await c.load(m.id);
  assert.equal(c.nativeArchitecture,'smollm3');assert(c.observation.runtime.startup.systemPrefixTokens>0);
  c.configureInference({...c.inferenceSettings().settings,threads:2,threadsBatch:2,seed:424242,maxTokens:16,temperature:0});
  const run=async id=>{c.generate({requestId:id,messages,options:{enableThinking:false}});for(let i=0;c.request&&i<3000;i++)await new Promise(r=>setTimeout(r,10));assert.equal(c.request,null);const stream=events.filter(e=>e.requestId===id);assert.equal(stream.at(-1).final.type,'completed');return stream.map(e=>e.delta).join('');};
  const first=await run('warm-first'),warm=JSON.parse(JSON.stringify(c.observation));assert(warm.prefix.reusedTokens>0);
  assert.equal(await run('warm-repeat'),first);const repeat=JSON.parse(JSON.stringify(c.observation));assert.equal(repeat.generation.prefillTokens,1);
  const cold=await c.serverJson('/v1/chat/completions',{messages:[{role:'system',content:system},...messages],stream:false,cache_prompt:false,id_slot:0,...settings.sampling(c.inferenceSettings().settings),chat_template_kwargs:{enable_thinking:false}},AbortSignal.timeout(30000));
  assert.equal(cold.choices[0].message.content,first);assert.equal(cold.usage.prompt_tokens_details.cached_tokens,0);
  return{fixture:'tiny RANDOM SmolLM3; not a quality or performance benchmark',coldAndWarmGreedyOutputEqual:true,warm,repeat,cold:{usage:cold.usage,timings:cold.timings}};
 }finally{await c.shutdown();fs.rmSync(root,{recursive:true,force:true});}
}
if(require.main===module){if(process.argv.length!==4)throw Error('Usage: node test/native-inference.cjs <llama-server> <tiny-random-smollm3.gguf>');check(...process.argv.slice(2)).then(r=>console.log(JSON.stringify(r,null,2)),e=>{console.error(e);process.exitCode=1});}
module.exports={check};
