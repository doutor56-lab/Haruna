// UI-only interpretation of existing DBG observations. Never configures the runtime.
const bool=value=>typeof value==='boolean'?value:null;
export function runtimeState(source={}){
 const obs=source.llm?.observation||source, r=obs.runtime||{}, p=obs.decisionProbe||{}, c=obs.debugControls||{};
 return {available:source.available!==false&&!!(obs.runtime||obs.decisionProbe),
  fixedSeed:bool(p.fixedSeedDBG),
  faOff:bool(p.flashOffRequestedDBG),faContext:r.flashRequested??null,faActual:r.flashEffective===1?'Ativo':r.flashEffective===0?'Inativo':'Não confirmado',
  cpuPending:bool(c.cpuConservativePending),cpuActual:bool(p.cpuConservativeEffectiveDBG),cpuAvailable:bool(c.cpuConservativeAvailable),cpuFallback:bool(p.cpuLoadFallbackDBG),
  cpuVariant:typeof r.cpuVariant==='string'?r.cpuVariant:null,threads:r.threads??null,threadsBatch:r.threadsBatch??null};
}
export function readRuntime(bridge,fallback={}){
 try{if(bridge?.labRuntimeState&&bridge.labAvailable?.()===true)return runtimeState(JSON.parse(bridge.labRuntimeState()))}catch{}
 return runtimeState(fallback);
}
export function runtimeRows(s){return [
 ['FA solicitada',s.faOff===true?'OFF experimental':s.faOff===false?'Padrão / Auto':'Não confirmado'],
 ['FA do contexto carregado',s.faContext??'Não confirmado'],['FA efetiva',s.faActual],
 ['CPU solicitada · próximo processo',s.cpuPending===true?'Conservadora':s.cpuPending===false?'Atual / automática':'Não confirmado'],
 ['CPU efetiva',s.cpuActual===true?'Conservadora':s.cpuActual===false?'Atual / automática':'Não confirmado'],
 ['Variante efetiva',s.cpuVariant??'Não confirmado'],['Biblioteca conservadora',s.cpuAvailable===true?'Disponível':s.cpuAvailable===false?'Indisponível':'Não confirmado'],
 ['Fallback de CPU observado',s.cpuFallback===true?'Sim':s.cpuFallback===false?'Não':'Não confirmado']];}
export function experimentIssues(s){
 const blocking=[],warnings=[];
 if(s.fixedSeed===true)blocking.push('Restaure a seed/sampler DBG herdados antes do benchmark. A seed do laboratório é um controle separado.');
 if(s.faOff===true)blocking.push('FA OFF é uma capacidade DBG parcial: exige recarregar o modelo, mas o benchmark canônico atual recusa FA OFF. Restaure Padrão / Auto para executá-lo. Nenhum suporte nativo foi acrescentado.');
 const disabled=typeof s.faContext==='string'&&/^(disabled|off)$/i.test(s.faContext);
 if(s.faOff===false&&disabled)blocking.push('Padrão / Auto solicitado, mas o contexto ainda foi criado com FA OFF. Recarregue o modelo antes do benchmark.');
 if(s.cpuPending!==null&&s.cpuActual!==null&&s.cpuPending!==s.cpuActual)blocking.push('CPU solicitada e efetiva diferem. A troca exige novo processo; não há hot-swap nem reinício automático.');
 if(s.cpuFallback===true)warnings.push('O runtime observou fallback da CPU conservadora; confira a biblioteca efetiva.');
 if(!s.available||s.faActual==='Não confirmado'||s.cpuActual===null)warnings.push('Há estados efetivos não confirmados; permanecem N/D, sem atribuir ao teste uma aceleração não comprovada.');
 return {blocking,warnings};
}
export function runtimeChanged(saved,current){
 if(!saved)return false;
 return ['faOff','faContext','cpuPending','cpuActual','cpuVariant'].some(k=>saved[k]!==null&&current[k]!==null&&saved[k]!==current[k]);
}
