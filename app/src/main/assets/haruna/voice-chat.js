// Dictation writes a draft. Only the explicitly started local call sends turns automatically.
const input=document.querySelector('#input'),composer=document.querySelector('#composer');
const native=()=>window.HarunaRecognition,tts=()=>window.HarunaSpeech,chat=()=>window.harunaChatVoice;
const parse=x=>typeof x==='string'?JSON.parse(x):x;
function invoke(target,method,...args){if(!target)throw new Error('Recurso de voz indisponível nesta versão.');const r=parse(target[method](...args));if(r?.status==='error')throw new Error(r.error);return r}
const command=(m,...args)=>invoke(native(),m,...args);
function quiet(target,method,...args){try{return invoke(target,method,...args)}catch{}}
let status={},capture=null,localCall=null,sequence=0,resumeTimer=null;
const id=prefix=>`${prefix}-${Date.now().toString(36)}-${++sequence}`;
const isBusy=()=>['importing','downloading','extracting','cancelling'].includes(status.state);
const mic=document.createElement('button');mic.type='button';mic.className='voice-input';mic.textContent='🎙️';mic.setAttribute('aria-label','Escrever por voz');composer?.insertBefore(mic,input);
const phone=document.createElement('button');phone.type='button';phone.className='ghost';phone.textContent='📞';phone.setAttribute('aria-label','Conversa por voz local');document.querySelector('.topbar .actions')?.prepend(phone);
const dictation=document.createElement('div');dictation.className='speech-player dictation-control';dictation.style.display='none';dictation.hidden=true;
const dictationLabel=document.createElement('span'),finish=document.createElement('button'),cancel=document.createElement('button');finish.type=cancel.type='button';finish.textContent='Concluir';cancel.textContent='Cancelar';dictation.append(dictationLabel,finish,cancel);composer?.before(dictation);
const settings=document.createElement('div');settings.className='page-card recognition-settings';
settings.innerHTML='<div class="section-title"><div><strong>Escrita e conversa por voz</strong><small>Whisper Tiny INT8 • português • reconhecimento local</small></div></div><div class="setting-row"><span>Reconhecimento</span><strong data-state>Não instalado</strong></div><p class="settings-note" data-progress aria-live="polite"></p><progress data-progress-bar max="100" hidden></progress><p class="settings-note">🎙️ preenche o rascunho para revisão. 📞 conversa por turnos e envia suas falas ao chat. O microfone pausa durante a resposta. Cada fala pode ter até 20 segundos; uma pausa encerra o trecho.</p><div class="model-actions speech-actions"><button data-download>Baixar reconhecimento</button><button data-import>📁 Importar modelo STT</button><button data-cancel hidden>Cancelar instalação</button><button data-remove class="danger" hidden>Remover reconhecimento</button></div>';
document.querySelector('#settingsView')?.appendChild(settings);
const q=s=>settings.querySelector(s);
function current(){const s=chat()?.state();if(!s)throw new Error('O chat ainda está iniciando.');return s}
function refresh(){try{update(parse(native()?.getStatus()||'{}'))}catch(error){q('[data-progress]').textContent=error.message}}
function update(value){
 status=value;const installed=!!value.installed,busy=isBusy();
 q('[data-state]').textContent=installed?'Instalado':'Não instalado';
 const labels={downloading:'Baixando reconhecimento…',importing:'Importando reconhecimento…',extracting:'Preparando reconhecimento…',cancelling:'Cancelando instalação…',cancelled:'Instalação cancelada.',listening:'Ouvindo…',transcribing:'Transcrevendo no dispositivo…',error:value.error||'Falha no reconhecimento'};
 let text=labels[value.state]||(installed?`${(value.bytes/1e6).toFixed(1)} MB • pronto para uso offline`:'Pacote oficial: 116,2 MB. Instalação INT8: 103,6 MB. Reserve 450 MB livres.');
 const percent=value.totalBytes>0?Math.min(100,Math.floor(value.copiedBytes*100/value.totalBytes)):null;
 if(['downloading','importing'].includes(value.state))text+=percent===null?` ${(Number(value.copiedBytes||0)/1e6).toFixed(1)} MB`:` ${percent}%`;
 q('[data-progress]').textContent=text;const bar=q('[data-progress-bar]');bar.hidden=!busy;bar.style.display=busy?'block':'none';if(percent===null)bar.removeAttribute('value');else bar.value=percent;
 for(const action of ['download','import'])q(`[data-${action}]`).disabled=busy||installed||!!capture;
 for(const [action,show]of [['cancel',busy],['remove',installed&&!busy]]){const b=q(`[data-${action}]`);b.hidden=!show;b.style.display=show?'':'none';b.disabled=!!capture}
 const install=document.querySelector('.recognition-install[open]');if(install){install.querySelector('p[data-progress]').textContent=text;for(const key of ['download','import'])install.querySelector(`[data-${key}]`).disabled=busy||installed;install.querySelector('[data-close]').textContent=busy?'Cancelar instalação':'Fechar'}
}
function settingsView(){window.dispatchEvent(new CustomEvent('haruna-open-view',{detail:{view:'settings'}}));settings.scrollIntoView({behavior:'smooth',block:'center'})}
function installDialog(){
 if(document.querySelector('.recognition-install[open]'))return;
 const d=document.createElement('dialog');d.className='message-menu recognition-install';d.setAttribute('aria-label','Instalação do reconhecimento local');
 d.innerHTML='<strong>Reconhecimento local não instalado</strong><p>Instale o Whisper Tiny multilíngue para transformar sua fala em texto, sem enviar áudio para servidores.</p><p class="settings-note">Pacote de 116,2 MB. Somente os componentes INT8 serão guardados. Reserve 450 MB livres.</p><p data-progress aria-live="polite"></p><button data-download>Baixar modelo oficial</button><button data-import>📁 Importar sherpa-onnx-whisper-tiny.tar.bz2</button><button data-close>Fechar</button>';
 const close=()=>{if(isBusy())quiet(native(),'cancelInstallation');d.close();d.remove()};
 d.querySelector('[data-download]').onclick=()=>{try{command('download')}catch(e){alert(e.message)}};d.querySelector('[data-import]').onclick=()=>{try{command('importModel')}catch(e){alert(e.message)}};
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
 if(document.hidden)return;
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
function setCallPhase(phase,text){if(!localCall)return;localCall.phase=phase;localCall.label.textContent=text;localCall.resume.textContent=phase==='ready'?'Iniciar conversa':phase==='paused'?'Retomar':'Falar agora';localCall.pause.disabled=phase==='ready'||phase==='paused';if(phase!=='listening')localCall.dialog.querySelector('[data-level]').value=0}
function pauseCall(reason='Conversa pausada. Toque em Retomar para continuar.'){
 if(!localCall)return;
 localCall.turn++;clearTimeout(resumeTimer);resumeTimer=null;setCallPhase('paused',reason);
 stopCapture();if(localCall.replyId)quietChatCancel(localCall.replyId);quiet(tts(),'stop');
}
function quietChatCancel(request){try{Promise.resolve(chat()?.cancel(request)).catch(()=>{})}catch{}}
function endVoice(){
 const previous=localCall;localCall=null;clearTimeout(resumeTimer);resumeTimer=null;
 stopCapture();if(previous){if(previous.replyId)quietChatCancel(previous.replyId);quiet(tts(),'stop');previous.dialog.close();previous.dialog.remove()}
}
function listenAgain(){
 if(!localCall||document.hidden)return;
 try{const s=current();if(s.chatId!==localCall.chatId){endVoice();return}startCapture('call')}catch(error){pauseCall(error.message)}
}
async function voiceTurn(text){
 const call=localCall;if(!call)return;
 const turn=++call.turn,replyId=id('voice-turn');call.replyId=replyId;
 const live=()=>localCall===call&&call.turn===turn&&!document.hidden;
 call.transcript.textContent=`Você: ${text}`;setCallPhase('thinking','Haruna está preparando a resposta…');
 try{
  const response=await chat().send(text,call.chatId,replyId);
  if(!live())return;
  if(!response||response.chatId!==call.chatId||response.error||response.interrupted)throw new Error(response?.text||'A resposta foi interrompida.');
  call.ttsId=id('local-call-audio');setCallPhase('speaking','Haruna está falando…');
  invoke(tts(),'speak',response.text,call.ttsId);
 }catch(error){if(live())pauseCall(error.message)}
 finally{if(call.replyId===replyId)call.replyId=null}
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
  const d=document.createElement('dialog');d.className='message-menu voice-call';d.setAttribute('aria-label','Conversa por voz local');
  d.innerHTML='<div class="voice-call-orb">H✦</div><h2>Conversa por voz</h2><p class="settings-note">Local • português • por turnos</p><p data-phase aria-live="polite">Toque em Iniciar. Suas falas serão enviadas a este chat e as respostas serão lidas em voz alta.</p><progress data-level max="1" value="0" aria-label="Nível do microfone"></progress><p data-transcript class="settings-note"></p><button data-resume>Iniciar conversa</button><button data-pause disabled>Pausar conversa</button><button data-end class="danger">Encerrar</button>';
  localCall={dialog:d,chatId:s.chatId,turn:0,phase:'ready',label:d.querySelector('[data-phase]'),transcript:d.querySelector('[data-transcript]'),resume:d.querySelector('[data-resume]'),pause:d.querySelector('[data-pause]'),ttsId:null,replyId:null};
  localCall.resume.onclick=async()=>{const call=localCall,reply=call?.replyId;if(!call)return;pauseCall();try{if(reply)await chat().cancel(reply);for(let i=0;i<100&&parse(native().getStatus()).busy;i++){if(localCall!==call||call.phase!=='paused')return;await new Promise(r=>setTimeout(r,150))}if(localCall===call&&call.phase==='paused')listenAgain()}catch(error){if(localCall===call)pauseCall(error.message)}};localCall.pause.onclick=()=>pauseCall();d.querySelector('[data-end]').onclick=endVoice;
  d.addEventListener('cancel',e=>{e.preventDefault();endVoice()});document.body.appendChild(d);d.showModal();
 }catch(error){alert(error.message)}
};
window.addEventListener('haruna-stt-status',e=>{
 const d=e.detail;update(d);if(!capture||d.requestId!==capture.request)return;
 if(d.state==='listening'||d.state==='transcribing'){capture.phase=d.state;redrawCapture();if(capture.mode==='call'){setCallPhase(d.state,d.state==='listening'?'Ouvindo… fale e faça uma pausa.':'Transcrevendo no dispositivo…');if(localCall)localCall.dialog.querySelector('[data-level]').value=d.level||0}return}
 if(d.state==='result'&&typeof d.text==='string'){
  const previous=capture;capture=null;redrawCapture();
  if(previous.chatId!==current().chatId){endVoice();return}
  if(previous.mode==='dictation')insertDictation(d.text,previous.chatId);else voiceTurn(d.text);return;
 }
 if(['no_speech','error','idle'].includes(d.state)){
  const mode=capture.mode;capture=null;redrawCapture();
  const message=d.error||(d.state==='no_speech'?'Não identifiquei fala. Tente novamente perto do microfone.':'Microfone parado.');
  if(mode==='call')pauseCall(message);else if(d.state!=='idle')alert(message);
 }
});
window.addEventListener('haruna-tts-status',e=>{
 const d=e.detail;if(!localCall)return;
 if(d.reason==='audio_focus_lost'){pauseCall('O áudio foi interrompido por outro aplicativo.');return}
 if(d.messageId!==localCall.ttsId||localCall.phase!=='speaking')return;
 if(d.state==='error'){pauseCall(d.error||'Falha na voz da Haruna.');return}
 if(d.state==='idle'){
  const call=localCall;setCallPhase('waiting','Sua vez…');clearTimeout(resumeTimer);
  resumeTimer=setTimeout(()=>{if(localCall===call&&call.phase==='waiting'&&!document.hidden)listenAgain()},450);
 }
});
q('[data-download]').onclick=()=>{try{if(confirm('Baixar o reconhecimento local (116,2 MB)?'))command('download')}catch(e){alert(e.message)}};
q('[data-import]').onclick=()=>{try{command('importModel')}catch(e){alert(e.message)}};
q('[data-cancel]').onclick=()=>quiet(native(),'cancelInstallation');q('[data-remove]').onclick=()=>{try{if(confirm('Remover somente o modelo de reconhecimento? A voz da Haruna, GGUF e Segundo Cérebro serão mantidos.'))command('removeModel')}catch(e){alert(e.message)}};
window.addEventListener('haruna-chat-context-changing',endVoice);
window.addEventListener('haruna-chat-submit',e=>{if(!e.detail?.fromVoice)endVoice()});
document.addEventListener('visibilitychange',()=>{if(document.hidden)endVoice();else refresh()});
window.addEventListener('pagehide',endVoice);
document.addEventListener('click',e=>{const button=e.target.closest('button');if(button?.classList.contains('nav-item')&&button.dataset.view!=='chat')endVoice();if(button?.id==='attach')endVoice()},true);
refresh();
