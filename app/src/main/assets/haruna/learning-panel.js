// Independent UI bootstrap: keep onboarding usable even if the main app module fails.
const $=s=>document.querySelector(s);
const onboarding=$('#onboarding'),welcome=$('#onboardingWelcome'),models=$('#onboardingModels'),progress=$('#onboardingProgress'),ready=$('#onboardingReady');
const start=$('#onboardingStart'),skip=$('#onboardingSkip'),back=$('#onboardingBack'),finish=$('#onboardingFinish'),importBtn=$('#onboardingImport');
const pTitle=$('#onboardingProgressTitle'),pDetail=$('#onboardingProgressDetail'),pBar=$('#onboardingProgressBar'),pPercent=$('#onboardingProgressPercent');
const ONBOARDING_KEY='haruna_onboarding_v1';
function step(name){if(!onboarding)return;welcome.hidden=name!=='welcome';models.hidden=name!=='models';progress.hidden=name!=='progress';ready.hidden=name!=='ready'}
function markOnboardingDone(){try{localStorage.setItem(ONBOARDING_KEY,'done')}catch{}}
function closeOnboarding(){markOnboardingDone();if(onboarding){onboarding.hidden=true;onboarding.style.display='none'}}
function keepOnboardingClosed(){if(!onboarding)return;onboarding.hidden=true;onboarding.style.display='none'}
if(start)start.addEventListener('click',()=>step('models'));
if(skip)skip.addEventListener('click',closeOnboarding);
if(back)back.addEventListener('click',()=>step('welcome'));
if(finish)finish.addEventListener('click',closeOnboarding);

let android=null,catalogBusy=false;
async function bridge(){if(android)return android;android=(await import('./android-bridge.js')).default;return android}
async function reconcileOnboarding(){
 try{
  const a=await bridge();
  const installed=a.listModels?.()?.models||[];
  const status=a.getStatus?.()||{};
  if(installed.length>0||status.modelLoaded){markOnboardingDone();keepOnboardingClosed();return true}
 }catch(e){console.warn('Could not reconcile onboarding with native model library',e)}
 return false;
}
const CATALOG={
 light:{label:'Leve',model:'Qwen2.5 0.5B Instruct',name:'qwen2.5-0.5b-instruct-q4_k_m.gguf',url:'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',size:'491 MB'},
 balanced:{label:'Equilibrado',model:'Qwen2.5 1.5B Instruct',name:'qwen2.5-1.5b-instruct-q4_k_m.gguf',url:'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',size:'~1 GB'},
 capable:{label:'Mais capaz',model:'Qwen2.5 1.5B Instruct Q6_K',name:'qwen2.5-1.5b-instruct-q6_k.gguf',url:'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q6_k.gguf',size:'~1,46 GB'}
};
async function beginCatalog(tier){if(catalogBusy)return;const item=CATALOG[tier];if(!item)return;catalogBusy=true;step('progress');pTitle.textContent=`Baixando ${item.model}…`;pDetail.textContent=`${item.size} • download e instalação automáticos`;pBar.style.width='4%';pPercent.textContent='';try{const a=await bridge();const installed=a.listModels?.()?.models?.find(m=>m.name===item.name);if(installed){markOnboardingDone();pTitle.textContent='Modelo já instalado';pDetail.textContent='Ativando o modelo local…';pBar.style.width='100%';a.useModel(installed.path);return}const result=a.downloadModel({url:item.url,name:item.name,fileName:item.name,model:item.model});if(result?.status==='error')throw new Error(result.error||'Não foi possível iniciar o download.')}catch(e){catalogBusy=false;step('models');alert(e?.message||String(e))}}
document.querySelectorAll('.recommended-model').forEach(b=>b.addEventListener('click',()=>beginCatalog(b.dataset.tier)));
if(importBtn)importBtn.addEventListener('click',async()=>{try{const a=await bridge();step('progress');pTitle.textContent='Selecionando modelo…';pDetail.textContent='Escolha um arquivo GGUF no dispositivo.';pBar.style.width='4%';pPercent.textContent='';a.loadModel({action:'pick_local_gguf'})}catch(e){step('models');alert(e?.message||String(e))}});
window.addEventListener('haruna-model-import-progress',e=>{const d=e.detail||{},phase=d.phase||d.state||'',pct=Number(d.percent);if(phase==='copying'||phase==='importing'||phase==='selected'||phase==='downloading'){step('progress');pTitle.textContent=phase==='downloading'?'Baixando modelo…':'Importando modelo…';pDetail.textContent=d.name||'Preparando o modelo local.';if(Number.isFinite(pct)){pBar.style.width=`${Math.max(4,Math.min(100,pct))}%`;pPercent.textContent=`${Math.round(pct)}%`}}else if(phase==='preparing'||phase==='loading'){step('progress');pTitle.textContent='Preparando a Haruna…';pDetail.textContent='Carregando o modelo local.';pBar.style.width='100%';pPercent.textContent=''}else if(phase==='completed'||phase==='ready'){
 markOnboardingDone();catalogBusy=false;step('ready');
}else if(phase==='cancelled'){catalogBusy=false;step('models')}else if(phase==='error'){catalogBusy=false;step('models');alert(d.error||'Não foi possível preparar este modelo.')}});
window.addEventListener('haruna-native-status-changed',e=>{if(e.detail?.modelLoaded){markOnboardingDone();if(onboarding&&!ready?.hidden) return;keepOnboardingClosed()}});
reconcileOnboarding();

// Permanent-learning panel is isolated so a failure here never blocks onboarding.
(async()=>{try{
 const knowledge=(await import('./knowledge-store.js')).default,list=$('#permanentLearningList');if(!list)return;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const stateLabel=d=>d.approvedForTraining?'Aprovado':d.rejectedForTraining?'Rejeitado':d.learningState==='permanent_candidate'?'Candidato':'Em avaliação';
 async function edit(d){const current=await knowledge.getText(d.id),next=prompt(`Corrigir conteúdo de ${d.name}`,current);if(next===null||next===current)return;await knowledge.replaceText(d.id,next);render()}
 async function removeDoc(d){
  if(!confirm(`Excluir ${d.name}? Esta ação não pode ser desfeita.`))return;
  try{const result=await knowledge.remove(d.id);if(result?.status!=='ok')throw new Error('A exclusão não foi concluída.');render()}catch(e){alert(`Não foi possível excluir: ${e?.message||e}`)}
 }
 function render(){
  const docs=knowledge.list().filter(d=>d.active).sort((a,b)=>Number(b.approvedForTraining)-Number(a.approvedForTraining)||(b.importance+b.confidence)-(a.importance+a.confidence));
  if(!docs.length){list.innerHTML='<div class="model-empty">Adicione conhecimento para a Haruna começar a avaliar candidatos.</div>';return}
  list.innerHTML='';const suggested=new Set(knowledge.suggestedCandidates().map(x=>x.id));
  for(const d of docs){
   const row=document.createElement('div');row.className='learning-review';
   row.innerHTML=`<div class="learning-head"><div><strong>${esc(d.name)}</strong><small>${d.type==='behavior'?'Conversação':'Conhecimento'} • origem: ${esc(d.source||'local')} • usado ${d.useCount||0}x</small></div><span class="learning-badge">${suggested.has(d.id)?'<i class="ui-icon ui-star" aria-hidden="true"></i> ':''}${stateLabel(d)}</span></div><div class="learning-meters"><label>Importância <b>${d.importance}</b><input data-field="importance" type="range" min="0" max="100" value="${d.importance}"></label><label>Confiança <b>${d.confidence}</b><input data-field="confidence" type="range" min="0" max="100" value="${d.confidence}"></label></div><div class="model-actions learning-actions"><button data-action="edit">Corrigir</button><button data-action="reject" class="danger">Rejeitar</button><button data-action="approve">${d.approvedForTraining?'Aprovado':'Aprovar'}</button><button data-action="delete" class="danger">Excluir</button></div>`;
   row.querySelectorAll('input[type=range]').forEach(input=>{input.oninput=()=>input.parentElement.querySelector('b').textContent=input.value;input.onchange=()=>{knowledge.updateLearning(d.id,{[input.dataset.field]:Number(input.value)});render()}});
   row.querySelector('[data-action=edit]').onclick=()=>edit(d);
   row.querySelector('[data-action=reject]').onclick=()=>{knowledge.updateLearning(d.id,{rejectedForTraining:true,approvedForTraining:false,learningState:'useful'});render()};
   row.querySelector('[data-action=approve]').onclick=()=>{knowledge.updateLearning(d.id,{approvedForTraining:!d.approvedForTraining,rejectedForTraining:false,learningState:d.approvedForTraining?'useful':'permanent_candidate'});render()};
   row.querySelector('[data-action=delete]').onclick=e=>{e.preventDefault();e.stopPropagation();removeDoc(d)};
   list.appendChild(row)
  }
 }
 window.addEventListener('haruna-knowledge-changed',render);document.addEventListener('visibilitychange',()=>{if(!document.hidden)render()});render()
}catch(e){console.error('Permanent learning panel unavailable',e)}})();
