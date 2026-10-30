// A persisted choice is never evidence that weights are resident in the current process.
export function presentModelStatus(status={}){
 const ready=status.modelLoaded===true&&['active','generating'].includes(status.state)&&(!status.modelState||status.modelState==='READY');
 const name=ready&&typeof status.displayName==='string'?status.displayName.trim():'';
 const labels={basic:'Modo básico',not_loaded:'Modelo não carregado',loading:'Carregando modelo…',switching:'Trocando modelo…',unloading:'Descarregando modelo…',active:'LLM local ativo',generating:'Haruna está respondendo…',error:'Modelo indisponível'};
 return {ready,title:name?`Haruna — ${name}`:'Haruna',name:name||'Local',label:labels[status.state]||'Modelo indisponível',busy:['loading','switching','unloading'].includes(status.state)};
}
