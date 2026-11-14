'use strict';
const os=require('node:os');
// Same preference bounds as Android. Native thread selection remains platform-specific.
function resolve(name,saved){
 const smol=/smol[ _-]?lm[ _-]?3/i.test(name);
 const defaults={profile:smol?'smollm3':'haruna',temperature:smol?.6:.3,topK:40,topP:.95,minP:.05,repeat:1,presence:0,frequency:0,seed:-1,maxTokens:1024,threads:0,threadsBatch:0,nCtx:8192,nBatch:512,nUbatch:512,flashAttention:smol?'off':'auto'};
 if(!saved)return defaults;
 try{return{...validate(saved),profile:'custom'};}catch{return defaults;}
}
function validate(p){
 if(!p||typeof p!=='object'||Array.isArray(p))throw Error('Configurações de inferência inválidas.');
 const ranges={temperature:[0,2],topK:[0,1000,true],topP:[.0001,1],minP:[0,1],repeat:[.5,2],presence:[-2,2],frequency:[-2,2],seed:[-1,4294967294,true],maxTokens:[16,4096,true],threads:[0,16,true],threadsBatch:[0,16,true],nBatch:[32,1024,true],nUbatch:[32,512,true]};
 const out={};for(const[k,[min,max,int]]of Object.entries(ranges)){const v=p[k];if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||(int&&!Number.isInteger(v)))throw Error('Valor inválido: '+k);out[k]=v;}
 if(![1024,2048,4096,8192].includes(p.nCtx)||!['auto','off','on'].includes(p.flashAttention)||out.nUbatch>out.nBatch||out.nBatch>p.nCtx||out.maxTokens>p.nCtx-256)throw Error('Contexto, batch ou limite de saída incompatíveis.');
 return{...out,nCtx:p.nCtx,flashAttention:p.flashAttention};
}
function configured(p,name,cpus=os.availableParallelism()){
 const count=Math.max(1,cpus),smol=/smol[ _-]?lm[ _-]?3/i.test(name);
 // Preserve the established Windows 2/6 fallback for other models.
 const auto=smol?Math.max(1,Math.min(16,count<=4?count:Math.floor(count*.8))):null;
 return{nCtx:p.nCtx,nBatch:p.nBatch,nUbatch:p.nUbatch,flashAttention:p.flashAttention,threads:p.threads||auto||Math.min(2,count),threadsBatch:p.threadsBatch||auto||Math.min(6,count)};
}
function contextKey(p){return JSON.stringify([p.nCtx,p.nBatch,p.nUbatch,p.flashAttention,p.threads,p.threadsBatch]);}
function sampling(p,limit){return{temperature:p.temperature,top_k:p.topK,top_p:p.topP,min_p:p.minP,repeat_penalty:p.repeat,presence_penalty:p.presence,frequency_penalty:p.frequency,seed:p.seed,max_tokens:Number.isFinite(limit)?Math.max(1,Math.min(p.maxTokens,Math.trunc(limit))):p.maxTokens};}
module.exports={resolve,validate,configured,contextKey,sampling};
