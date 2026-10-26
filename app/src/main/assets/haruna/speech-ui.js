// Local speech is an optional, isolated capability. No chat text leaves the device.
const native=()=>window.HarunaSpeech;
let status={};
const parse=value=>typeof value==='string'?JSON.parse(value):value;
function call(method,...args){
 if(!native())throw new Error('Voz local indisponível nesta versão do aplicativo.');
 const result=parse(native()[method](...args));if(result?.status==='error')throw new Error(result.error);return result;
}
function run(method,...args){try{return call(method,...args)}catch(error){alert(error.message);return null}}
const card=document.createElement('div');card.className='page-card speech-settings';
card.innerHTML=`<div class="section-title"><div><strong>Voz da Haruna</strong><small>Supertonic 3 INT8 • português • CPU local</small></div></div>
<div class="setting-row"><span>Status</span><strong data-status>Não instalado</strong></div><p data-progress class="settings-note" aria-live="polite"></p><progress data-bar max="100" hidden></progress>
<label class="speech-field">Voz<select data-speaker aria-label="Voz da Haruna"><option value="-1">Instale o modelo para escolher</option></select></label>
<label class="speech-field">Velocidade <output data-speed-label>1,0×</output><input data-speed aria-label="Velocidade da voz" type="range" min="0.7" max="1.4" step="0.05" value="1"></label>
<label class="speech-field">Pronúncia de “Haruna”<input data-name placeholder="Original, até escolhermos uma pronúncia" maxlength="100"></label>
<small class="settings-note">Esta substituição afeta somente a fala. Use Testar voz para comparar as vozes e a pronúncia.</small>
<div class="model-actions speech-actions"><button data-test>Testar voz</button><button data-stop hidden>Parar áudio</button><button data-import>Importar modelo já baixado</button><button data-download>Baixar modelo</button><button data-cancel hidden>Cancelar instalação</button><button data-remove class="danger" hidden>Remover modelo de voz</button></div>`;
document.querySelector('#settingsView')?.appendChild(card);
const q=s=>card.querySelector(s),speaker=q('[data-speaker]'),speed=q('[data-speed]'),pronunciation=q('[data-name]');
const control=document.createElement('div');control.className='speech-player';control.hidden=true;control.style.display='none';control.setAttribute('role','status');
const label=document.createElement('span'),stop=document.createElement('button');stop.type='button';stop.textContent='Parar áudio';stop.onclick=()=>run('stop');control.append(label,stop);document.querySelector('#composer')?.before(control);
const busy=()=>['downloading','importing','extracting','cancelling'].includes(status.state);
function refresh(){try{render(parse(native()?.getStatus()||'{}'))}catch(error){q('[data-progress]').textContent=error.message}}
function render(next){
 status=next;const installed=!!status.installed,isBusy=busy(),active=['preparing','playing'].includes(status.state);
 q('[data-status]').textContent=installed?'Instalado':'Não instalado';
 const phrases={cancelled:'Instalação cancelada. Você pode tentar novamente.',downloading:'Baixando voz…',importing:'Importando voz…',extracting:'Preparando modelo…',cancelling:'Cancelando instalação…',preparing:'Preparando voz…',playing:'Reproduzindo…',error:status.error||'Falha na voz local'};
 let detail=phrases[status.state]||(installed?`${(status.bytes/1e6).toFixed(1)} MB instalados • uso offline`:'Pacote de 128,8 MB (aprox. 129 MB). Reserve 650 MB livres durante a instalação.');
 const pct=status.totalBytes>0?Math.min(100,Math.floor(status.copiedBytes*100/status.totalBytes)):null;
 if(['downloading','importing'].includes(status.state))detail+=pct!==null?` ${pct}%`:` ${(Number(status.copiedBytes||0)/1e6).toFixed(1)} MB`;
 q('[data-progress]').textContent=detail;
 const bar=q('[data-bar]');bar.hidden=!isBusy;bar.style.display=isBusy?'block':'none';if(pct===null)bar.removeAttribute('value');else bar.value=pct;
 const count=Number(status.speakers||0);
 if(speaker.dataset.count!==String(count)){
  speaker.replaceChildren(new Option(count?'Escolha uma voz e toque em Testar':'Instale o modelo para escolher','-1'));
  for(let sid=0;sid<count;sid++)speaker.add(new Option(status.voiceLabels?.[sid]||`Speaker ${sid}`,String(sid)));
  speaker.dataset.count=String(count);
 }
 speaker.value=String(status.speaker??-1);speaker.disabled=!installed||isBusy;
 if(document.activeElement!==speed)speed.value=String(status.speed||1);
 q('[data-speed-label]').textContent=`${Number(speed.value).toFixed(2).replace('.',',')}×`;speed.disabled=isBusy;
 if(document.activeElement!==pronunciation)pronunciation.value=status.pronunciations?.Haruna||'';
 q('[data-test]').disabled=!installed||isBusy||Number(speaker.value)<0;
 for(const attr of ['import','download'])q(`[data-${attr}]`).disabled=isBusy||installed;
 for(const [attr,visible]of [['remove',installed&&!isBusy],['cancel',isBusy],['stop',active]]){const b=q(`[data-${attr}]`);b.hidden=!visible;b.style.display=visible?'':'none'}
 control.hidden=!active;control.style.display=active?'flex':'none';label.textContent=status.state==='preparing'?'Preparando voz…':'Voz da Haruna';
 const dialog=document.querySelector('.speech-install[open]');if(dialog){const info=dialog.querySelector('[data-install-progress]');info.textContent=detail;dialog.querySelector('[data-download]').disabled=isBusy;dialog.querySelector('[data-import]').disabled=isBusy;
  if(installed&&!isBusy){dialog.querySelector('[data-finish]').textContent='Escolher e testar voz';}}
}
function configure(value){if(run('configure',JSON.stringify(value)))refresh()}
speaker.onchange=()=>configure({speaker:Number(speaker.value)});
speed.oninput=()=>q('[data-speed-label]').textContent=`${Number(speed.value).toFixed(2).replace('.',',')}×`;
speed.onchange=()=>configure({speed:Number(speed.value)});
pronunciation.onchange=()=>configure({pronunciations:{...(status.pronunciations||{}),Haruna:pronunciation.value.trim()}});
q('[data-import]').onclick=()=>run('importModel');q('[data-download]').onclick=()=>{if(confirm('Baixar o pacote oficial de voz (aproximadamente 129 MB)?'))run('download')};
q('[data-stop]').onclick=()=>run('stop');
q('[data-cancel]').onclick=()=>run('cancelInstallation');q('[data-remove]').onclick=()=>{if(confirm('Remover somente o modelo Supertonic? GGUF, conversas e Segundo Cérebro serão mantidos.'))run('removeModel')};
q('[data-test]').onclick=()=>run('speak','Olá! Eu sou a Haruna. Esta é uma amostra da minha voz em português.','voice-test');
function openSettings(){window.dispatchEvent(new CustomEvent('haruna-open-view',{detail:{view:'settings'}}));card.scrollIntoView({block:'center',behavior:'smooth'})}
function installDialog(){
 if(document.querySelector('.speech-install[open]'))return;
 const d=document.createElement('dialog');d.className='message-menu speech-install';d.setAttribute('aria-label','Instalação da voz local');
 d.innerHTML='<strong>Voz local não instalada</strong><p>Para a Haruna falar, é necessário instalar o modelo de voz Supertonic 3.</p><p class="settings-note">Pacote: aproximadamente 129 MB. Instalação: aproximadamente 145 MB. Reserve 650 MB livres para preparar o modelo.</p><p data-install-progress aria-live="polite"></p><button data-download>Baixar modelo</button><button data-import>Importar modelo já baixado</button><button data-finish>Cancelar</button>';
 const close=()=>{d.close();d.remove()};
 d.querySelector('[data-download]').onclick=()=>run('download');d.querySelector('[data-import]').onclick=()=>run('importModel');
 d.querySelector('[data-finish]').onclick=()=>{if(status.installed){close();openSettings()}else{if(busy())run('cancelInstallation');close()}};
 d.addEventListener('cancel',e=>{e.preventDefault();if(busy())run('cancelInstallation');close()});
 document.body.appendChild(d);d.showModal();refresh();
}
export function hearMessage(text,id){
 refresh();if(!status.installed){installDialog();return}
 if(Number(status.speaker??-1)<0){openSettings();alert('Escolha uma voz e toque em Testar voz. Depois, use Ouvir novamente na mensagem.');return}
 run('speak',text,id);
}
window.addEventListener('haruna-tts-status',e=>render(e.detail));
document.addEventListener('visibilitychange',()=>{if(document.hidden){run('stop')}else refresh()});
refresh();

