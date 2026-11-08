// Move existing controls, never clone them or change their persistence/backend.
const settings=document.querySelector('#settingsView'),host=document.querySelector('#modelList')?.closest('.page-card');
if(settings&&host){
 host.id='localModels';const title=host.querySelector('.section-title');const models=document.createElement('section');for(const node of [...host.children])if(node!==title)models.append(node);

 const tabs=document.createElement('div');tabs.className='local-model-tabs';tabs.setAttribute('role','tablist');
 const images=document.createElement('section'),voice=document.createElement('section');
 const panels=[models,images,voice];
 const ram=document.createElement('section');ram.className='ram-monitor';ram.setAttribute('aria-label','Memória RAM');
 ram.innerHTML=`<div class="ram-monitor-head"><strong>Memória RAM</strong><span class="ram-live">Dados do Android</span></div>
 <div class="ram-metrics"><div class="ram-metric"><small>Em uso no sistema</small><strong data-ram-used>—</strong><span data-ram-total>de —</span></div><div class="ram-metric"><small>Disponível</small><strong data-ram-free>—</strong><span data-ram-free-percent>—</span></div></div>
 <div class="ram-usage"><div class="ram-usage-label"><span>Utilização do sistema</span><strong data-ram-percent>—</strong></div><progress data-ram-bar max="100" aria-label="Utilização da RAM do sistema"></progress></div>
 <div class="ram-process"><span>Consumo da Haruna (PSS)</span><strong data-ram-process>—</strong></div>
 <details class="ram-technical"><summary>Detalhes técnicos</summary><p data-runtime>Dados ainda não disponíveis.</p></details>`;
 models.append(ram);
 const voiceLinks=document.createElement('div');voiceLinks.className='model-actions';voice.append(voiceLinks);
 const emptyImage=document.createElement('p');emptyImage.className='model-empty';emptyImage.textContent='As configurações de modelos de imagem aparecerão aqui quando disponíveis.';images.append(emptyImage);
 const emptyVoice=document.createElement('p');emptyVoice.className='model-empty';emptyVoice.textContent='Os modelos de reconhecimento e síntese de voz aparecerão aqui quando disponíveis.';voice.append(emptyVoice);
 function announce(){window.dispatchEvent(new CustomEvent('haruna-model-performance',{detail:!settings.hidden&&!models.hidden}))}
 const activateTab=i=>{panels.forEach((p,j)=>p.hidden=j!==i);[...tabs.children].forEach((t,j)=>{t.setAttribute('aria-selected',String(i===j));t.tabIndex=j===i?0:-1});announce()};
 for(const [i,name]of ['Linguagem','Imagem','Voz'].entries()){
  const b=document.createElement('button');b.type='button';b.textContent=name;b.id='haruna-local-model-tab-'+i;b.setAttribute('role','tab');b.setAttribute('aria-controls','haruna-local-model-panel-'+i);b.setAttribute('aria-selected',String(i===0));b.tabIndex=i===0?0:-1;panels[i].id='haruna-local-model-panel-'+i;panels[i].setAttribute('role','tabpanel');panels[i].setAttribute('aria-labelledby',b.id);
  b.onclick=()=>activateTab(i);b.onkeydown=e=>{const next=e.key==='ArrowRight'?i+1:e.key==='ArrowLeft'?i-1:e.key==='Home'?0:e.key==='End'?panels.length-1:null;if(next===null)return;e.preventDefault();const target=(next+panels.length)%panels.length;activateTab(target);tabs.children[target].focus()};tabs.append(b)
 }
 host.append(tabs,...panels);
 if(title?.querySelector('strong'))title.querySelector('strong').textContent='Modelos de IA';
 // Keep exactly one live instance of each setting. append() MOVES nodes; it never clones them.
 const imageSelector='.vision-settings,[data-model-group="images"],.image-settings-card';
 const voiceSelector='.recognition-settings,.speech-settings';
 function move(){
  // Dynamic settings may be inserted after startup, including inside wrapper cards.
  // Search only outside the three destination panels to avoid moving children twice.
  for(const node of [...settings.querySelectorAll(imageSelector)]){
   if(host.contains(node))continue;
   images.append(node);
  }
  for(const node of [...settings.querySelectorAll(voiceSelector)]){
   if(host.contains(node))continue;
   voice.append(node);
  }
  // Native visual-model controls may arrive after startup. Hide only the
  // introductory description, never model state, installation or import actions.
  for(const card of images.querySelectorAll('.vision-settings')){
   for(const paragraph of card.querySelectorAll('p')){
    const value=(paragraph.textContent||'').trim();
    if(/^SmolVLM-500M\s*[·-]\s*CPU\s*[·-]/i.test(value))paragraph.hidden=true;
   }
  }
  // Reuse the original native voice widgets; decorate them without duplicating
  // controls or replacing their event handlers.
  for(const card of voice.querySelectorAll('.recognition-settings,.speech-settings')){
   card.classList.add('haruna-voice-model-card');
   const isStt=card.matches('.recognition-settings');
   card.dataset.voiceKind=isStt?'stt':'tts';
   if(!card.querySelector(':scope > .haruna-voice-heading')){
    const heading=document.createElement('div');
    heading.className='haruna-voice-heading';
    const symbol=document.createElement('span');
    symbol.className='haruna-voice-symbol';
    symbol.setAttribute('aria-hidden','true');
    symbol.textContent=isStt?'♩':'♫';
    const label=document.createElement('strong');
    label.textContent=isStt?'Reconhecimento de voz':'Síntese de voz';
    heading.append(symbol,label);
    card.prepend(heading);
   }
  }
  emptyImage.hidden=!!images.querySelector(imageSelector);
  emptyVoice.hidden=!!voice.querySelector(voiceSelector);
  // Keep original navigation and help controls intact. Presentation is handled
  // by CSS; deleting controls by their translated labels is unsafe.

 }

 const relocationObserver=new MutationObserver(move);
 relocationObserver.observe(settings,{childList:true});move();activateTab(0);
 window.addEventListener('pagehide',()=>relocationObserver.disconnect(),{once:true});
 const visibilityObserver=new MutationObserver(announce);
 visibilityObserver.observe(settings,{attributes:true,attributeFilter:['hidden']});
 window.addEventListener('pagehide',()=>visibilityObserver.disconnect(),{once:true});
 announce();

 const fmt=n=>Number.isFinite(n)?(n/1073741824).toFixed(2)+' GiB':'N/D';
 window.addEventListener('haruna-memory-observation',e=>{
  const m=e.detail?.memory||{},total=m.systemTotalBytes,free=m.systemAvailableBytes,used=Number.isFinite(total)&&Number.isFinite(free)?Math.max(0,total-free):NaN;
  const set=(selector,value)=>{ram.querySelector(selector).textContent=value};
  set('[data-ram-used]',fmt(used));set('[data-ram-total]','de '+fmt(total));set('[data-ram-free]',fmt(free));
  const percent=Number.isFinite(used)&&total>0?Math.min(100,Math.max(0,100*used/total)):NaN;
  set('[data-ram-percent]',Number.isFinite(percent)?percent.toFixed(1)+'%':'—');
  set('[data-ram-free-percent]',Number.isFinite(percent)?(100-percent).toFixed(1)+'% da RAM':'—');
  const bar=ram.querySelector('[data-ram-bar]');if(Number.isFinite(percent))bar.value=percent;else bar.removeAttribute('value');
  set('[data-ram-process]',fmt(m.pssBytes));
  const r=e.detail?.llm?.observation?.runtime||{};
  set('[data-runtime]',`Decode / batch: ${r.threads??'N/D'} / ${r.threadsBatch??'N/D'} · contexto: ${r.nCtx??'N/D'} · CPU: ${r.cpuVariant??'N/D'}`);
 });

}
// The existing knowledge card and native document library become the independent Library page.
const library=document.querySelector('#libraryView'),knowledge=document.querySelector('#knowledgeList')?.closest('.page-card');
if(library&&knowledge)library.append(knowledge);
const memory=document.querySelector('#memoryView');if(memory&&library){const move=()=>{for(const n of [...memory.querySelectorAll('.document-library')])library.append(n)};new MutationObserver(move).observe(memory,{childList:true,subtree:true});move()}
