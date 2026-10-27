export const KEY='haruna_learned_memory_v1',MAX_ITEMS=300,MAX_CHARS=1000000;
export const TYPES=Object.freeze({preference:'Preferência',fact:'Informação do usuário',decision:'Decisão',correction:'Correção',behavior:'Comportamento',project_context:'Contexto de projeto'});
export const STATES=Object.freeze({observed:'Em avaliação',useful:'Mantida',training_candidate:'Candidata a treinamento',approved:'Aprovada para treinamento',rejected:'Descartada',superseded:'Substituída'});
export const SOURCES=Object.freeze({user_explicit:'Declaração explícita do usuário',user_inferred:'Inferência não confirmada',assistant_generated:'Gerada pela assistente',document:'Documento',system:'Sistema'});
export const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
export const clip=(s,n)=>typeof s==='string'?s.trim().slice(0,n):'';
export const clone=x=>JSON.parse(JSON.stringify(x));
export function normalize(value){
 if(value?.version!==1||!Array.isArray(value.items)||value.items.length>MAX_ITEMS)throw new Error('Formato incompatível.');
 const seen=new Set();
 return {version:1,items:value.items.map(raw=>{
  if(!raw||!Object.hasOwn(TYPES,raw.type)||!Object.hasOwn(STATES,raw.status)||!Object.hasOwn(SOURCES,raw.source)||!raw.id||seen.has(raw.id)||!clip(raw.summary,800)||!['chat','global','project'].includes(raw.scope?.kind))throw new Error('Experiência inválida.');
  seen.add(raw.id);
  const e={...raw,summary:clip(raw.summary,800),revision:Math.max(1,Number(raw.revision)||1),context:{input:clip(raw.context?.input,600),badOutput:clip(raw.context?.badOutput,600)},example:{input:clip(raw.example?.input,800),output:clip(raw.example?.output,800)}};
  if(e.rejectedForTraining)e.status='rejected';
  e.approvedForTraining=e.status==='approved'&&e.approval?.by==='user'&&e.approval.revision===e.revision;
  if(e.status==='approved'&&!e.approvedForTraining)e.status='training_candidate';
  e.rejectedForTraining=e.status==='rejected';
  e.useForContext=e.useForContext===true&&!['observed','rejected','superseded'].includes(e.status)&&e.source==='user_explicit';
  return e;
 })};
}
