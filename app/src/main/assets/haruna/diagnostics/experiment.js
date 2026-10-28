// Explicit diagnostic A/B only. Never auto-applies, never reloads a model/process.
export function experimentControls(native,ticket){
 const section=document.createElement('details');section.className='haruna-dbg-card';
 const heading=document.createElement('summary');heading.textContent='Experimento temporário · degeneração Samsung';
 const body=document.createElement('div'),note=document.createElement('p');note.className='haruna-dbg-note';
 note.textContent='Altera somente o experimento solicitado. Seed 424242: próxima geração. FA: descarregue e carregue o modelo. CPU: force a parada do app e reabra. Seed/FA voltam ao padrão ao encerrar o processo; a seleção de CPU deve ser restaurada aqui. Não altera prompt, sampling normal, memória ou RAG.';
 body.append(note);const obs=native.llm?.observation||{},probe=obs.decisionProbe||{},controls=obs.debugControls||{};
 function choice(label,checked,disabled=false){
  const row=document.createElement('p'),wrap=document.createElement('label'),input=document.createElement('input');
  input.type='checkbox';input.checked=checked;input.disabled=disabled;wrap.append(input,document.createTextNode(' '+label));row.append(wrap);body.append(row);return input;
 }
 const fixed=choice('Seed DBG fixa: 424242',probe.fixedSeedDBG===true);
 const fa=choice('Flash Attention desligada (somente experimento)',probe.flashOffRequestedDBG===true);
 const cpu=choice('CPU conservadora armv8.0_1 (próximo processo)',controls.cpuConservativePending===true,controls.cpuConservativeAvailable!==true);
 const apply=document.createElement('button'),restore=document.createElement('button'),status=document.createElement('p');
 apply.type=restore.type='button';apply.textContent='Aplicar experimento';restore.textContent='Restaurar padrões';status.className='haruna-dbg-note';status.setAttribute('role','status');
 async function send(reset){
  if(reset){fixed.checked=false;fa.checked=false;cpu.checked=false}
  try{
   if(!window.HarunaDiagnostics?.configureExperiment)throw Error();
   apply.disabled=restore.disabled=true;status.textContent='Aguardando aplicação no runtime ocioso…';
   window.HarunaDiagnostics.configureExperiment(ticket,JSON.stringify({fixedSeed:fixed.checked,flashOff:fa.checked,conservativeCpu:cpu.checked}));
  }catch{apply.disabled=restore.disabled=false;status.textContent='Controle Android indisponível.'}
 }
 apply.onclick=()=>send(false);restore.onclick=()=>send(true);
 const listener=event=>{if(event.detail?.ticket!==ticket)return;apply.disabled=restore.disabled=false;status.textContent=event.detail.message};
 window.addEventListener('haruna-dbg-experiment',listener);
 body.append(apply,restore,status);section.append(heading,body);
 return {element:section,dispose:()=>window.removeEventListener('haruna-dbg-experiment',listener)};
}
