/** UI labels only; never changes the GGUF selected or the native inference configuration. */
export function modelLabel(file=''){
 const name=String(file).split(/[\\/]/).pop(),key=name.toLowerCase();
 if(/qwen3[._-]?5.*2b|qwen3[._-]?5/.test(key))return 'Qwen3.5';
 if(/phi[-_. ]?4.*mini|phi[-_. ]?4/.test(key))return 'Phi-4';
 if(/qwen.*0[._]?5b/.test(key))return 'Qwen 0.5B';
 return name.replace(/\.gguf$/i,'').replace(/[-_]/g,' ').slice(0,18)||'Modelo';
}
export function modelStatus(status){
 const active=status.modelLoaded===true&&['active','generating'].includes(status.state);
 return active?`${modelLabel(status.modelName)} local ativo`:({basic:'Modo básico',not_loaded:'Modelo não carregado',loading:'Carregando modelo…',error:'Modelo indisponível'}[status.state]||status.state);
}
