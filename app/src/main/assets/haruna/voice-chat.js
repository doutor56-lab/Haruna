import {CallView,voiceSettings,voiceIcon} from './voice/call-view.js';
import {SpeechStream} from './voice/stream.js';
// Dictation writes a draft. Only the explicitly started local call sends turns automatically.
const input=document.querySelector('#input'),composer=document.querySelector('#composer');
const backgroundActive=()=>{try{return JSON.parse(window.HarunaVoiceCall?.status()||'{}').running===true}catch{return false}};
const voiceAllowed=()=>!document.hidden||backgroundActive();
const native=()=>window.HarunaRecognition,tts=()=>window.HarunaSpeech,chat=()=>window.harunaChatVoice;
const parse=x=>typeof x==='string'?JSON.parse(x):x;
function invoke(target,method,...args){if(!target)throw new Error('Recurso de voz indisponível nesta versão.');const r=parse(target[method](...args));if(r?.status==='error')throw new Error(r.error);return r}
const command=(m,...args)=>invoke(native(),m,...args);
function quiet(target,method,...args){try{return invoke(target,method,...args)}catch{}}
let status={},capture=null,localCall=null,sequence=0,resumeTimer=null;
const id=prefix=>`${prefix}-${Date.now().toString(36)}-${++sequence}`;
const isBusy=()=>['importing','downloading','extracting','cancelling','selecting','removing'].includes(status.state);
const mic=document.createElement('button');mic.type='button';mic.className='voice-input';mic.textContent='';mic.setAttribute('aria-label','Escrever por voz');composer?.insertBefore(mic,input);
const phone=document.createElement('button');phone.type='button';phone.className='ghost';phone.textContent='';phone.setAttribute('aria-label','Conversa por voz local');document.querySelector('.topbar .actions')?.prepend(phone);
const dictation=document.createElement('div');dictation.className='speech-player dictation-control';dictation.style.display='none';dictation.hidden=true;
const dictationLabel=document.createElement('span'),finish=document.createElement('button'),cancel=document.createElement('button');finish.type=cancel.type='button';finish.textContent='Concluir';cancel.textContent='Cancelar';dictation.append(dictationLabel,finish,cancel);composer?.before(dictation);
const settings=document.createElement('div');settings.className='page-card recognition-settings';
settings.innerHTML='<div class="section-title"><div><strong>Escrita e conversa por voz</strong><small>Reconhecimento local • português • áudio no dispositivo</small></div></div><div class="setting-row"><span>Reconhecimento</span><strong data-state>Não instalado</strong></div><div data-stt-models class="model-list"></div><label class="speech-field">Modelo para baixar<select data-download-model aria-label="Modelo STT para baixar"><option value="whisper-tiny-int8">Whisper Tiny</option><option value="whisper-base-int8">Whisper Base</option><option value="whisper-small-int8">Whisper Small</option></select></label><p class="settings-note" data-progress aria-live="polite"></p><progress data-progress-bar max="100" hidden></progress><details class="settings-guide"><summary>Como funciona o reconhecimento de voz</summary><p class="settings-note">O ditado preenche o rascunho para revisão. A chamada conversa por turnos e envia suas falas ao chat. O microfone pausa durante a resposta. Cada fala pode ter até 20 segundos; uma pausa encerra o trecho.</p></details><div class="model-actions speech-actions"><button data-download>Baixar reconhecimento</button><button data-import>Importar modelo do dispositivo</button><button data-cancel hidden>Cancelar instalação</button><button data-remove class="danger" hidden>Remover reconhecimento</button></div>';
const settingsPage=document.querySelector('#settingsView');
const privacyCard=[...(settingsPage?.querySelectorAll(':scope > .page-card')||[])].find(el=>el.querySelector('.section-title strong')?.textContent.trim()==='Privacidade e armazenamento');
if(settingsPage){if(privacyCard)settingsPage.insertBefore(settings,privacyCard);else settingsPage.appendChild(settings)}
const q=s=>settings.querySelector(s);
function current(){const s=chat()?.state();if(!s)throw new Error('O chat ainda está iniciando.');return s}
function refresh(){try{update(parse(native()?.getStatus()||'{}'))}catch(error){q('[data-progress]').textContent=error.message}}
function update(value){
 status=value;
 for(const select of [q('[data-download-model]'),document.querySelector('.recognition-install[open] [data-choice]')].filter(Boolean)){
  if(value.catalog?.length){const previous=select.value;select.replaceChildren(...value.catalog.map(model=>{const option=document.createElement('option');option.value=model.id;option.textContent=`${model.name} · ${(model.bytes/1e6).toFixed(1)} MB · ${model.engine==='cpp'?'whisper.cpp':'ONNX INT8'}`;return option}));if([...select.options].some(o=>o.value===previous))select.value=previous}
 }
 const installed=!!value.installed,busy=isBusy();
 q('[data-state]').textContent=installed?`${value.modelName||'Whisper'} · ${value.loaded?'carregado':'selecionado'}`:'Não instalado';
 const labels={downloading:'Baixando reconhecimento…',importing:'Importando reconhecimento…',extracting:'Preparando reconhecimento…',cancelling:'Cancelando instalação…',cancelled:'Instalação cancelada.',selecting:'Selecionando modelo…',removing:'Removendo modelo…',listening:'Ouvindo…',transcribing:'Transcrevendo no dispositivo…',error:value.error||'Falha no reconhecimento'};
 let text=labels[value.state]||(installed?`${(value.bytes/1e6).toFixed(1)} MB • pronto para uso offline`:'Tiny: 116 MB • Base: 208 MB • Small: 639 MB de download. Pacotes ONNX INT8 para sherpa-onnx ou arquivos Whisper GGML oficiais F16/Q5_1.');
 const percent=value.totalBytes>0?Math.min(100,Math.floor(value.copiedBytes*100/value.totalBytes)):null;
 if(['downloading','importing'].includes(value.state))text+=percent===null?` ${(Number(value.copiedBytes||0)/1e6).toFixed(1)} MB`:` ${percent}%`;
 q('[data-progress]').textContent=text;const bar=q('[data-progress-bar]');bar.hidden=!busy;bar.style.display=busy?'block':'none';if(percent===null)bar.removeAttribute('value');else bar.value=percent;
 for(const action of ['download','import'])q(`[data-${action}]`).disabled=busy||!!capture;
 for(const [action,show]of [['cancel',busy],['remove',installed&&!busy]]){const b=q(`[data-${action}]`);b.hidden=!show;b.style.display=show?'':'none';b.disabled=!!capture}
 const modelList=q('[data-stt-models]');modelList.replaceChildren();
 for(const model of value.models||[]){
  const row=document.createElement('div');row.className='model-row stt-model-row';
  const info=document.createElement('div');info.className='model-info';const title=document.createElement('strong'),detail=document.createElement('small');
  title.textContent=model.name;detail.textContent=`${(model.bytes/1e6).toFixed(1)} MB · ${!model.installed?'instalação incompleta':model.selected?(value.loaded?'carregado':'selecionado'):'instalado'} · ${model.format||'modelo local'}`;
  info.append(title,detail);row.appendChild(info);const actions=document.createElement('div');actions.className='model-actions';
  if(model.installed&&!model.selected){const use=document.createElement('button');use.type='button';use.textContent='Selecionar';use.disabled=busy||!!capture;use.onclick=()=>{try{command('selectModel',model.id)}catch(error){alert(error.message)}};actions.appendChild(use)}
  const remove=document.createElement('button');remove.type='button';remove.className='danger';remove.textContent='Remover';remove.disabled=busy||!!capture;
  remove.onclick=()=>{try{if(confirm(`Remover somente ${model.name}?`))command('removeInstalledModel',model.id)}catch(error){alert(error.message)}};actions.appendChild(remove);row.appendChild(actions);modelList.appendChild(row);
 }
 const install=document.querySelector('.recognition-install[open]');if(install){install.querySelector('p[data-progress]').textContent=text;for(const key of ['download','import'])install.querySelector(`[data-${key}]`).disabled=busy;install.querySelector('[data-close]').textContent=busy?'Cancelar instalação':'Fechar'}
}
function settingsView(){window.dispatchEvent(new CustomEvent('haruna-open-view',{detail:{view:'settings'}}));settings.scrollIntoView({behavior:'smooth',block:'center'})}
function installDialog(){
 if(document.querySelector('.recognition-install[open]'))return;
 const d=document.createElement('dialog');d.className='message-menu recognition-install';d.setAttribute('aria-label','Instalação do reconhecimento local');
 d.innerHTML='<strong>Reconhecimento local não instalado</strong><p>Escolha um Whisper multilíngue para reconhecer português no dispositivo. O áudio não é enviado para servidores.</p><label class="speech-field">Modelo para baixar<select data-choice aria-label="Modelo de reconhecimento"><option value="whisper-tiny-int8">Whisper Tiny · ONNX INT8 · 116,2 MB</option><option value="whisper-base-int8">Whisper Base · ONNX INT8 · 207,6 MB</option><option value="whisper-small-int8">Whisper Small · ONNX INT8 · 639,4 MB</option></select></label><p class="settings-note">Importação: pacote sherpa-onnx .tar.bz2 ou arquivo oficial Whisper GGML F16/Q5_1 de Tiny, Base ou Small. GGUF de conversa e variantes .en são incompatíveis. O espaço temporário necessário é verificado antes da cópia.</p><p data-progress aria-live="polite"></p><button data-download>Baixar modelo oficial</button><button data-import>Importar modelo do dispositivo</button><button data-close>Fechar</button>';
 const close=()=>{if(isBusy())quiet(native(),'cancelInstallation');d.close();d.remove()};
 d.querySelector('[data-download]').onclick=()=>{try{command('downloadModel',d.querySelector('[data-choice]').value)}catch(e){alert(e.message)}};d.querySelector('[data-import]').onclick=()=>{try{command('importModel')}catch(e){alert(e.message)}};
 d.querySelector('[data-close]').onclick=close;d.addEventListener('cancel',e=>{e.preventDefault();close()});document.body.appendChild(d);d.showModal();refresh();
}
function checkRecognition(){refresh();if(!status.installed){installDialog();return false}if(isBusy())throw new Error('Aguarde a instalação do reconhecimento.');return true}
function redrawCapture(){
 const visible=capture?.mode==='dictation';dictation.hidden=!visible;dictation.style.display=visible?'flex':'none';
 dictationLabel.textContent=capture?.phase==='transcribing'?'Transcrevendo…':capture?.phase==='listening'?'Ouvindo… fale e faça uma pausa.':'Preparando microfone…';
 finish.disabled=capture?.phase!=='listening';mic.classList.toggle('recording',!!visible);mic.setAttribute('aria-pressed',String(!!visible));mic.setAttribute('aria-label',visible?'Concluir ditado':'Escrever por voz');
}
function stopCapture(){capture=null;quiet(native(),'stop');redrawCapture()}
function startCapture(mode){
 if(document.hidden&&(mode!=='call'||!backgroundActive()))return;
 const state=current();if(state.busy)throw new Error('Aguarde a resposta atual da Haruna.');
 const request=id(mode);capture={request,mode,chatId:state.chatId,phase:'starting'};redrawCapture();
 if(mode==='call')setCallPhase('starting','Preparando microfone…');
 try{command('start',mode,request)}catch(error){capture=null;redrawCapture();throw error}
}
function insertDictation(text,chatId){
 if(current().chatId!==chatId)return;
 const start=input.selectionStart??input.value.length,end=input.selectionEnd??start;
 const left=input.value.slice(0,start),right=input.value.slice(end);
 const insertion=(left&&!/\s$/.test(left)?' ':'')+text+(right&&!/^\s/.test(right)?' ':'');
 if(input.maxLength>0&&input.value.length-(end-start)+insertion.length>input.maxLength){prompt('O campo está cheio. Copie este texto reconhecido antes de continuar:',text);return}
 input.setRangeText(insertion,start,end,'end');input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();
}
mic.onclick=()=>{try{if(localCall){alert('Encerre a conversa por voz para usar o ditado.');return}if(capture){if(capture.phase==='listening')command('finish');else stopCapture();return}if(checkRecognition())startCapture('dictation')}catch(error){alert(error.message)}};
finish.onclick=()=>{try{command('finish')}catch(e){alert(e.message)}};cancel.onclick=stopCapture;
function setLevel(level){if(!localCall)return;const value=Math.max(0,Math.min(1,Number(level)||0));if(!document.hidden)localCall.view.level(value);localCall.dialog.querySelector('[data-level]').value=value}
function setCallPhase(phase,text){if(!localCall)return;localCall.phase=phase;localCall.label.textContent=text;localCall.orb.dataset.state=phase==='audiopaused'?'paused':['transcribing','starting'].includes(phase)?'thinking':phase;localCall.resume.querySelector('span').textContent=phase==='ready'?'Iniciar conversa':phase==='audiopaused'?'Continuar áudio':['paused','error'].includes(phase)?'Retomar':'Falar agora';localCall.resume.setAttribute('aria-label',localCall.resume.querySelector('span').textContent);localCall.view.phase(phase);if(!['listening','speaking'].includes(phase))setLevel(0)}
function togglePause(){if(localCall?.phase==='speaking'){try{invoke(tts(),'pause');setCallPhase('audiopaused','Fala pausada. A resposta continua sendo escrita no chat.')}catch(error){pauseCall(error.message,true)}}else pauseCall()}
function skipSpeech(){if(!localCall)return;localCall.muted=true;localCall.skipped=true;localCall.collector?.cancel();quiet(tts(),'stop');if(localCall.generating)setCallPhase('thinking','Concluindo a resposta no chat…');else{setCallPhase('waiting','Sua vez…');listenAgain()}}
function stopSpeech(){if(!localCall)return;localCall.muted=true;localCall.skipped=false;localCall.collector?.cancel();quiet(tts(),'stop');if(localCall.generating)setCallPhase('thinking','Áudio interrompido; concluindo a resposta no chat…');else pauseCall('Fala interrompida. Toque em Retomar quando quiser.')}
function openVoiceSettings(){if(localCall)pauseCall();refresh();voiceSettings({stt:status,tts:parse(tts()?.getStatus()||'{}'),invoke:(engine,method,...args)=>invoke(engine==='stt'?native():tts(),method,...args),onStreaming:()=>{}})}
function pauseCall(reason='Conversa pausada. Toque em Retomar para continuar.',failed=false){
 if(!localCall)return;
 localCall.turn++;clearTimeout(resumeTimer);resumeTimer=null;setCallPhase(failed?'error':'paused',reason);localCall.collector?.cancel();
 stopCapture();if(localCall.replyId)quietChatCancel(localCall.replyId);quiet(tts(),'stop');
}
function quietChatCancel(request){try{Promise.resolve(chat()?.cancel(request)).catch(()=>{})}catch{}}
function endVoice(){
 const previous=localCall;localCall=null;clearTimeout(resumeTimer);resumeTimer=null;
 stopCapture();if(previous){previous.collector?.cancel();if(previous.replyId)quietChatCancel(previous.replyId);quiet(tts(),'stop');previous.view.close();quiet(window.HarunaVoiceCall,'end')}
}
function listenAgain(){
 if(!localCall||!voiceAllowed())return;
 try{const s=current();if(s.chatId!==localCall.chatId){endVoice();return}startCapture('call')}catch(error){pauseCall(error.message,true)}
}
async function voiceTurn(text){
 const call=localCall;if(!call)return;
 const turn=++call.turn,replyId=id('voice-turn');call.replyId=replyId;call.generating=true;call.muted=false;call.skipped=false;call.audioError=null;call.streaming=localStorage.getItem('haruna_voice_stream')!=='off';
 const live=()=>localCall===call&&call.turn===turn&&voiceAllowed();
 call.transcript.textContent=`Você: ${text}`;setCallPhase('thinking','Haruna está preparando a resposta…');
 call.ttsId=id('local-call-audio');
 const audioFailure=error=>{if(!live())return;call.audioError=error.message||'Falha na voz';call.muted=true;quiet(tts(),'stop');setCallPhase('thinking','A voz foi interrompida; concluindo a resposta no chat…')};
 try{
  invoke(tts(),'beginStream',call.ttsId);
  const collector=new SpeechStream({send:segment=>invoke(tts(),'appendStream',call.ttsId,segment),reset:()=>invoke(tts(),'beginStream',call.ttsId),onError:audioFailure});call.collector=collector;
  const response=await chat().send(text,call.chatId,replyId,{push:(delta,thinking)=>{if(live()&&!call.muted&&call.streaming)collector.push(delta,thinking)}});
  if(!live())return;
  call.generating=false;
  if(!response||response.chatId!==call.chatId||response.error||response.interrupted)throw new Error(response?.text||'A resposta foi interrompida.');
  if(call.muted){if(call.skipped){setCallPhase('waiting','Sua vez…');listenAgain()}else pauseCall(call.audioError||'Áudio interrompido. A resposta está salva no chat.',!!call.audioError);return}
  collector.finish(response.text);
  if(call.muted){pauseCall(call.audioError,true);return}
  invoke(tts(),'endStream',call.ttsId);
 }catch(error){if(live()){quiet(tts(),'stop');pauseCall(error.message,true)}}
 finally{call.generating=false;if(call.replyId===replyId)call.replyId=null}
}
phone.onclick=()=>{
 try{
  if(localCall)return;
  if(!checkRecognition())return;
  const s=current();if(s.busy)throw new Error('Aguarde a operação atual da Haruna.');
  if(!s.modelLoaded)throw new Error('Carregue o modelo GGUF antes de iniciar a conversa por voz.');
  if(s.draft.trim()||s.attachments)throw new Error('Envie ou limpe o rascunho e os anexos antes de iniciar a conversa por voz.');
  const voice=parse(tts()?.getStatus()||'{}');
  if(!voice.installed||Number(voice.speaker??-1)<0){window.dispatchEvent(new CustomEvent('haruna-open-view',{detail:{view:'settings'}}));throw new Error('Instale a voz da Haruna e escolha um speaker nas configurações.');}
  stopCapture();
  const resume=async()=>{const call=localCall,reply=call?.replyId;if(!call)return;if(call.phase==='audiopaused'){try{invoke(tts(),'resume');setCallPhase('speaking','Haruna está falando…')}catch(error){pauseCall(error.message,true)}return}pauseCall();try{if(reply)await chat().cancel(reply);for(let i=0;i<100&&parse(native().getStatus()).busy;i++){if(localCall!==call||call.phase!=='paused')return;await new Promise(r=>setTimeout(r,150))}if(localCall===call&&call.phase==='paused')listenAgain()}catch(error){if(localCall===call)pauseCall(error.message)}};
  const view=new CallView({end:endVoice,pause:togglePause,resume,skip:skipSpeech,stopSpeech,finish:()=>quiet(native(),'finish'),settings:openVoiceSettings});
  localCall={view,dialog:view.dialog,chatId:s.chatId,turn:0,phase:'ready',orb:view.orb,label:view.label,transcript:view.transcript,resume:view.resume,pause:view.pause,ttsId:null,replyId:null};
  view.phase('ready');
 }catch(error){alert(error.message)}
};
window.addEventListener('haruna-stt-status',e=>{
 const d=e.detail;if(d.meter){if(capture?.mode==='call'&&d.requestId===capture.request)setLevel(d.level);return}update(d);if(!capture||d.requestId!==capture.request)return;
 if(d.state==='listening'||d.state==='transcribing'){capture.phase=d.state;redrawCapture();if(capture.mode==='call'){setCallPhase(d.state,d.state==='listening'?'Ouvindo… fale e faça uma pausa.':'Transcrevendo no dispositivo…');if(localCall)setLevel(d.level||0)}return}
 if(d.state==='result'&&typeof d.text==='string'){
  const previous=capture;capture=null;redrawCapture();
  if(previous.chatId!==current().chatId){endVoice();return}
  if(previous.mode==='dictation')insertDictation(d.text,previous.chatId);else voiceTurn(d.text);return;
 }
 if(['no_speech','error','idle'].includes(d.state)){
  const mode=capture.mode;capture=null;redrawCapture();
  const message=d.error||(d.state==='no_speech'?'Não identifiquei fala. Tente novamente perto do microfone.':'Microfone parado.');
  if(mode==='call')pauseCall(message,d.state==='error');else if(d.state!=='idle')alert(message);
 }
});
window.addEventListener('haruna-tts-status',e=>{
 const d=e.detail;if(!localCall)return;
 if(d.reason==='app_background'){if(!backgroundActive())endVoice();return}
 if(d.reason==='audio_focus_lost'){pauseCall('O áudio foi interrompido por outro aplicativo.');return}
 if(d.messageId!==localCall.ttsId||['paused','error','ready'].includes(localCall.phase))return;
 if(d.meter){if(localCall.phase==='speaking')setLevel(d.level);return}
 if(d.state==='paused'){setCallPhase('audiopaused','Fala pausada.');return}
 if(d.state==='playing'&&!localCall.muted){setCallPhase('speaking','Haruna está falando…');return}
 if(d.state==='error'){
  if(localCall.generating){localCall.audioError=d.error||'Falha na voz';localCall.muted=true;localCall.collector?.cancel();quiet(tts(),'stop');setCallPhase('thinking','A voz foi interrompida; concluindo a resposta no chat…')}
  else pauseCall(d.error||'Falha na voz da Haruna.',true);
  return;
 }
 if(d.state==='idle'){
  if(localCall.generating){localCall.muted=true;localCall.collector?.cancel();setCallPhase('thinking','Áudio interrompido; concluindo a resposta no chat…');return}
  if(localCall.skipped)return;
  const call=localCall;setCallPhase('waiting','Sua vez…');clearTimeout(resumeTimer);
  resumeTimer=setTimeout(()=>{if(localCall===call&&call.phase==='waiting'&&voiceAllowed())listenAgain()},450);
 }
});
q('[data-download]').onclick=()=>{try{const choice=q('[data-download-model]');if(confirm(`Baixar ${choice.selectedOptions[0].textContent} para uso offline?`))command('downloadModel',choice.value)}catch(e){alert(e.message)}};
q('[data-import]').onclick=()=>{try{command('importModel')}catch(e){alert(e.message)}};
q('[data-cancel]').onclick=()=>quiet(native(),'cancelInstallation');q('[data-remove]').onclick=()=>{try{if(confirm('Remover somente o modelo de reconhecimento? A voz da Haruna, GGUF e Segundo Cérebro serão mantidos.'))command('removeModel')}catch(e){alert(e.message)}};
window.addEventListener('haruna-chat-context-changing',endVoice);
window.addEventListener('haruna-chat-submit',e=>{if(!e.detail?.fromVoice)endVoice()});
document.addEventListener('visibilitychange',()=>{document.documentElement.classList.toggle('voice-background',document.hidden);if(document.hidden&&!backgroundActive())endVoice();else if(!document.hidden)refresh()});
window.addEventListener('haruna-call-stop',endVoice);
window.addEventListener('pagehide',endVoice);
document.addEventListener('click',e=>{const button=e.target.closest('button');if(button?.classList.contains('nav-item')&&button.dataset.view!=='chat'&&localCall)localCall.view.minimize();if(button?.id==='attach')endVoice()},true);
// The phone remains the primary call action; voice options live in a discreet menu.
const voiceMenu=document.createElement('div');
voiceMenu.className='haruna-voice-menu';
voiceMenu.hidden=true;
voiceMenu.innerHTML=`<button type="button" data-call>${voiceIcon('phone')}Iniciar conversa por voz</button><button type="button" data-voice-config>${voiceIcon('settings')}Configurar voz</button>`;
const voiceMore=document.createElement('button');
voiceMore.type='button';
voiceMore.className='ghost haruna-voice-more';
voiceMore.setAttribute('aria-label','Mais opções de voz');
voiceMore.setAttribute('aria-expanded','false');
voiceMore.textContent='⋮';
document.querySelector('.topbar .actions')?.append(voiceMore);
document.querySelector('.topbar')?.append(voiceMenu);
const toggleVoiceMenu=(open)=>{voiceMenu.hidden=!open;voiceMore.setAttribute('aria-expanded',String(open))};
voiceMore.onclick=()=>toggleVoiceMenu(voiceMenu.hidden);
voiceMenu.querySelector('[data-call]').onclick=()=>{toggleVoiceMenu(false);phone.click()};
voiceMenu.querySelector('[data-voice-config]').onclick=()=>{toggleVoiceMenu(false);openVoiceSettings()};
phone.addEventListener('contextmenu',event=>{event.preventDefault();toggleVoiceMenu(true)});
let voiceHold=null,held=false;
phone.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse')return;held=false;clearTimeout(voiceHold);voiceHold=setTimeout(()=>{held=true;toggleVoiceMenu(true)},550)});
for(const type of ['pointerup','pointercancel','pointerleave'])phone.addEventListener(type,()=>clearTimeout(voiceHold));
phone.addEventListener('click',event=>{if(!held)return;event.stopImmediatePropagation();held=false},true);
document.addEventListener('click',event=>{if(!voiceMenu.hidden&&!voiceMenu.contains(event.target)&&event.target!==voiceMore&&event.target!==phone)toggleVoiceMenu(false)});

refresh();

