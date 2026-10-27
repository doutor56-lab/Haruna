import {list,summary,edit,curate,dataset} from './store.js';
import {TYPES,STATES,SOURCES} from './schema.js';

const page=document.querySelector('#memoryView'),card=document.createElement('section');card.className='page-card learned-card';
card.innerHTML='<div class="section-title"><div><strong>Memória Aprendida e curadoria</strong><small>Experiências são candidatas, não verdades nem aprovação para treinamento.</small></div></div><p class="settings-note" data-count></p><div class="model-actions learning-actions"><button type="button" data-review>Revisar experiências</button><button type="button" data-export>Copiar aprovadas (JSON)</button></div><div data-review-area hidden><label class="settings-note">Estado <select data-filter></select></label><div data-items class="model-list"></div><div class="model-actions learning-actions"><button type="button" data-prev>Anterior</button><span class="settings-note" data-page></span><button type="button" data-next>Próxima</button></div></div><p class="settings-note" data-result role="status"></p>';
page?.appendChild(card);
const q=s=>card.querySelector(s),filter=q('[data-filter]');filter.add(new Option('Todos',''));for(const [key,label]of Object.entries(STATES))filter.add(new Option(label,key));
let expanded=false,pageIndex=0;
function render(){
 const s=summary();q('[data-count]').textContent=s.available?`${s.stored} experiências · ${s.observed} em avaliação · ${s.approved} aprovadas para treinamento. Manter para contexto e aprovar para treinamento são decisões diferentes.`:s.error;
 if(s.error)q('[data-result]').textContent=s.error;
 q('[data-review]').disabled=!s.available;q('[data-export]').disabled=!s.available;
 q('[data-review-area]').hidden=!expanded;if(!expanded)return;
 const items=list().filter(e=>!filter.value||e.status===filter.value),pages=Math.max(1,Math.ceil(items.length/10));pageIndex=Math.min(pageIndex,pages-1);
 const container=q('[data-items]');container.replaceChildren();
 if(!items.length){const empty=document.createElement('p');empty.className='model-empty';empty.textContent='Nenhuma experiência neste estado.';container.appendChild(empty)}
 for(const e of items.slice(pageIndex*10,pageIndex*10+10)){
  const row=document.createElement('div');row.className='learning-review';const title=document.createElement('strong'),detail=document.createElement('p'),meta=document.createElement('small'),button=document.createElement('button');
  title.textContent=`${TYPES[e.type]} · ${STATES[e.status]}`;detail.textContent=e.summary;detail.className='settings-note';
  meta.textContent=`${SOURCES[e.source]} · ${new Date(e.updatedAt).toLocaleDateString('pt-BR')} · ${e.useForContext?'disponível para contexto relevante':'fora do contexto'}`;
  button.type='button';button.textContent='Revisar';button.onclick=()=>editor(e.id);const actions=document.createElement('div');actions.className='model-actions learning-actions';actions.appendChild(button);row.append(title,detail,meta,actions);container.appendChild(row);
 }
 q('[data-page]').textContent=`${pageIndex+1} / ${pages}`;q('[data-prev]').disabled=pageIndex===0;q('[data-next]').disabled=pageIndex>=pages-1;
}
function editor(id){
 if(document.querySelector('dialog[open]'))return;
 let e=list().find(x=>x.id===id);if(!e)return;
 const d=document.createElement('dialog');d.className='message-menu essential-editor learned-editor';d.setAttribute('aria-label','Revisar experiência');
 const heading=document.createElement('strong');heading.textContent='Revisar experiência';const form=document.createElement('form');
 const field=(labelText,control)=>{const label=document.createElement('label');label.textContent=labelText;label.appendChild(control);form.appendChild(label);return control};
 const textArea=(label,value,max)=>{const el=document.createElement('textarea');el.rows=3;el.maxLength=max;el.value=value||'';return field(label,el)};
 const summaryInput=textArea('Resumo',e.summary,800),type=field('Tipo',document.createElement('select'));for(const [value,label]of Object.entries(TYPES))type.add(new Option(label,value));type.value=e.type;
 const scope=field('Escopo de uso',document.createElement('select'));scope.add(new Option('Conversa de origem','chat'));scope.add(new Option('Geral, apenas quando relevante','global'));if(e.scope.kind==='project')scope.add(new Option(`Projeto ${e.scope.label}`,'project'));scope.value=e.scope.kind;
 const note=document.createElement('p');note.className='settings-note';note.textContent=`${SOURCES[e.source]}. Importância ${e.importance==='high'?'alta':'média'} e confiança ${e.confidence==='high'?'alta':'média'} são heurísticas de origem/utilidade, não comprovação de verdade. ${e.occurrences||1} ocorrência(s).`;form.appendChild(note);
 if(e.context.input||e.context.badOutput){const context=document.createElement('details'),label=document.createElement('summary'),body=document.createElement('p');label.textContent='Contexto de origem';body.className='settings-note';body.textContent=`Entrada: ${e.context.input}\nResposta anterior (não validada): ${e.context.badOutput}`;context.append(label,body);form.appendChild(context)}
 const input=textArea('Exemplo revisado · entrada do usuário',e.example.input||e.context.input,800),output=textArea('Exemplo revisado · resposta desejada',e.example.output,800);
 const replacement=field('Substituir experiência anterior (opcional)',document.createElement('select'));replacement.add(new Option('Nenhuma',''));for(const old of list().filter(x=>x.id!==e.id&&x.status!=='superseded'))replacement.add(new Option(old.summary.slice(0,80),old.id));
 const info=document.createElement('p');info.className='settings-note';info.textContent='Manter habilita uso de referência no escopo escolhido. Treinamento exige entrada e resposta desejada revisadas, sem dados pessoais. Fatos e contexto de projeto permanecem fora deste dataset.';
 const error=document.createElement('p');error.className='settings-note';error.setAttribute('role','status');form.append(info,error);
 const close=()=>{d.close();d.remove();render()};
 const saveFields=()=>{
  const changed=summaryInput.value!==e.summary||type.value!==e.type||scope.value!==e.scope.kind||input.value!==e.example.input||output.value!==e.example.output;
  if(!changed)return {ok:true};
  const result=edit(id,{summary:summaryInput.value,type:type.value,scope:scope.value,input:input.value,output:output.value});if(result.ok)e=list().find(x=>x.id===id);return result;
 };
 const action=(label,fn,danger=false)=>{const b=document.createElement('button');b.type='button';b.textContent=label;if(danger)b.className='danger';b.onclick=fn;form.appendChild(b);return b};
 action('Salvar revisão',()=>{const result=saveFields();if(result.ok)close();else error.textContent=result.error});
 for(const [label,key]of [['Manter para contexto','keep'],['Candidato a treinamento','candidate'],['Aprovar para treinamento','approve'],['Descartar','reject']])action(label,()=>{
  if(key==='approve'&&!confirm('Aprovar explicitamente este exemplo para futuro treinamento? Confirme que revisou a entrada e a resposta desejada e removeu dados pessoais/sensíveis. Nenhum modelo será treinado agora.'))return;
  const saved=saveFields();if(!saved.ok){error.textContent=saved.error;return}
  const result=curate(id,key,{explicitApproval:key==='approve',replacesId:replacement.value||null});if(result.ok)close();else error.textContent=result.error;
 },key==='reject');
 action('Excluir experiência',()=>{if(!confirm('Excluir somente esta experiência? O histórico, a Memória Essencial e o Segundo Cérebro serão preservados.'))return;const result=curate(id,'delete');if(result.ok)close();else error.textContent=result.error},true);
 action('Fechar',close);form.onsubmit=event=>event.preventDefault();d.addEventListener('cancel',event=>{event.preventDefault();close()});d.append(heading,form);document.body.appendChild(d);d.showModal();
}
q('[data-review]').onclick=()=>{expanded=!expanded;render()};filter.onchange=()=>{pageIndex=0;render()};q('[data-prev]').onclick=()=>{pageIndex--;render()};q('[data-next]').onclick=()=>{pageIndex++;render()};
q('[data-export]').onclick=async()=>{
 const exported=dataset();if(!exported.count){q('[data-result]').textContent='Nenhum exemplo aprovado e elegível. Revise entrada/resposta desejada e remova dados pessoais antes de aprovar.';return}
 const text=JSON.stringify(exported,null,2);
 try{
  if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
  else{const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);try{area.select();if(!document.execCommand('copy'))throw new Error('Cópia indisponível.')}finally{area.remove()}}
  q('[data-result]').textContent=`${exported.count} exemplo(s) aprovado(s) copiado(s). Nada foi enviado ou treinado.`;
 }catch{q('[data-result]').textContent='O Android não permitiu copiar. Os exemplos continuam salvos; tente novamente.'}
};
window.addEventListener('haruna-learned-memory-changed',render);render();
