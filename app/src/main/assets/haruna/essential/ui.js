import {readMemory,commit,clearEssential,essentialSummary} from './store.js';
import {LANGUAGES,STYLES,validStoredName} from './schema.js';

const page=document.querySelector('#memoryView');
const card=document.createElement('section');card.className='page-card essential-card';
card.innerHTML='<div class="section-title"><div><strong>Memória Essencial</strong><small>Personalização pequena, local e independente do Segundo Cérebro.</small></div></div><dl></dl><p class="settings-note" data-essential-status></p><div class="model-actions learning-actions"><button type="button" data-essential-edit>Revisar</button><button type="button" class="danger" data-essential-clear>Esquecer dados</button></div>';
page?.appendChild(card);
function render(){
 const {essential:e}=readMemory(),summary=essentialSummary(),list=card.querySelector('dl');list.replaceChildren();
 for(const [label,value]of [['Nome informado',e.userName],['Como prefere ser chamado',e.preferredName],['Idioma preferido',LANGUAGES[e.preferredLanguage]],['Estilo de resposta',STYLES[e.responseStyle]]]){
  const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value||'Não definido';row.append(dt,dd);list.appendChild(row);
 }
 card.querySelector('[data-essential-status]').textContent=summary.available?'Você pode revisar ou esquecer estes dados. O histórico e o Segundo Cérebro permanecem separados.':'Armazenamento indisponível ou formato incompatível. A conversa continua funcionando; não há confirmação de novas memórias.';
 card.querySelector('[data-essential-edit]').disabled=!summary.available;
}
function edit(){
 if(document.querySelector('dialog[open]'))return;
 const {essential:e}=readMemory(),dialog=document.createElement('dialog');dialog.className='message-menu essential-editor';dialog.setAttribute('aria-label','Revisar Memória Essencial');
 const title=document.createElement('strong');title.textContent='Memória Essencial';const form=document.createElement('form');
 const controls={};
 for(const [key,labelText]of [['userName','Nome informado'],['preferredName','Como prefere ser chamado'],['preferredLanguage','Idioma preferido'],['responseStyle','Estilo de resposta']]){
  const label=document.createElement('label');label.textContent=labelText;let control;
  if(key==='preferredLanguage'||key==='responseStyle'){
   control=document.createElement('select');control.add(new Option('Não definido',''));
   for(const [value,name]of Object.entries(key==='preferredLanguage'?LANGUAGES:STYLES))control.add(new Option(name,value));
  }else{control=document.createElement('input');control.type='text';control.maxLength=60;control.autocomplete='off'}
  control.value=e[key]||'';controls[key]=control;label.appendChild(control);form.appendChild(label);
 }
 const note=document.createElement('p');note.className='settings-note';note.textContent='Todos os campos são opcionais. Alterações valem para as próximas mensagens e não reescrevem o histórico.';
 const error=document.createElement('p');error.className='settings-note';error.setAttribute('role','status');
 const save=document.createElement('button'),cancel=document.createElement('button');save.type='submit';save.textContent='Salvar';cancel.type='button';cancel.textContent='Cancelar';
 const close=()=>{dialog.close();dialog.remove();card.querySelector('[data-essential-edit]').focus({preventScroll:true})};
 cancel.onclick=close;dialog.addEventListener('cancel',event=>{event.preventDefault();close()});
 form.onsubmit=event=>{
  event.preventDefault();const fields=Object.fromEntries(Object.entries(controls).map(([key,control])=>[key,control.value.trim().replace(/\s+/g,' ')]));
  if(['userName','preferredName'].some(k=>fields[k]&&!validStoredName(fields[k]))){error.textContent='Use um nome ou apelido curto, de até 60 caracteres, sem comandos ou quebras de linha.';return}
  const result=commit(s=>{
   Object.assign(s.essential,fields);s.introduction.status='done';
   if(fields.userName||fields.preferredName)s.privacy.namesForgotten=false;
   else if(e.userName||e.preferredName)s.privacy.namesForgotten=true;
   if(fields.preferredLanguage||fields.responseStyle)s.privacy.preferencesForgotten=false;
   else if(e.preferredLanguage||e.responseStyle)s.privacy.preferencesForgotten=true;
  });
  if(result.ok)close();else error.textContent=result.error;
 };
 form.append(note,error,save,cancel);dialog.append(title,form);document.body.appendChild(dialog);dialog.showModal();
}
card.querySelector('[data-essential-edit]').onclick=edit;
card.querySelector('[data-essential-clear]').onclick=()=>{
 if(!confirm('Esquecer somente a Memória Essencial? Conversas, memórias anteriores e Segundo Cérebro não serão apagados. A apresentação não será reiniciada.'))return;
 const result=clearEssential();if(!result.ok)alert(result.error);
};
let timer;
const toast=document.createElement('div');toast.className='essential-memory-toast';toast.hidden=true;toast.setAttribute('role','status');
toast.innerHTML='<i class="ui-icon ui-check" aria-hidden="true"></i><span>Haruna lembrou disso</span>';document.body.appendChild(toast);
window.addEventListener('haruna-essential-memory-changed',render);
window.addEventListener('haruna-essential-memory-saved',()=>{clearTimeout(timer);toast.hidden=false;timer=setTimeout(()=>{toast.hidden=true},2300)});
render();
