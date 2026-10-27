import {sensitive} from './privacy.js';
import {fold} from './schema.js';
import {behaviorProfile,SCENARIOS} from './behavior-profile.js';

export function eligible(e){
 if(!['behavior','preference','correction'].includes(e.type)||e.source!=='user_explicit'||e.provenance?.reviewed!==true)return false;
 if(!e.example?.input?.trim()||!e.example?.output?.trim())return false;
 if(/^(?:sim|nao|isso|assim|ok|nao[, ]+e?\s*\d+)[.!? ]*$/.test(fold(e.example.input)))return false;
 return !sensitive([e.summary,e.context?.input,e.context?.badOutput,e.example.input,e.example.output].join('\n'));
}
/** Pure, explicit export. Does not read chats, knowledge DB or unapproved records. */
export function exportApproved(items){
 const seen=new Set(),data=[],profile=behaviorProfile();
 for(const e of items){
  if(e.status!=='approved'||e.approvedForTraining!==true||e.rejectedForTraining||e.approval?.by!=='user'||e.approval.revision!==e.revision||!eligible(e))continue;
  if(!profile||e.approval.behaviorProfile!==profile.id||e.approval.behaviorReviewed!==true||!Object.hasOwn(SCENARIOS,e.approval.scenario))continue;
  const key=fold(e.example.input)+'\n'+fold(e.example.output);if(seen.has(key))continue;seen.add(key);
  data.push({instruction:'Responda conforme o exemplo de comportamento revisado pelo usuário.',input:e.example.input,output:e.example.output,
   metadata:{type:e.type,source:e.source,reviewedBy:'user',revision:e.revision,behaviorProfile:e.approval.behaviorProfile,scenario:e.approval.scenario}});
 }
 return {format:'haruna-reviewed-dialogues-v1',createdAt:new Date().toISOString(),count:data.length,items:data};
}
