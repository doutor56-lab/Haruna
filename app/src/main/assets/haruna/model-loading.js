import llm from './llm-engine.js';
const messages=document.querySelector('#messages');
const card=document.createElement('section');card.className='llm-loading-card';card.setAttribute('aria-label','Carregamento do modelo');
card.innerHTML='<div class="loading-orb" aria-hidden="true"></div><strong data-title role="status">Preparando Haruna…</strong><p data-model></p><progress aria-label="Carregamento em andamento"></progress><small data-time></small><p data-tip></p>';
const titles={initializing:'Iniciando o motor local…',reading_model:'Carregando o modelo…',preparing_response:'Preparando a primeira resposta…'};
const tips=['Suas conversas continuam neste dispositivo.','Você pode navegar pela Biblioteca enquanto espera.','Seu rascunho será preservado até o modelo ficar pronto.'];
let timer=null,observing=false,lastStart=0;
const observer=new MutationObserver(()=>{if(observing&&!card.isConnected)messages?.prepend(card)});
function refresh(){
 clearTimeout(timer);timer=null;
 let s;try{s=window.HarunaAndroid?JSON.parse(window.HarunaAndroid.getStatus()):llm.getState()}catch{return}
 if(s.state!=='loading'){
  observing=false;observer.disconnect();card.remove();lastStart=0;return;
 }
 if(!lastStart)lastStart=performance.now();
 const data=s.loading||{},seconds=Math.floor((Number.isFinite(data.elapsedMs)?data.elapsedMs:performance.now()-lastStart)/1000);
 card.querySelector('[data-title]').textContent=titles[data.phase]||'Preparando Haruna…';
 card.querySelector('[data-model]').textContent=data.modelName||s.modelName||'Modelo local';
 card.querySelector('[data-time]').textContent=`${seconds} s decorridos`;
 card.querySelector('[data-tip]').textContent=tips[Math.floor(seconds/8)%tips.length];
 if(!card.isConnected)messages?.prepend(card);
 if(!observing&&messages){observing=true;observer.observe(messages,{childList:true})}
 if(!document.hidden)timer=setTimeout(refresh,1000);
}
const unsubscribe=llm.subscribe(refresh);
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(timer);timer=null}else refresh()});
window.addEventListener('pagehide',()=>{clearTimeout(timer);observer.disconnect();unsubscribe()},{once:true});
refresh();
