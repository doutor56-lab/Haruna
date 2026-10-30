// The footer stays last even when existing optional settings cards are mounted later.
const settings=document.querySelector('#settingsView');
if(settings){
 const footer=document.createElement('footer');footer.className='haruna-credits';footer.setAttribute('aria-label','Desenvolvimento da Haruna');
 for(const text of ['Haruna © 2026','João Victor — Proxys Labs','Desenvolvido com Inteligência Artificial.']){const line=document.createElement('span');line.textContent=text;footer.appendChild(line)}
 settings.appendChild(footer);
 const observer=new MutationObserver(()=>{if(settings.lastElementChild!==footer)settings.appendChild(footer)});
 observer.observe(settings,{childList:true});window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
}
