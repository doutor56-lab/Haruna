// Android-only controls, using the existing native owner and preference store.
const api=window.HarunaAndroid;
if(api?.getInferenceSettings&&api?.configureInference){
 const host=document.querySelector('#haruna-local-model-panel-0');
 if(host){
  const panel=document.createElement('details');panel.className='inference-settings';
  panel.innerHTML='<summary>Inferência avançada · por modelo</summary><p data-model></p><p>O template Jinja vem do GGUF. Thinking continua no botão da barra do modelo. Valores zero de threads preservam a seleção automática.</p><form><div class="inference-fields"></div><p>Aplicado na próxima geração. Contexto, batch, microbatch e Flash Attention recriam o contexto quando necessário. Isso reinicia o cache nativo, sem apagar mensagens.</p><div class="model-actions"><button type="submit">Salvar para este modelo</button><button type="button" data-restore>Restaurar padrão do modelo</button></div></form><p data-feedback role="status"></p><dl data-metrics></dl>';
  host.append(panel);
  const fields=[['temperature','Temperatura',0,2,.05],['topK','Top-K',0,1000,1],['topP','Top-P',.0001,1,'any'],['minP','Min-P',0,1,.01],['repeat','Repetição',.5,2,.05],['presence','Presença',-2,2,.1],['frequency','Frequência',-2,2,.1],['seed','Seed (-1: aleatória)',-1,4294967294,1],['maxTokens','Máximo de tokens de saída',16,4096,1],['threads','Threads decode',0,16,1],['threadsBatch','Threads prefill',0,16,1],['nBatch','Batch',32,1024,1],['nUbatch','Microbatch',32,512,1]];
  const form=panel.querySelector('form'),grid=panel.querySelector('.inference-fields'),inputs={};let selected=null,timer=null;
  for(const [key,title,min,max,step] of fields){const label=document.createElement('label');label.textContent=title;const input=document.createElement('input');input.type='number';input.name=key;input.min=min;input.max=max;input.step=step;input.required=true;label.append(input);grid.append(label);inputs[key]=input;}
  for(const [key,title,options] of [['nCtx','Contexto',[[1024,'1024'],[2048,'2048'],[4096,'4096'],[8192,'8192']]],['flashAttention','Flash Attention solicitada',[['auto','Automática'],['off','Desativada'],['on','Ativada']]]]){const label=document.createElement('label');label.textContent=title;const select=document.createElement('select');for(const [value,text]of options){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}label.append(select);grid.append(label);inputs[key]=select;}
  const feedback=panel.querySelector('[data-feedback]'),fmt=(v,digits=1)=>Number.isFinite(v)&&v>=0?v.toFixed(digits):'N/D';
  function refresh(force=false){
   if(!panel.open||document.hidden||host.hidden)return;
   try{
    const status=JSON.parse(api.getStatus()),data=JSON.parse(api.getInferenceSettings()),ready=data.status==='ok',busy=status.state==='generating'||status.state==='loading';
    panel.querySelector('[data-model]').textContent=ready?`${status.modelName} · ${data.settings.profile==='smollm3'?'SmolLM3 · recomendação oficial de temperatura 0,6 / top-p 0,95':data.settings.profile==='custom'?'Preferências personalizadas':'Haruna padrão'} · local`:(data.error||'Carregue um GGUF.');
    for(const field of form.elements)field.disabled=!ready||busy;
    if(!ready)return;
    if(force||selected!==status.modelName){selected=status.modelName;for(const [key,input]of Object.entries(inputs))input.value=data.settings[key];}
    const o=data.observation||{},g=o.generation||{},r=o.runtime||{},prefix=o.prefix||{};
    const rows=[['TTFT nativo',fmt(g.firstDeltaUs/1e6,2)+' s'],['Geração',fmt(g.outputTokens>0&&g.decodeUs>0?g.outputTokens*1e6/g.decodeUs:NaN)+' tok/s'],['Prefill',fmt(g.prefillTokens>0&&g.prefillUs>0?g.prefillTokens*1e6/g.prefillUs:NaN)+' tok/s'],['Entrada / saída',`${g.inputTokens>=0?g.inputTokens:'N/D'} / ${g.outputTokens>=0?g.outputTokens:'N/D'}`],['Contexto / batch / microbatch efetivos',`${r.nCtx??'N/D'} / ${r.nBatch??'N/D'} / ${r.nUbatch??'N/D'}`],['Threads decode / prefill efetivas',`${r.threads??'N/D'} / ${r.threadsBatch??'N/D'}`],['Cache reutilizado',`${prefix.reusedTokens??'N/D'} tokens`],['Backend efetivo',r.bufferDevices||'N/D'],['Flash Attention efetiva',r.flashEffective===1?'Ativa':r.flashEffective===0?'Inativa':'Não confirmada'],['K / V efetivos',`${r.kvActualK??'N/D'} / ${r.kvActualV??'N/D'}`],['Memória dos buffers de contexto',Number.isFinite(r.contextBufferBytes)?fmt(r.contextBufferBytes/1048576)+' MiB':'N/D']];
    const list=panel.querySelector('[data-metrics]');list.replaceChildren();for(const [title,value]of rows){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=title;dd.textContent=value;row.append(dt,dd);list.append(row);}
   }catch{feedback.textContent='Não foi possível consultar o runtime.';}
  }
  form.onsubmit=event=>{event.preventDefault();const value={};for(const [key,input]of Object.entries(inputs))value[key]=key==='flashAttention'?input.value:Number(input.value);try{const result=JSON.parse(api.configureInference(JSON.stringify(value)));feedback.textContent=result.status==='ok'?'Preferências salvas para a próxima geração.':result.error;refresh(true);}catch{feedback.textContent='Não foi possível salvar as preferências.';}};
  panel.querySelector('[data-restore]').onclick=()=>{try{const result=JSON.parse(api.configureInference('{"restoreDefaults":true}'));feedback.textContent=result.status==='ok'?'Padrão do modelo restaurado.':result.error;refresh(true);}catch{feedback.textContent='Não foi possível restaurar.';}};
  panel.addEventListener('toggle',()=>{clearInterval(timer);timer=null;if(panel.open){refresh(true);timer=setInterval(refresh,5000);}});
  window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
 }
}
