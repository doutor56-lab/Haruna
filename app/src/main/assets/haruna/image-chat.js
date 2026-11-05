// SD1.5 jobs use the same conversation and persistence as text; no remote requests.
const api=window.HarunaImages,chat=window.harunaChatImages;
const uuid=/^[0-9a-f-]{36}$/;
const pending=s=>['LOADING','GENERATING'].includes(s);
const phases=['Preparando','Carregando modelo','Codificando descrição','Gerando imagem','Decodificando imagem','Gravando PNG'];
export function progressLabel(p){if(!Array.isArray(p)||p.length!==3)return 'Preparando modelo…';return p[0]===3?`${phases[3]} · etapa ${p[1]} de ${p[2]}`:(phases[p[0]]||'Preparando modelo…')}
window.harunaRenderImageCard=(bubble,message)=>{
 const j=message.image;if(!uuid.test(j.request))return;
 bubble.replaceChildren();bubble.classList.add('image-card');bubble.dataset.imageJob=j.request;
 const title=document.createElement('strong');title.textContent='Geração de imagem';bubble.append(title);
 const prompt=document.createElement('p');prompt.textContent=j.prompt||message.content;bubble.append(prompt);
 const status=document.createElement('p');status.className='image-job-state';status.setAttribute('role','status');
 status.textContent=({LOADING:'Preparando modelo…',GENERATING:'Gerando imagem…',COMPLETED:'Imagem gerada localmente',CANCELLED:'Geração cancelada',INTERRUPTED:'Geração interrompida',ERROR:'Não foi possível gerar a imagem'})[j.state]||'Estado indisponível';bubble.append(status);
 const actions=document.createElement('div');actions.className='model-actions';bubble.append(actions);
 const button=(text,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=fn;actions.append(b)};
 if(j.state==='COMPLETED'){
  const image=document.createElement('img');image.src='/generated/'+j.request+'.png';image.alt=j.prompt||'Imagem gerada pela Haruna';image.loading='lazy';image.onerror=()=>{status.textContent='PNG não encontrado no dispositivo'};bubble.insertBefore(image,actions);
  button('Visualizar',()=>api?.open(j.request,false));button('Salvar',()=>api?.save(j.request));button('Compartilhar',()=>api?.open(j.request,true));
  if(j.saveWarning){const warning=document.createElement('small');warning.textContent=j.saveWarning;bubble.append(warning)}
 }else if(pending(j.state)){
  const progress=document.createElement('progress');progress.setAttribute('aria-label','Progresso da imagem');bubble.insertBefore(progress,actions);
  button('Cancelar',()=>api?.cancelGeneration(j.request));
 }else if(j.error){const error=document.createElement('small');error.textContent=j.error;bubble.append(error)}
};
if(api&&chat){
 const button=document.createElement('button');button.id='generateImage';button.className='attach image-generate';button.type='button';button.title='Gerar imagem';button.setAttribute('aria-label','Gerar imagem');
 // Same line icon weight, size and button style as the existing composer controls.
 button.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/></svg>';
 document.querySelector('#attach')?.after(button);
 button.onclick=()=>{try{
  if(chat.state().busy||JSON.parse(api.status()).busy)throw Error('Aguarde a operação atual da Haruna.');
  if(chat.state().attachments)throw Error('Envie ou remova os anexos antes de gerar uma imagem.');
  const status=JSON.parse(api.status());if(!status.selected)throw Error('Adicione e selecione um modelo SD1.5 em Configurações → Geração de imagens.');
  const text=(chat.state().draft.trim()||prompt('Descreva a imagem que deseja gerar:')||'').trim();if(!text)return;
  if(text.length>2000)throw Error('Use uma descrição de até 2.000 caracteres.');
  const request=crypto.randomUUID();if(!api.generate(request,text))throw Error('O motor de imagens está ocupado.');
  window.harunaImagesBusy=true;chat.begin(request,text);
 }catch(e){alert(e.message)}};
 chat.refresh();
 function update(){try{
  const s=JSON.parse(api.status());window.harunaImagesBusy=!!s.busy;button.disabled=!!s.busy;
  for(const j of chat.entries().filter(j=>pending(j.state))){
   const current=s.generation?.request===j.request?s.generation:null;
   const saved=JSON.parse(api.result(j.request));const next=saved.request?saved:current;
   if(next&&!pending(next.state)){chat.update(next);continue}
   if(next){const card=document.querySelector(`[data-image-job="${j.request}"]`);if(card){card.querySelector('.image-job-state').textContent=progressLabel(s.nativeProgress);const p=card.querySelector('progress');if(s.nativeProgress?.[0]===3){p.max=s.nativeProgress[2];p.value=s.nativeProgress[1]}else p.removeAttribute('value')}}
   else if(!s.busy&&!s.imageEngineBusy)chat.update({request:j.request,state:'INTERRUPTED'});
  }
 }catch{/* The next status poll can recover a temporarily unavailable bridge. */}}
 const timer=setInterval(update,700);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});update();
}
