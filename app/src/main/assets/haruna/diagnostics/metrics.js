import knowledge from '../knowledge-store.js';
import {essentialSummary} from '../essential/store.js';

// Only scalar aggregates. No query, chunk, message, document name or result object is retained.
const searches={count:0,failures:0,totalMs:0,lastMs:null};
let request=null,lastRequest=null,dirty=true,metadata=null;
window.addEventListener('haruna-chat-submit',()=>{request={calls:0,hits:0,totalMs:0,failures:0}});
window.addEventListener('haruna-dbg-rag-search',event=>{
 const d=event.detail||{};
 if(!Number.isFinite(d.durationMs)||d.durationMs<0)return;
 searches.count++;searches.totalMs+=d.durationMs;searches.lastMs=d.durationMs;
 if(d.failed)searches.failures++;
 if(request){request.calls++;request.hits+=Number.isFinite(d.hits)?Math.max(0,d.hits):0;request.totalMs+=d.durationMs;if(d.failed)request.failures++}
});
window.addEventListener('haruna-dbg-chat-finished',()=>{lastRequest=request?{...request}:null;request=null});
window.addEventListener('haruna-knowledge-changed',()=>{dirty=true});

export function knowledgeMetrics(){
 if(dirty){
  try{
   const docs=knowledge.list();
   const sum=key=>docs.every(d=>Number.isFinite(d[key])&&d[key]>=0)?docs.reduce((n,d)=>n+d[key],0):null;
   metadata={documents:docs.length,activeDocuments:docs.filter(d=>d.active).length,chunks:sum('chunks'),sourceChars:sum('chars')};
  }catch{metadata=null}
  dirty=false;
 }
 return {...(metadata||{}),essential:essentialSummary(),searchCount:searches.count,failedSearches:searches.failures,lastMs:searches.lastMs,
  meanMs:searches.count?searches.totalMs/searches.count:null,lastRequest:lastRequest?{...lastRequest}:null};
}

