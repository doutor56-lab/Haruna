import './onboarding-hotfix.js';
import knowledge from './knowledge-store.js';

const $=s=>document.querySelector(s);
const list=$('#permanentLearningList');
if(list){
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const stateLabel=d=>d.approvedForTraining?'Aprovado':d.rejectedForTraining?'Rejeitado':d.learningState==='permanent_candidate'?'Candidato':'Em avaliação';
  async function edit(d){
    const current=await knowledge.getText(d.id);
    const next=prompt(`Corrigir conteúdo de ${d.name}`,current);
    if(next===null||next===current)return;
    await knowledge.replaceText(d.id,next);
    render();
  }
  function render(){
    const docs=knowledge.list().filter(d=>d.active).sort((a,b)=>Number(b.approvedForTraining)-Number(a.approvedForTraining)||(b.importance+b.confidence)-(a.importance+a.confidence));
    if(!docs.length){list.innerHTML='<div class="model-empty">Adicione conhecimento para a Haruna começar a avaliar candidatos.</div>';return}
    list.innerHTML='';
    for(const d of docs){
      const suggested=knowledge.suggestedCandidates().some(x=>x.id===d.id);
      const row=document.createElement('div');row.className='learning-review';
      row.innerHTML=`<div class="learning-head"><div><strong>${esc(d.name)}</strong><small>${d.type==='behavior'?'Conversação':'Conhecimento'} • origem: ${esc(d.source||'local')} • usado ${d.useCount||0}x</small></div><span class="learning-badge">${suggested?'★ ':''}${stateLabel(d)}</span></div><div class="learning-meters"><label>Importância <b>${d.importance}</b><input data-field="importance" type="range" min="0" max="100" value="${d.importance}"></label><label>Confiança <b>${d.confidence}</b><input data-field="confidence" type="range" min="0" max="100" value="${d.confidence}"></label></div><div class="model-actions learning-actions"><button data-action="edit">Corrigir</button><button data-action="reject" class="danger">Rejeitar</button><button data-action="approve">${d.approvedForTraining?'✓ Aprovado':'Aprovar'}</button></div>`;
      row.querySelectorAll('input[type=range]').forEach(input=>{input.oninput=()=>input.parentElement.querySelector('b').textContent=input.value;input.onchange=()=>{knowledge.updateLearning(d.id,{[input.dataset.field]:Number(input.value)});render()}});
      row.querySelector('[data-action=edit]').onclick=()=>edit(d);
      row.querySelector('[data-action=reject]').onclick=()=>{knowledge.updateLearning(d.id,{rejectedForTraining:true,learningState:'useful'});render()};
      row.querySelector('[data-action=approve]').onclick=()=>{knowledge.updateLearning(d.id,{approvedForTraining:!d.approvedForTraining,rejectedForTraining:false,learningState:d.approvedForTraining?'useful':'permanent_candidate'});render()};
      list.appendChild(row);
    }
  }
  window.addEventListener('haruna-knowledge-changed',render);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)render()});
  setInterval(render,15000);
  render();
}