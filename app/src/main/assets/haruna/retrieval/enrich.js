import knowledge from '../knowledge-store.js';
import {routeMessage,relevant,terms} from './policy.js';

const MAX_CONTEXT=2200,MAX_CHUNKS=2;
const heading='\n\n<dados_de_referencia>\n';
const ending='\n</dados_de_referencia>';
function emit(name,detail){try{window.dispatchEvent(new CustomEvent(name,{detail}))}catch{}}
function budgetFor(text,options){
 const recent=Array.isArray(options.recentMessages)?options.recentMessages.filter(m=>m&&!m.error&&['user','assistant'].includes(m.role)).slice(-8):[];
 const recentChars=Math.min(3200,recent.reduce((n,m)=>n+Math.min(1600,typeof m.content==='string'?m.content.length:0),0));
 const reserve=value=>Number.isFinite(value)?Math.max(0,value):0;
 return Math.max(0,Math.min(MAX_CONTEXT,7200-text.length-recentChars-reserve(options.essentialChars)-reserve(options.localContextChars)-300));
}
export function createEnricher(store){
 let dirty=true,cached=null;
 window.addEventListener('haruna-knowledge-changed',()=>{dirty=true;cached=null});
 function catalog(){
  if(dirty||!cached){
   const docs=store.list();const next={knowledge:0,behavior:0,titleTerms:new Set()};
   for(const doc of docs){
    if(!doc.active)continue;
    if(doc.type==='behavior')next.behavior++;else next.knowledge++;
    if(next.titleTerms.size<512)for(const word of terms(doc.name||'')){if(/^\d+$/.test(word))continue;if(next.titleTerms.size>=512)break;next.titleTerms.add(word)}
   }
   cached=next;dirty=false;
  }
  return cached;
 }
 return async function enrich(text,options={}){
  let calls=0,succeeded=0,failed=0,selected=[];
  const result=()=>options.structured?{text,references:selected}:selected.length?text+heading+JSON.stringify(selected)+ending:text;
  try{
   const plan=routeMessage(text,options,catalog),budget=budgetFor(text,options);
   if(!plan.consult||budget<600){
    emit('haruna-rag-decision',{decision:'skip',reason:plan.consult?'context_budget':plan.reason});
    emit('haruna-rag-result',{calls:0,succeeded:0,failed:0,selectedChunks:0,contextChars:0});
    return result();
   }
   const available=catalog();
   emit('haruna-rag-decision',{decision:'query',reason:plan.reason});
   async function search(type,limit){
    if(!(type==='knowledge'?available.knowledge:available.behavior))return [];
    calls++;
    try{const hits=await store.search(text,{type,limit});succeeded++;return hits.filter(c=>relevant(c,text,plan))}
    catch{failed++;return []}
   }
   const facts=plan.mode!=='behavior'?await search('knowledge',2):[];
   const behavior=plan.mode!=='knowledge'?await search('behavior',1):[];
   const candidates=plan.mode==='both'?[facts[0],behavior[0],facts[1]]:[...facts,...behavior];
   const seen=new Set();
   for(const chunk of candidates){
    if(!chunk||typeof chunk.content!=='string'||!chunk.content.trim()||selected.length>=MAX_CHUNKS)continue;
    const key=chunk.id||chunk.content;if(seen.has(key))continue;seen.add(key);
    // Keep complete existing chunks. Do not cut source code mid-segment to fill a remaining budget.
    const item={referencia:selected.length+1,tipo:chunk.type==='behavior'?'exemplo de conversação':'conhecimento',trecho:chunk.content};
    const next=[...selected,item],size=heading.length+JSON.stringify(next).length+ending.length;
    if(size<=budget)selected=next;
   }
   const context=selected.length?heading+JSON.stringify(selected)+ending:'';
   emit('haruna-rag-result',{calls,succeeded,failed,selectedChunks:selected.length,contextChars:context.length});
   return result();
  }catch{
   // No legacy fallback search, extra inference or diagnostic error text is injected on failure.
   emit('haruna-rag-decision',{decision:'skip',reason:'unavailable'});
   emit('haruna-rag-result',{calls,succeeded,failed:failed+1,selectedChunks:0,contextChars:0});
   selected=[];return result();
  }
 };
}
export const enrichOnDemand=createEnricher(knowledge);

