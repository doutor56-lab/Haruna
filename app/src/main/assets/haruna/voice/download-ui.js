// A small, dismissible status surface; navigation never cancels native work.
const phases={downloading:'Baixando',importing:'Copiando',extracting:'Extraindo',validating:'Verificando',finalizing:'Concluindo',cancelling:'Cancelando'};
const tray=document.createElement('details');tray.className='voice-download-tray';tray.hidden=true;
tray.innerHTML='<summary aria-live="polite">Downloads de voz</summary><div data-jobs></div>';
document.body.append(tray);
const jobs=new Map();let hideTimer;
function update(kind,value){
 if(value?.meter)return;
 const active=!!phases[value.state]||value.installing===true;
 if(!active&&!jobs.has(kind))return;
 jobs.set(kind,{...value,active});clearTimeout(hideTimer);tray.hidden=false;
 const working=[...jobs.values()].some(j=>j.active);
 const activeJobs=[...jobs].filter(([,job])=>job.active);
 const [key,current]=activeJobs[0]||[];
 const percent=current?.totalBytes>0?Math.min(100,Math.floor(100*(current.copiedBytes||0)/current.totalBytes)):null;
 tray.querySelector('summary').textContent=working?(activeJobs.length>1?'↓ Downloads de voz · '+activeJobs.length:'↓ '+(phases[current.state]||'Preparando')+' '+(key==='stt'?'reconhecimento':'voz')+(percent===null?'…':` · ${percent}%`)):[...jobs.values()].some(j=>j.state==='error')?'Download de voz interrompido':'Voz pronta para usar';
 const list=tray.querySelector('[data-jobs]');list.replaceChildren();
 for(const [key,job]of jobs){
  const row=document.createElement('section'),title=document.createElement('strong'),label=document.createElement('small');
  title.textContent=key==='stt'?(job.installingModel||'Reconhecimento de voz'):'Voz da Haruna';
  const percent=job.totalBytes>0?Math.min(100,Math.floor(100*(job.copiedBytes||0)/job.totalBytes)):null;
  label.textContent=job.active?(phases[job.state]||'Concluindo')+(percent===null?'…':` · ${percent}%`):job.state==='error'?(job.error||'Não foi possível concluir'):job.state==='cancelled'?'Cancelado':'Instalado';
  row.append(title,label);
  if(job.active){const bar=document.createElement('progress');bar.max=100;if(percent!==null)bar.value=percent;row.append(bar)}
  const open=document.createElement('button');open.type='button';open.textContent=job.active?'Acompanhar':'Ver modelos';open.onclick=()=>{window.dispatchEvent(new CustomEvent('haruna-open-voice-downloads',{detail:{kind:key}}));tray.open=false};row.append(open);
  if(job.active){const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancelar';cancel.onclick=()=>{const api=key==='stt'?window.HarunaRecognition:window.HarunaSpeech;api?.cancelInstallation()};row.append(cancel)}
  list.append(row);
 }
 if(!working){const close=document.createElement('button');close.type='button';close.textContent='Dispensar';close.onclick=()=>{jobs.clear();tray.hidden=true};list.append(close);if(![...jobs.values()].some(j=>j.state==='error'))hideTimer=setTimeout(()=>{jobs.clear();tray.hidden=true},8000)}
}
for(const [event,kind]of [['haruna-stt-status','stt'],['haruna-tts-status','tts']])window.addEventListener(event,e=>update(kind,e.detail));
function refresh(){for(const [kind,api]of [['stt',window.HarunaRecognition],['tts',window.HarunaSpeech]])try{if(api)update(kind,JSON.parse(api.getStatus()))}catch{}}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});refresh();
window.addEventListener('haruna-open-voice-downloads',e=>{
 window.dispatchEvent(new CustomEvent('haruna-open-view',{detail:{view:'settings'}}));
 document.querySelector('#haruna-local-model-tab-2')?.click();
 document.querySelector(e.detail?.kind==='tts'?'.speech-settings':'.recognition-settings')?.scrollIntoView({block:'start',behavior:'smooth'});
 refresh();
});

export function showDownloadSheet(dialog){
 const close=()=>{document.removeEventListener('keydown',escape);document.removeEventListener('click',navigate);dialog.close();dialog.remove()};
 const escape=e=>{if(e.key==='Escape'&&!document.querySelector('dialog:modal')){e.preventDefault();close()}};
 const navigate=e=>{if(e.target.closest?.('.nav-item'))close()};
 document.body.append(dialog);dialog.show();document.addEventListener('keydown',escape);document.addEventListener('click',navigate);
 return close;
}
