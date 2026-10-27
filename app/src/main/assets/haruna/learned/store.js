import {KEY,MAX_ITEMS,MAX_CHARS,TYPES,STATES,fold,clip,clone,normalize} from './schema.js';
import {candidate} from './capture.js';
import {sensitive} from './privacy.js';
import {eligible,exportApproved} from './dataset.js';
import {behaviorProfile,SCENARIOS} from './behavior-profile.js';

let state={version:1,items:[]},available=true,lastError='';
function load(){try{const raw=localStorage.getItem(KEY);state=raw?normalize(JSON.parse(raw)):{version:1,items:[]};available=true;lastError=''}catch{state={version:1,items:[]};available=false;lastError='Armazenamento indisponível ou formato incompatível; dados originais preservados.'}}
load();
function notify(){try{window.dispatchEvent(new CustomEvent('haruna-learned-memory-changed'))}catch{}}
export const list=()=>clone(state.items);
export const contextCandidates=()=>state.items.filter(e=>e.useForContext&&!['rejected','superseded','observed'].includes(e.status)&&e.source==='user_explicit').map(e=>({type:e.type,summary:e.summary,scope:{...e.scope},context:{...e.context}}));
export function summary(){const counts={};for(const key of Object.keys(STATES))counts[key]=state.items.filter(e=>e.status===key).length;return {available,stored:state.items.length,...counts,error:lastError}}
function save(change){
 if(!available)return {ok:false,error:lastError};
 try{
  const next=clone(state);change(next.items);const safe=normalize(next),raw=JSON.stringify(safe);
  if(raw.length>MAX_CHARS)throw new Error('Limite local atingido. Revise ou exclua experiências antes de adicionar outras.');
  localStorage.setItem(KEY,raw);if(localStorage.getItem(KEY)!==raw)throw new Error('Persistência não confirmada.');
  state=safe;lastError='';notify();return {ok:true};
 }catch(error){lastError=error.message||'Não foi possível salvar.';notify();return {ok:false,error:lastError}}
}
const sameScope=(a,b)=>a.kind===b.kind&&(a.kind==='chat'?a.chatId===b.chatId:a.kind==='project'?fold(a.label)===fold(b.label):true);
export function potentialConflicts(id){const e=state.items.find(x=>x.id===id);return e?.topicKey?state.items.filter(old=>old.id!==id&&old.useForContext&&old.topicKey===e.topicKey&&sameScope(old.scope,e.scope)).map(old=>({id:old.id,summary:old.summary})):[]}
const revoke=e=>{e.approvedForTraining=false;e.rejectedForTraining=false;e.approval=null};
export function observe(text,options){
 try{
  const item=candidate(text,options);if(!item)return {ok:true,captured:false};
  const result=save(items=>{
   const duplicate=items.find(e=>e.type===item.type&&sameScope(e.scope,item.scope)&&fold(e.summary)===fold(item.summary)&&(item.type!=='correction'||fold(e.context.input)===fold(item.context.input)));
   if(duplicate){duplicate.occurrences=(duplicate.occurrences||1)+1;duplicate.updatedAt=new Date().toISOString();return}
   if(items.length>=MAX_ITEMS)throw new Error('Limite de 300 experiências atingido. Revise os itens existentes.');
   const at=new Date().toISOString();items.unshift({...item,id:`e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,10)}`,createdAt:at,updatedAt:at,revision:1,occurrences:1,status:'observed',useForContext:false,approvedForTraining:false,rejectedForTraining:false,approval:null});
  });return {...result,captured:result.ok};
 }catch{return {ok:false,captured:false}}
}
export function edit(id,patch){return save(items=>{
 const e=items.find(x=>x.id===id);if(!e)throw new Error('Experiência não encontrada.');
 if(!clip(patch.summary,800)||!Object.hasOwn(TYPES,patch.type))throw new Error('Informe um resumo e um tipo válido.');
 const nextSummary=clip(patch.summary,800);if(fold(nextSummary)!==fold(e.summary)||patch.type!==e.type)e.topicKey='';
 e.summary=nextSummary;e.type=patch.type;e.example={input:clip(patch.input,800),output:clip(patch.output,800)};
 if(['chat','global'].includes(patch.scope))e.scope={kind:patch.scope,chatId:e.originChatId||e.scope.chatId||patch.chatId||''};
 e.revision++;e.updatedAt=new Date().toISOString();revoke(e);e.status=e.useForContext?'useful':'observed';
 // Manual revision confirms the text, never its universal truth or automatic training approval.
 e.provenance={...e.provenance,reviewed:true};
})}
export function curate(id,action,{explicitApproval=false,replacesId=null,behaviorReviewed=false,scenario=''}={}){return save(items=>{
 const e=items.find(x=>x.id===id);if(!e)throw new Error('Experiência não encontrada.');
 if(action==='delete'){items.splice(items.indexOf(e),1);return}
 if(action==='approve'){
  if(!explicitApproval||!eligible(e))throw new Error('Revise entrada e resposta desejada, removendo dados pessoais. Só exemplos comportamentais podem ser aprovados.');
  const profile=behaviorProfile();
  if(!profile||!behaviorReviewed||!Object.hasOwn(SCENARIOS,scenario))throw new Error('Escolha o contexto e confirme a revisão do perfil comportamental antes de aprovar.');
  e.status='approved';e.approvedForTraining=true;e.rejectedForTraining=false;e.approval={by:'user',at:new Date().toISOString(),revision:e.revision,behaviorProfile:profile.id,behaviorReviewed:true,scenario};
 }else if(action==='reject'){revoke(e);e.status='rejected';e.rejectedForTraining=true;e.useForContext=false}
 else if(action==='candidate'){revoke(e);e.status='training_candidate'}
 else if(action==='keep'){
  if(e.source!=='user_explicit'||sensitive(e.summary))throw new Error('Revise a origem e remova dados sensíveis antes de manter.');
  revoke(e);e.status='useful';e.useForContext=true;
 }else throw new Error('Ação inválida.');
 if(action==='keep'||action==='approve')for(const old of items){
  if(old.id===e.id)continue;
  // A shared topic is only a conflict hint. Supersession always requires the user's selection.
  if(old.id===replacesId){revoke(old);old.status='superseded';old.useForContext=false;old.supersededBy=e.id;old.updatedAt=new Date().toISOString()}
 }
 e.updatedAt=new Date().toISOString();
})}
export const dataset=()=>exportApproved(list());
window.addEventListener('storage',event=>{if(event.key===KEY){load();notify()}});
