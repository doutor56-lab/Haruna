// Startup guard: keep failures visible instead of leaving Haruna looking alive but inert.
window.__harunaBooted=false;
function showBootError(message){
  const brain=document.querySelector('#brain');
  if(brain&&!window.__harunaBooted){brain.textContent='Erro na interface';brain.title=String(message||'Falha ao iniciar a interface')}
}
window.addEventListener('error',e=>showBootError(e.message));
window.addEventListener('unhandledrejection',e=>showBootError(e.reason?.message||e.reason));
setTimeout(()=>{if(!window.__harunaBooted)showBootError('A interface não concluiu a inicialização. Verifique os assets JavaScript deste APK.')},2500);
