/* Desktop-only bootstrap. Android assets are copied unchanged before adaptation. */
(()=>{
 const desktop=window.HarunaDesktop;if(!desktop)return;
 window.harunaDesktopPrompt=(question,value='')=>new Promise(resolve=>{
  const d=document.createElement('dialog');d.className='desktop-prompt';const title=document.createElement('strong');title.textContent=question;const field=document.createElement('textarea');field.value=value;field.rows=value.includes('\n')?10:3;const actions=document.createElement('div');actions.className='model-actions';const cancel=document.createElement('button'),ok=document.createElement('button');cancel.textContent='Cancelar';ok.textContent='Confirmar';actions.append(cancel,ok);d.append(title,field,actions);document.body.append(d);let done=false;const finish=v=>{if(done)return;done=true;d.close();d.remove();resolve(v);};cancel.onclick=()=>finish(null);ok.onclick=()=>finish(field.value);d.addEventListener('cancel',e=>{e.preventDefault();finish(null)});field.addEventListener('keydown',e=>{if(e.ctrlKey&&e.key==='Enter')finish(field.value)});d.showModal();field.focus();field.select();
 });
 // No browser speech recognizer/cloud fallback is enabled by the Windows shell.
 window.SpeechRecognition=undefined;window.webkitSpeechRecognition=undefined;
 desktop.subscribe(event=>{
  if(event.type==='desktop-error'){alert(event.message);return;}
  if(event.type==='image-rejected'){window.harunaChatImages?.update({request:event.request,state:'ERROR',error:event.error});return;}
  window.harunaAndroidOnEvent?.(event);
  if(event.type==='status')window.dispatchEvent(new CustomEvent('haruna-native-status-changed'));
 });
 addEventListener('DOMContentLoaded',()=>{
  const settings=document.querySelector('#settingsView');const note=document.createElement('p');note.className='settings-note desktop-note';note.textContent='Windows • modelos referenciados no local escolhido, sem duplicar os pesos. Remover da lista preserva o arquivo original. Voz nativa Android e seu DBG não são executados nesta edição.';settings?.append(note);
  document.querySelectorAll('.recommended-model').forEach(b=>{b.onclick=()=>alert('Nesta versão Windows, use Adicionar modelo GGUF para importar o arquivo local.');});
 });
})();
