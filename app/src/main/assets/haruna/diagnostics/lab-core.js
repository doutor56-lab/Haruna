export const baseline={nCtx:8192,nBatch:512,nUbatch:512,flashAttention:"auto",typeK:"f16",typeV:"f16",systemPromptVariant:"current",temperature:.3,topK:40,topP:.95,minP:.05,presence:0,frequency:0,repeat:1,seed:4294967295,maxTokens:256,thinking:false,history:false,cache:false,rag:false,threads:0,threadsBatch:0};
export const profiles={
 'Haruna padrão':baseline,
 'Qwen recomendado — experimental':{...baseline,temperature:1,topK:20,topP:1,minP:0,presence:2},
 'Phi determinístico — experimental':{...baseline,temperature:0}
};
export function summary(result){
 const observed=result.nativeGenerationFresh===false?{runtime:result.observation?.runtime}:result.observation;
 const g=observed?.generation||{},r=observed?.runtime||{},p=observed?.prefix||{};
 const finite=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
 const rate=(n,t)=>finite(n)&&finite(t)&&t>0?n*1e6/t:null;
 return {systemPromptVariant:result.configuration?.systemPromptVariant||"current",systemPromptExperiment:result.configuration?.systemPromptVariant==="factual_precision_experimental",batch:result.batch,arm:result.arm,nativeGenerationFresh:result.nativeGenerationFresh,completedAt:result.completedAt,model:result.model,configuration:Object.fromEntries(Object.keys(baseline).map(k=>[k,result.configuration?.[k]])),fixture:result.fixture,error:result.error,
  inputEvaluation:observed?.opProfile?.enabled===true?'PROFILE_NOT_COMPARABLE':observed?.incremental?.reusedTokens>0?'WARM_CACHED':g.prefillTokens===g.inputTokens?'FULL_PREFILL':'N/D',
  sessionStep:result.sessionStep,accelerator:observed?.accelerator,incremental:observed?.incremental,opProfile:observed?.opProfile,
  runtime:r,device:result.after?.device,sampler:observed?.decisionProbe?.sampler,thermalBefore:result.thermalBefore,thermalAfter:result.thermalAfter,
  ttftMs:result.firstDeltaMs,nativeTtftMs:finite(g.firstDeltaUs)?g.firstDeltaUs/1000:null,
  nativeTotalMs:finite(g.endUs)?g.endUs/1000:null,decodeMs:finite(g.decodeUs)?g.decodeUs/1000:null,contextRecreationMs:finite(r.contextExperiment?.recreationUs)?r.contextExperiment.recreationUs/1000:null,
  prefillMs:finite(g.prefillUs)?g.prefillUs/1000:null,promptTokens:g.inputTokens,outputTokens:g.outputTokens,
  prefillTokens:g.prefillTokens,promptTokensPerSecond:rate(g.prefillTokens,g.prefillUs),
  decodeWorkTokensPerSecond:rate(g.outputTokens,g.decodeUs),totalMs:result.elapsedMs,
  stopReason:result.error==='cancelled'?'CANCELLED':result.error&&!([3,4,5,6,7,8,9,10].includes(g.nativeStopCode))?'ERROR':({1:'EOS/EOG',2:'MAX_TOKENS',3:'ERROR_DECODE',4:'ERROR_PREPARATION',5:'CANCELLED',6:'ERROR_PREFILL',7:'UNLOAD',8:'DESTROY',9:'DETACHED',10:'ERROR_UTF8'})[g.nativeStopCode]||'UNKNOWN',
  prefix:p,cacheRequested:result.configuration?.cache,prefixState:p.planned===true?(p.reusedTokens>0?'HIT':'MISS'):'N/D',reusePercent:finite(p.reusedTokens)&&p.inputTokens>0?p.reusedTokens*100/p.inputTokens:null,memoryBefore:result.before?.memory,memoryAfter:result.after?.memory,rag:result.rag,ragMs:result.configuration?.ragMs,ragChunks:result.configuration?.references?.length,
  note:'Decode mede trabalho nativo; TTFT do laboratório começa na aceitação da chamada DEBUG. RAM são amostras antes/depois, não um pico contínuo.'};
}
export function difference(a,b){return typeof a==='number'&&a>0&&typeof b==='number'?(b-a)/a*100:null}
export function exportReport(rows){return JSON.stringify({schema:'haruna-lab-v1',runs:rows.slice(-30).map(summary),scope:"Technical scalar export only; inspect device run provenance"},null,2)}

export function compareAB(results){
 const median=items=>{const a=items.filter(x=>typeof x==='number'&&Number.isFinite(x)).sort((a,b)=>a-b);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2:null};
 const group=arm=>{const runs=results.filter(x=>x.arm===arm).map(summary),ok=runs.filter(x=>!x.error);return {runs:runs.length,successful:ok.length,ttftMedianMs:median(ok.map(x=>x.ttftMs)),nativeTtftMedianMs:median(ok.map(x=>x.nativeTtftMs)),promptMedianTokensPerSecond:median(ok.map(x=>x.promptTokensPerSecond)),decodeMedianTokensPerSecond:median(ok.map(x=>x.decodeWorkTokensPerSecond))}};
 const A=group('A'),B=group('B');return {A,B,changePercent:{ttft:difference(A.ttftMedianMs,B.ttftMedianMs),decode:difference(A.decodeMedianTokensPerSecond,B.decodeMedianTokensPerSecond)},note:'Medianas do lote; menor TTFT/maior taxa não substituem avaliação de qualidade. Cache/thermal e parâmetros podem diferir: conferir exportação.'};
}
