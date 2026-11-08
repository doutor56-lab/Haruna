/* Desktop-only bootstrap. Android assets are copied unchanged before adaptation. */
(()=>{
 const desktop=window.HarunaDesktop;if(!desktop)return;
 window.harunaDesktopPrompt=(question,value='')=>new Promise(resolve=>{
  const d=document.createElement('dialog');d.className='desktop-prompt';const title=document.createElement('strong');title.textContent=question;const field=document.createElement('textarea');field.value=value;field.rows=value.includes('\n')?10:3;const actions=document.createElement('div');actions.className='model-actions';const cancel=document.createElement('button'),ok=document.createElement('button');cancel.textContent='Cancelar';ok.textContent='Confirmar';actions.append(cancel,ok);d.append(title,field,actions);document.body.append(d);let done=false;const finish=v=>{if(done)return;done=true;d.close();d.remove();resolve(v);};cancel.onclick=()=>finish(null);ok.onclick=()=>finish(field.value);d.addEventListener('cancel',e=>{e.preventDefault();finish(null)});field.addEventListener('keydown',e=>{if(e.ctrlKey&&e.key==='Enter')finish(field.value)});d.showModal();field.focus();field.select();
 });

// Warn once if conversation persistence fails (for example, storage quota).
 let storageWarningShown=false;
 window.harunaDesktopStorageWarning=()=>{
  if(storageWarningShown)return;
  storageWarningShown=true;
  const note=document.createElement('div');
  note.className='desktop-storage-warning';note.setAttribute('role','alert');
  note.textContent='Armazenamento de conversas cheio ou indisponível. Esta conversa pode não ser recuperada após fechar a Haruna. Libere espaço e copie mensagens importantes.';
  const close=document.createElement('button');close.type='button';close.textContent='Entendi';
  close.onclick=()=>note.remove();note.append(close);
  (document.body||document.documentElement).append(note);
 };
 // Windows-only UI scale. Chromium CSS zoom reflows the layout instead of
// stretching a fixed-size screenshot; responsive CSS remains active.
 const SCALE_KEY='haruna.windows.interfaceScale';
 const clampScale=value=>{const n=Number(value);return Number.isFinite(n)&&n>=75&&n<=150&&n%5===0?n:100;};
 const applyScale=value=>{
  const scale=clampScale(value);
  document.documentElement.style.zoom=scale+'%';
  try{localStorage.setItem(SCALE_KEY,String(scale));}catch{}
  return scale;
 };
 let initialScale=100;
 try{initialScale=clampScale(localStorage.getItem(SCALE_KEY)??100);}catch{}
 applyScale(initialScale);
 function mountScaleControl(){
  const settings=document.querySelector('#settingsView');
  if(!settings||settings.querySelector('#desktopInterfaceScale'))return;
  const appearance=settings.querySelector('.theme-choice')?.closest('.page-card');
  const card=document.createElement('div');
  card.id='desktopInterfaceScale';
  card.className='desktop-interface-scale';
  const heading=document.createElement('div');
  heading.className='desktop-scale-heading';
  const title=document.createElement('label');title.htmlFor='desktopScaleRange';title.textContent='Escala da interface';
  const value=document.createElement('output');value.htmlFor='desktopScaleRange';
  heading.append(title,value);
  const range=document.createElement('input');
  range.id='desktopScaleRange';range.type='range';range.min='75';range.max='150';range.step='5';
  range.value=String(initialScale);
  const description=document.createElement('small');
  description.textContent='75% compacta · 100% padrão · 150% ampliada. Salvo neste computador.';
  const reset=document.createElement('button');reset.type='button';reset.textContent='Restaurar 100%';
  const update=scale=>{const next=applyScale(scale);range.value=String(next);value.textContent=next+'%';};
  range.addEventListener('input',()=>update(range.value));
  reset.addEventListener('click',()=>update(100));
  update(initialScale);
  card.append(heading,range,description,reset);
  (appearance||settings).append(card);
 }

 // Make startup failures visible instead of leaving an empty chat screen.
 // This does not replace missing modules with simulated functionality.
 let startupFailure='';
 addEventListener('error',event=>{if(!window.__HARUNA_CHAT_READY__)startupFailure=String(event.message||'Falha ao carregar um módulo.').slice(0,180);});
 addEventListener('unhandledrejection',event=>{if(!window.__HARUNA_CHAT_READY__)startupFailure=String(event.reason?.message||event.reason||'Inicialização interrompida.').slice(0,180);});
 addEventListener('load',()=>setTimeout(()=>{
  const chatReady=window.__HARUNA_CHAT_READY__===true;
  const hasImageButton=!!document.querySelector('#generateImage');
  const hasImageSettings=!!document.querySelector('.image-settings-card');
  if(chatReady&&hasImageButton&&hasImageSettings)return;
  const messages=document.querySelector('#messages');
  if(!messages||messages.querySelector('.desktop-startup-warning'))return;
  const warning=document.createElement('p');warning.className='desktop-startup-warning';
  warning.setAttribute('role','alert');
  warning.textContent=!chatReady?'O chat não terminou de iniciar. Reinicie a Haruna e confira a versão instalada.': 'A interface de imagens não carregou completamente. Reinicie a Haruna e confira a versão instalada.';
  if(startupFailure){const detail=document.createElement('small');detail.textContent='Detalhe técnico: '+startupFailure;warning.append(detail);}
  messages.append(warning);
 },1500));

 // No browser speech recognizer/cloud fallback is enabled by the Windows shell.
 window.SpeechRecognition=undefined;window.webkitSpeechRecognition=undefined;
 let lastLlmStatus='';
 desktop.subscribe(event=>{
  if(event.type==='desktop-error'){alert(event.message);return;}
  if(event.type==='image-rejected'){window.harunaChatImages?.update({request:event.request,state:'ERROR',error:event.error});return;}
  window.harunaAndroidOnEvent?.(event);
  // The desktop snapshot changes on model load/unload and during generation,
  // even when the accompanying event is model_import or a streamed token.
  // Keep the Android chat status view synchronized with that snapshot.
  const llm=desktop.snapshot()?.llm||{};
  const signature=[llm.state,llm.modelLoaded,llm.modelName,llm.error].join('|');
  if(event.type!=='status'&&signature!==lastLlmStatus)window.dispatchEvent(new CustomEvent('haruna-native-status-changed'));
  lastLlmStatus=signature;
 });
 addEventListener('DOMContentLoaded',()=>{
  mountScaleControl();
  const settings=document.querySelector('#settingsView');const note=document.createElement('p');note.className='settings-note desktop-note';note.textContent='Windows • modelos referenciados no local escolhido, sem duplicar os pesos. Remover da lista preserva o arquivo original. Voz nativa Android e seu DBG não são executados nesta edição.';settings?.append(note);
  document.querySelectorAll('.recommended-model').forEach(b=>{b.onclick=()=>alert('Nesta versão Windows, use Adicionar modelo GGUF para importar o arquivo local.');});
 });
})();
