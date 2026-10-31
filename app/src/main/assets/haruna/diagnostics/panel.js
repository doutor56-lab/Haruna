import {inferenceLab} from './lab.js';
import {experimentControls} from './experiment.js';
import {knowledgeMetrics} from './metrics.js';
import {diagnosticCards,diagnosticReport} from './report.js';

const settings=document.querySelector('#settingsView');
const activityIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12h4l3-8 5 16 3-8h5"/></svg>';
let laboratory=null;
let experiment=null,experimentInitialized=false;
let dialog=null,timer=null,ticket=0,native={},cards=[],savedScroll=0,returnFocus=null;
const launcher=document.createElement('button');launcher.type='button';launcher.className='haruna-dbg-launcher';
launcher.innerHTML=activityIcon+'<span>DBG</span>';launcher.setAttribute('aria-label','Abrir DBG, diagnóstico da Haruna');
settings?.appendChild(launcher);

function stopTimer(){clearTimeout(timer);timer=null}
function schedule(){stopTimer();if(dialog&&!document.hidden)timer=setTimeout(refresh,5000)}
function requestSnapshot(){
 if(!dialog||document.hidden)return;
 try{window.HarunaDiagnostics?.requestSnapshot(ticket)}catch{}
}
function refresh(){if(!dialog||document.hidden)return;requestSnapshot();render();schedule()}
function render(){
 if(!dialog)return;
 if(!experimentInitialized&&native.llm?.observation){
  experiment=experimentControls(native,ticket);(laboratory?.runtimeHost||dialog.querySelector('.haruna-dbg-content')).append(experiment.element);experimentInitialized=true;
 }
 experiment?.update(native);laboratory?.refreshRuntime(native);
 cards=diagnosticCards(native,knowledgeMetrics());
 for(const card of cards){
  const body=dialog.querySelector(`[data-dbg-body="${card.id}"]`);body.replaceChildren();
  const list=document.createElement('dl');
  for(const row of card.rows){const wrap=document.createElement('div'),term=document.createElement('dt'),value=document.createElement('dd');
   term.textContent=row.label;value.textContent=row.value;wrap.append(term,value);list.appendChild(wrap)}
  const note=document.createElement('p');note.className='haruna-dbg-note';note.textContent=card.note;body.append(list,note);
 }
 dialog.querySelector('[data-dbg-status]').textContent=native.unavailable?'Coleta Android indisponível. Dados não medidos permanecem indisponíveis.':
  window.HarunaDiagnostics?'Métricas · estado 5 s · memória 10 s · experimento A/B separado':'Ponte Android indisponível · somente metadados locais';
}
function finishClose(){
 if(!dialog)return;laboratory?.dispose();laboratory=null;experiment?.dispose();experiment=null;experimentInitialized=false;stopTimer();const old=dialog;dialog=null;ticket++;native={};cards=[];old.remove();
 if(settings&&!settings.hidden){settings.scrollTop=savedScroll;if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true})}
 returnFocus=null;
}
function close(){dialog?.close()}
function open(){
 if(dialog||!settings||document.querySelector('dialog[open]'))return;
 savedScroll=settings.scrollTop;returnFocus=document.activeElement;ticket++;native={};
 const element=document.createElement('dialog');element.className='haruna-dbg-sheet';element.setAttribute('aria-labelledby','harunaDbgTitle');
 element.innerHTML='<div class="haruna-dbg-handle" aria-hidden="true"></div><header class="haruna-dbg-head"><div class="haruna-dbg-brand">'+activityIcon+'</div><div><h2 id="harunaDbgTitle">DBG · Diagnóstico da Haruna</h2><p data-dbg-status aria-live="polite">Obtendo informações disponíveis…</p></div><button class="haruna-dbg-close" type="button" aria-label="Fechar diagnóstico" autofocus><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button></header><div class="haruna-dbg-content"></div><footer class="haruna-dbg-footer"><button type="button" data-dbg-copy><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></svg>Copiar diagnóstico</button><span data-dbg-feedback role="status"></span><button type="button" class="haruna-dbg-done">Fechar</button></footer>';
 const icons={stability:'layers',runtime:'brain',configuration:'layers',generation:'brain',streaming:'layers',context:'layers',decision:'brain',memory:'memory',llm:'brain',knowledge:'memory',voice:'volume',subsystems:'layers',device:'device'};
 cards=diagnosticCards({},{});
 const content=element.querySelector('.haruna-dbg-content');
 const diagnostic=document.createElement('details');diagnostic.className='haruna-dbg-card haruna-dbg-observation';diagnostic.open=true;const diagnosticTitle=document.createElement('summary');diagnosticTitle.textContent='Diagnóstico · somente observação';diagnostic.append(diagnosticTitle);const diagnosticBody=document.createElement('div');diagnosticBody.className='haruna-lab-area-body';diagnostic.append(diagnosticBody);content.append(diagnostic);
 for(const card of cards){
  const section=document.createElement('details');section.className=`haruna-dbg-card haruna-dbg-${card.id}`;section.open=['generation','llm'].includes(card.id);
  const summary=document.createElement('summary'),icon=document.createElement('i'),label=document.createElement('span');
  icon.className=`haruna-dbg-section-icon haruna-dbg-icon-${icons[card.id]}`;icon.setAttribute('aria-hidden','true');label.textContent=card.title;summary.append(icon,label);
  const body=document.createElement('div');body.dataset.dbgBody=card.id;section.append(summary,body);diagnosticBody.appendChild(section);
 }
 laboratory=inferenceLab({pendingControls:()=>experiment?.pendingChanges()||[],runtimeObservation:()=>experiment?.currentState()});if(laboratory)content.append(laboratory.element);
 dialog=element;
 element.querySelector('.haruna-dbg-close').onclick=close;element.querySelector('.haruna-dbg-done').onclick=close;
 element.querySelector('[data-dbg-copy]').onclick=copy;
 element.addEventListener('close',finishClose,{once:true});
 element.addEventListener('cancel',event=>{event.preventDefault();close()});
 document.body.appendChild(element);
 try{element.showModal();refresh()}catch{finishClose()}
}
async function copy(){
 const owner=dialog;if(!owner)return;
 const report=diagnosticReport(cards);const button=owner.querySelector('[data-dbg-copy]');
 let copied=false;
 try{await navigator.clipboard.writeText(report);copied=true}catch{
  if(dialog===owner){const text=document.createElement('textarea');text.value=report;text.readOnly=true;text.tabIndex=-1;text.className='haruna-dbg-copy-buffer';owner.appendChild(text);
   try{text.select();copied=document.execCommand('copy')}catch{}finally{text.remove();button.focus({preventScroll:true})}}
 }
 if(dialog===owner)owner.querySelector('[data-dbg-feedback]').textContent=copied?'Copiado':'Não foi possível copiar';
}
launcher.onclick=open;
window.addEventListener('haruna-dbg-snapshot',event=>{
 if(!dialog||event.detail?.ticket!==ticket)return;
 native=event.detail;render();
});
document.addEventListener('visibilitychange',()=>{if(!dialog)return;if(document.hidden)stopTimer();else refresh()});
window.addEventListener('pagehide',()=>{if(dialog)close()});

