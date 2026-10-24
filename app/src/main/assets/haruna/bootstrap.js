// Tiny startup guard loaded before the module graph. If module initialization fails,
// keep a visible diagnostic instead of leaving Haruna looking alive but inert.
window.__harunaBooted=false;
window.addEventListener('error',e=>{
  const brain=document.querySelector('#brain');
  if(brain&&!window.__harunaBooted){brain.textContent='Erro na interface';brain.title=e.message||'Falha ao iniciar a interface'}
});
window.addEventListener('unhandledrejection',e=>{
  const brain=document.querySelector('#brain');
  if(brain&&!window.__harunaBooted){brain.textContent='Erro na interface';brain.title=String(e.reason?.message||e.reason||'Falha ao iniciar a interface')}
});
