import android from './android-bridge.js';

const $=s=>document.querySelector(s);
const onboarding=$('#onboarding');
const welcome=$('#onboardingWelcome');
const models=$('#onboardingModels');
const progress=$('#onboardingProgress');
const ready=$('#onboardingReady');
const start=$('#onboardingStart');
const skip=$('#onboardingSkip');
const back=$('#onboardingBack');
const importBtn=$('#onboardingImport');
const finish=$('#onboardingFinish');
const title=$('#onboardingProgressTitle');
const detail=$('#onboardingProgressDetail');
const bar=$('#onboardingProgressBar');
const percent=$('#onboardingProgressPercent');
const KEY='haruna_onboarding_v1';
let busy=false;

const catalog={
  light:{name:'qwen2.5-0.5b-instruct-q4_k_m.gguf',label:'Qwen2.5 0.5B • Q4_K_M',url:'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf?download=true'},
  balanced:{name:'qwen2.5-1.5b-instruct-q4_k_m.gguf',label:'Qwen2.5 1.5B • Q4_K_M',url:'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf?download=true'},
  capable:{name:'qwen2.5-1.5b-instruct-q6_k.gguf',label:'Qwen2.5 1.5B • Q6_K',url:'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q6_k.gguf?download=true'}
};
function step(name){if(welcome)welcome.hidden=name!=='welcome';if(models)models.hidden=name!=='models';if(progress)progress.hidden=name!=='progress';if(ready)ready.hidden=name!=='ready'}
function close(){localStorage.setItem(KEY,'done');busy=false;if(onboarding){onboarding.hidden=true;onboarding.style.display='none'}}
function showProgress(t,d,p=4){step('progress');if(title)title.textContent=t;if(detail)detail.textContent=d;if(bar)bar.style.width=`${p}%`;if(percent)percent.textContent=''}
async function download(tier){if(busy)return;const model=catalog[tier];if(!model)return;busy=true;showProgress('Iniciando download…',model.label);try{const result=android.loadModel({action:'download_catalog_model',name:model.name,url:model.url});if(result?.status==='error')throw new Error(result.error||'Não foi possível iniciar o download.')}catch(e){busy=false;step('models');alert(e.message||String(e))}}
function importLocal(){if(busy)return;busy=true;showProgress('Selecionando modelo…','Escolha um arquivo GGUF no dispositivo.');try{android.loadModel({action:'pick_local_gguf'})}catch(e){busy=false;step('models');alert(e.message||String(e))}}
if(onboarding){
  // The author CSS uses display:grid; force the HTML hidden state to win.
  if(onboarding.hidden)onboarding.style.display='none';
  start?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();step('models')},{capture:true});
  skip?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();close()},{capture:true});
  back?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();step('welcome')},{capture:true});
  importBtn?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();importLocal()},{capture:true});
  finish?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();close()},{capture:true});
  document.querySelectorAll('.recommended-model').forEach(btn=>btn.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();download(btn.dataset.tier)},{capture:true}));
  window.addEventListener('haruna-model-import-progress',e=>{if(!busy)return;const d=e.detail||{},phase=d.phase||d.state||'',pct=Number(d.percent);if(['copying','importing','selected','downloading'].includes(phase)){const isDownload=phase==='downloading'||d.source==='download';showProgress(isDownload?'Baixando modelo…':'Importando modelo…',d.name||'Preparando o arquivo.',Number.isFinite(pct)?Math.max(4,Math.min(100,pct)):8);if(Number.isFinite(pct)&&percent)percent.textContent=`${Math.round(pct)}%`}else if(['preparing','loading'].includes(phase)){showProgress('Preparando a Haruna…','Carregando o modelo local para uso.',100)}else if(['completed','ready'].includes(phase)){busy=false;step('ready')}else if(phase==='cancelled'){busy=false;step('models')}else if(phase==='error'){busy=false;step('models');alert(d.error||'Não foi possível preparar este modelo.')}});
}
