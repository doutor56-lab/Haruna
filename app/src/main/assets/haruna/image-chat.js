// SD1.5 jobs use the same conversation and persistence as text; no remote requests.
const api=window.HarunaImages,chat=window.harunaChatImages;
const uuid=/^[0-9a-f-]{36}$/;
let stoppingRequest=null;
function requestStop(id){stoppingRequest=id;api?.cancelGeneration(id);const label=document.querySelector(`[data-image-job="${id}"] .image-job-state`);if(label)label.textContent='Interrompendo…'}
const pending=s=>['LOADING','GENERATING','RESTORING_LLM'].includes(s);
const phases=['Preparando','Carregando modelo','Codificando descrição','Gerando imagem','Decodificando imagem','Gravando PNG'];
export function progressLabel(p){if(!Array.isArray(p)||p.length!==3)return 'Preparando modelo…';return p[0]===3?`${phases[3]} · etapa ${p[1]} de ${p[2]}`:(phases[p[0]]||'Preparando modelo…')}
window.harunaRenderImageCard=(bubble,message)=>{
 const j=message.image;if(!uuid.test(j.request))return;
 bubble.replaceChildren();bubble.classList.add('image-card');bubble.dataset.imageJob=j.request;
 const title=document.createElement('strong');title.textContent='Geração de imagem';bubble.append(title);
 const prompt=document.createElement('p');prompt.textContent=j.prompt||message.content;if(!j.userPromptShown)bubble.append(prompt);
 const status=document.createElement('p');status.className='image-job-state';status.setAttribute('role','status');
 status.textContent=({LOADING:'Preparando modelo…',GENERATING:'Gerando imagem…',RESTORING_LLM:'Imagem finalizada. Recarregando o GGUF anterior…',COMPLETED:'Imagem gerada localmente',CANCELLED:'Geração cancelada',INTERRUPTED:'Geração interrompida',ERROR:'Não foi possível gerar a imagem'})[j.state]||'Estado indisponível';bubble.append(status);if(j.outputWidth&&j.outputHeight){const size=document.createElement('small');size.textContent=j.outputWidth+' × '+j.outputHeight;bubble.append(size)}
 const actions=document.createElement('div');actions.className='model-actions';bubble.append(actions);
 const button=(text,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=fn;actions.append(b);return b};
 if(j.state==='COMPLETED'||j.results?.length){
  const grid=document.createElement('div');grid.className='image-results';const results=j.results?.length?j.results:[{request:j.request}];grid.dataset.count=results.length;
  for(const result of results){if(!uuid.test(result.request))continue;const item=document.createElement('div'),image=document.createElement('img');image.src='/generated/'+result.request+'.png';image.alt=j.prompt||'Imagem gerada pela Haruna';image.loading='lazy';image.decoding='async';item.append(image);for(const [label,handler]of [['Visualizar',()=>api?.open(result.request,false)],['Salvar',()=>api?.save(result.request)],['Compartilhar',()=>api?.open(result.request,true)]]){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=handler;b.disabled=label==='Salvar'&&pending(j.state);item.append(b)}grid.append(item)}bubble.insertBefore(grid,actions);
  button('Salvar todas',()=>api?.saveBatch(j.request)).disabled=pending(j.state);
  if(pending(j.state)){const progress=document.createElement('progress');bubble.insertBefore(progress,actions);if(j.state!=='RESTORING_LLM')button('Cancelar',()=>requestStop(j.request))}
  if(j.saveWarning||j.restoreWarning){const warning=document.createElement('small');warning.textContent=[j.saveWarning,j.restoreWarning].filter(Boolean).join(' · ');bubble.append(warning)}
 }else if(pending(j.state)){
  const progress=document.createElement('progress');progress.setAttribute('aria-label','Progresso da imagem');bubble.insertBefore(progress,actions);
  if(j.state!=='RESTORING_LLM')button('Cancelar',()=>requestStop(j.request));
 }
 if(j.error){const error=document.createElement('small');error.textContent=j.error;bubble.append(error)}
};
if(api&&chat){
 const button=document.createElement('button');button.id='generateImage';button.className='attach image-generate';button.type='button';button.title='Gerar imagem';button.setAttribute('aria-label','Gerar imagem');
 // Same line icon weight, size and button style as the existing composer controls.
 button.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/></svg>';
 document.querySelector('#attach')?.after(button);
 window.harunaStartImage=(original,options={})=>{

  if((chat.state().busy&&!options.allowBusy)||JSON.parse(api.status()).busy)throw Error('Aguarde a operação atual da Haruna.');
  if(chat.state().attachments)throw Error('Envie ou remova os anexos antes de gerar uma imagem.');
  const status=JSON.parse(api.status());if(!status.selected)throw Error('Adicione e selecione um modelo SD1.5 em Configurações → Geração de imagens.');
  if(status.generationAvailable===false)throw Error('O motor deste modelo de imagens não está disponível nesta build.');if(status.models?.find(m=>m.id===status.selected)?.state==='INCOMPATIBLE')throw Error('O modelo selecionado é incompatível com o motor disponível.');
  const text=original??(chat.state().draft.trim()||prompt('Descreva a imagem que deseja gerar:')||'').trim();if(!text)return;
  if(text.length>2000)throw Error('Use uma descrição de até 2.000 caracteres.');
  const request=crypto.randomUUID();chat.begin(request,text,options.rememberUser===true,status);
  if(!api.generate(request,text)){chat.update({request,state:'ERROR',error:'O motor de imagens está ocupado.'});throw Error('O motor de imagens está ocupado.')}
  window.harunaImagesBusy=true;window.harunaImageRunning=true;window.harunaImageMode=false;button.setAttribute('aria-pressed','false');
 };
 button.setAttribute('aria-controls','imageGenerationPanel');button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','false');button.onclick=()=>{window.harunaImageMode=window.harunaToggleImagePanel?window.harunaToggleImagePanel():!window.harunaImageMode;button.setAttribute('aria-pressed',String(window.harunaImageMode))};
 chat.refresh();
 let modelStatusKey='',wasImageBusy=false;
 function update(){if(document.hidden)return;try{
  const s=JSON.parse(api.status());window.harunaImagesBusy=!!s.imageEngineBusy||s.state==='RESTORING_LLM'||!!(s.busy&&pending(s.generation?.state));button.disabled=!!s.busy;const stop=document.querySelector('#stop'),send=document.querySelector('#send');window.harunaImageRunning=!!(s.busy&&pending(s.generation?.state))||s.state==='RESTORING_LLM';stop.disabled=window.harunaImageRunning&&s.state==='RESTORING_LLM';if(window.harunaImageRunning){stop.hidden=false;send.hidden=true;stop.onclick=()=>{const request=s.generation?.request;if(request)requestStop(request)}}else if(wasImageBusy){stop.hidden=true;send.hidden=false;stop.onclick=()=>window.dispatchEvent(new CustomEvent('haruna-stop-text'))}wasImageBusy=window.harunaImageRunning;
  const key=[s.state,s.busy,s.loaded].join('/');if(key!==modelStatusKey){modelStatusKey=key;window.dispatchEvent(new CustomEvent('haruna-native-status-changed'))}
  for(const j of chat.entries().filter(j=>pending(j.state))){
   const current=s.generation?.request===j.request?s.generation:null;
   const saved=JSON.parse(api.result(j.request));const next=current||(saved.request?saved:null);
   if(next&&pending(next.state)&&!s.busy&&!s.imageEngineBusy){chat.update({...next,state:'INTERRUPTED'});continue}
   if(next&&(!pending(next.state)||(next.results?.length||0)!==(j.results?.length||0))){if(!pending(next.state)&&stoppingRequest===j.request)stoppingRequest=null;chat.update(next);continue}
   if(next){if(next.state==='RESTORING_LLM'&&j.state!==next.state){chat.update(next);continue}const card=document.querySelector(`[data-image-job="${j.request}"]`);if(card){card.querySelector('.image-job-state').textContent=stoppingRequest===j.request?'Interrompendo…':s.state==='RESTORING_LLM'?'Imagem finalizada. Recarregando o GGUF anterior…':(next.count>1?`Gerando imagem ${next.current} de ${next.count} · `:'')+progressLabel(s.nativeProgress);let preview=card.querySelector('.image-live-preview');if(s.previewUrl){if(!preview){preview=document.createElement('img');preview.className='image-live-preview';preview.alt='Prévia real por projeção dos latentes, aproximada';card.insertBefore(preview,card.querySelector('.model-actions'))}if(preview.dataset.source!==s.previewUrl){preview.dataset.source=s.previewUrl;preview.src=s.previewUrl}}else preview?.remove();const p=card.querySelector('progress');if(s.nativeProgress?.[0]===3){p.max=(next.count||1)*s.nativeProgress[2];p.value=((next.current||1)-1)*s.nativeProgress[2]+s.nativeProgress[1]}else p.removeAttribute('value')}}
   else if(!s.busy&&!s.imageEngineBusy)chat.update({request:j.request,state:'INTERRUPTED'});
  }
 }catch{/* The next status poll can recover a temporarily unavailable bridge. */}}
 const timer=setInterval(update,700);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});update();
}
