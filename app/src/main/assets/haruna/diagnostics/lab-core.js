export const baseline={temperature:.3,topK:40,topP:.95,minP:.05,presence:0,frequency:0,repeat:1,seed:4294967295,maxTokens:256,thinking:false,history:false,cache:false,rag:false,threads:0,threadsBatch:0};
export const profiles={
 'Haruna padrão':baseline,
 'Qwen recomendado — experimental':{...baseline,temperature:1,topK:20,topP:1,minP:0,presence:2},
 'Phi determinístico — experimental':{...baseline,temperature:0}
};
export function summary(result){
 const g=result.observation?.generation||{},r=result.observation?.runtime||{},p=result.observation?.prefix||{};
 const finite=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
 const rate=(n,t)=>finite(n)&&finite(t)&&t>0?n*1e6/t:null;
 return {model:result.model,configuration:Object.fromEntries(Object.keys(baseline).map(k=>[k,result.configuration?.[k]])),fixture:result.fixture,error:result.error,
  runtime:r,device:result.after?.device,sampler:result.observation?.decisionProbe?.sampler,thermalBefore:result.thermalBefore,thermalAfter:result.thermalAfter,
  ttftMs:result.firstDeltaMs,nativeTtftMs:finite(g.firstDeltaUs)?g.firstDeltaUs/1000:null,
  prefillMs:finite(g.prefillUs)?g.prefillUs/1000:null,promptTokens:g.inputTokens,outputTokens:g.outputTokens,
  prefillTokens:g.prefillTokens,promptTokensPerSecond:rate(g.prefillTokens,g.prefillUs),
  decodeWorkTokensPerSecond:rate(g.outputTokens,g.decodeUs),totalMs:result.elapsedMs,
  stopReason:({1:'EOS/EOG',2:'MAX_TOKENS',3:'ERROR_DECODE',4:'ERROR_PREPARATION',5:'CANCELLED',6:'ERROR_PREFILL',7:'UNLOAD',8:'DESTROY',9:'DETACHED',10:'ERROR_UTF8'})[g.nativeStopCode]||'UNKNOWN',
  prefix:p,cacheRequested:result.configuration?.cache,prefixState:p.planned===true?(p.reusedTokens>0?'HIT':'MISS'):'N/D',reusePercent:finite(p.reusedTokens)&&p.inputTokens>0?p.reusedTokens*100/p.inputTokens:null,memoryBefore:result.before?.memory,memoryAfter:result.after?.memory,rag:result.rag,ragMs:result.configuration?.ragMs,ragChunks:result.configuration?.references?.length,
  note:'Decode mede trabalho nativo; TTFT do laboratório começa na aceitação da chamada DEBUG. RAM são amostras antes/depois, não um pico contínuo.'};
}
export function difference(a,b){return typeof a==='number'&&a>0&&typeof b==='number'?(b-a)/a*100:null}
export function exportReport(rows){return JSON.stringify({schema:'haruna-lab-v1',runs:rows.slice(-30).map(summary),scope:"Technical scalar export only; inspect device run provenance"},null,2)}
