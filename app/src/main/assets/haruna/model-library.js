import android from './android-bridge.js';
const $=s=>document.querySelector(s);
const modal=$('#modelSettings'),list=$('#modelList'),close=$('#closeSettings'),add=$('#addModel'),attach=$('#attach');
const fmt=n=>n>1073741824?`${(n/1073741824).toFixed(2)} GB`:`${Math.max(1,Math.round(n/1048576))} MB`;
export function refreshModels(){
  if(!android.isAvailable()||!list)return;
  try{
    const data=android.listModels()||{models:[]}; list.innerHTML='';
    if(!data.models?.length){list.innerHTML='<div class="model-empty">Nenhum modelo instalado ainda.</div>';return}
    data.models.forEach(m=>{const row=document.createElement('div');row.className='model-row';row.innerHTML='<div class="model-info"><strong></strong><small></small></div><div class="model-actions"></div>';row.querySelector('strong').textContent=m.name;row.querySelector('small').textContent=`${fmt(m.bytes)}${m.primary?' • Principal':''}${m.active?' • Ativo':''}`;const a=row.querySelector('.model-actions');if(!m.active){const use=document.createElement('button');use.textContent='Usar';use.onclick=()=>{android.useModel(m.path);if(modal)modal.hidden=true};a.appendChild(use)}if(!m.primary){const p=document.createElement('button');p.textContent='Principal';p.onclick=()=>{android.setPrimaryModel(m.path);refreshModels()};a.appendChild(p)}const del=document.createElement('button');del.textContent='Excluir';del.className='danger';del.onclick=()=>{if(confirm(`Excluir ${m.name}?`)){android.deleteModel(m.path);refreshModels()}};a.appendChild(del);list.appendChild(row)})
  }catch(e){console.error('Haruna model library:',e);if(list)list.innerHTML='<div class="model-empty">Não foi possível ler a biblioteca de modelos.</div>'}
}
export function openModelSettings(){if(!modal){console.warn('Haruna: modelSettings ausente');return}refreshModels();modal.hidden=false}
if(close)close.onclick=()=>{if(modal)modal.hidden=true};
if(add)add.onclick=()=>{try{android.loadModel({action:'pick_local_gguf'})}catch(e){console.error('Haruna add model:',e)}};
if(attach)attach.onclick=()=>{try{android.pickAttachment()}catch(e){console.error('Haruna attachment:',e)}};
window.addEventListener('haruna-native-status-changed',()=>{if(modal&&!modal.hidden)refreshModels()});
window.addEventListener('haruna-attachment-imported',e=>{const d=e.detail||{};window.dispatchEvent(new CustomEvent('haruna-attachment-ready',{detail:d}))});
