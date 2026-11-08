/* Windows-only CPU/Vulkan controls attached to the original Android image page. */
(()=>{
 'use strict';
 const desktop=window.HarunaDesktop;
 if(!desktop)return;
 function mount(){
  const host=document.querySelector('#settingsView .image-settings-card');
  if(!host||document.getElementById('desktopVulkanSettings'))return false;
  const section=document.createElement('section');
  section.id='desktopVulkanSettings';
  section.className='desktop-vulkan-settings';
  const heading=document.createElement('strong');heading.textContent='Motor de imagens no Windows';
  const backendLabel=document.createElement('label');backendLabel.textContent='Processamento';
  const backend=document.createElement('select');backend.setAttribute('aria-label','Motor de processamento de imagens');
  for(const [value,title]of [['cpu','CPU (compatibilidade)'],['vulkan','Vulkan (GPU)']]){
   const o=document.createElement('option');o.value=value;o.textContent=title;backend.append(o);
  }
  backendLabel.append(backend);
  const budgetLabel=document.createElement('label');budgetLabel.textContent='Orçamento Vulkan (GiB)';
  const budget=document.createElement('input');budget.type='number';budget.min='0.5';budget.max='4';budget.step='0.5';budgetLabel.append(budget);
  const lowLabel=document.createElement('label');lowLabel.className='desktop-vulkan-check';
  const low=document.createElement('input');low.type='checkbox';lowLabel.append(low,document.createTextNode(' Pouca memória (recomendado)'));
  const actions=document.createElement('div');actions.className='model-actions';
  const save=document.createElement('button');save.type='button';save.textContent='Salvar motor';
  const devices=document.createElement('button');devices.type='button';devices.textContent='Detectar GPUs Vulkan';
  actions.append(save,devices);
  const status=document.createElement('p');status.className='settings-note';status.setAttribute('role','status');
  const help=document.createElement('small');help.textContent='O motor Vulkan é o runtime Windows anterior, verificado por hash. A detecção não confirma que o driver suporta uma geração real. CPU é o padrão seguro.';
  section.append(heading,backendLabel,budgetLabel,lowLabel,actions,status,help);
  host.querySelector('.section-title')?.after(section);
  const refresh=()=>{
   const images=desktop.snapshot()?.images||{};
   if(document.activeElement!==backend)backend.value=images.backend||'cpu';
   if(document.activeElement!==budget)budget.value=images.vramBudget??2;
   if(document.activeElement!==low)low.checked=!!images.lowMemory;
   budget.disabled=images.busy||backend.value!=='vulkan';
   backend.disabled=save.disabled=!!images.busy;
   status.textContent=images.busy?'Aguarde a geração em andamento.':images.engineAvailable===false?'O executável para o motor escolhido não está disponível nesta instalação.':'Motor solicitado: '+(images.backend||'cpu').toUpperCase();
  };
  backend.onchange=()=>{budget.disabled=backend.value!=='vulkan'};
  save.onclick=()=>{
   try{
    const response=JSON.parse(desktop.configure({backend:backend.value,vramBudget:Number(budget.value),lowMemory:low.checked}));
    if(response.status==='error')throw Error(response.error||'Configuração inválida.');
    status.textContent='Preferências salvas no computador.';
    refresh();
   }catch(e){status.textContent='Não foi possível salvar: '+(e.message||e);}
  };
  devices.onclick=async()=>{
   devices.disabled=true;status.textContent='Consultando o motor Vulkan local…';
   try{
    const result=await desktop.devices();
    status.textContent=result.error||result.devices?.join(' • ')||'Nenhuma GPU Vulkan detectada pelo runtime.';
   }catch(e){status.textContent='Detecção indisponível: '+(e.message||e);}
   finally{devices.disabled=false;}
  };
  desktop.subscribe(refresh);
  refresh();
  return true;
 }
 if(!mount()){
  const observer=new MutationObserver(()=>{if(mount())observer.disconnect()});
  observer.observe(document.documentElement,{childList:true,subtree:true});
 }
})();