// The existing memory-toast component supplies the icon, typography, colors and borders.
const indicator=document.createElement('div');indicator.className='memory-toast rag-consulted-toast';indicator.hidden=true;
indicator.textContent='Memória consultada';indicator.setAttribute('role','status');document.querySelector('.app')?.appendChild(indicator);
let timer;
window.addEventListener('haruna-rag-result',event=>{
 if(!(event.detail?.succeeded>0)||document.hidden||document.querySelector('#chatView')?.hidden)return;
 clearTimeout(timer);indicator.hidden=false;timer=setTimeout(()=>{indicator.hidden=true},2300);
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(timer);indicator.hidden=true}});
