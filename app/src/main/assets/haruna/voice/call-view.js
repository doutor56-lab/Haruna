// Stage 6 authorized reference: lightweight SVG controls, one call, one in-app miniplayer.
const paths={back:'M15 5l-7 7 7 7',close:'M6 6l12 12M18 6L6 18',mic:'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5ZM5 11v1a7 7 0 0 0 14 0v-1M12 19v3M8 22h8',pause:'M8 5v14M16 5v14',play:'m8 5 11 7-11 7Z',stop:'M6 6h12v12H6Z',skip:'m5 5 10 7-10 7ZM19 5v14',keyboard:'M3 6h18v12H3ZM6 10h1m3 0h1m3 0h1m3 0h1M6 14h1m3 0h7',settings:'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z',phone:'M7 3l3 5-2 2a15 15 0 0 0 6 6l2-2 5 3-2 4C10 22 2 14 3 5Z'};
export function voiceIcon(name){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.mic}"/></svg>`}
const control=(data,icon,label,extra='')=>`<button type="button" data-${data} class="call-control ${extra}" aria-label="${label}">${voiceIcon(icon)}<span>${label}</span></button>`;
export class CallView {
 constructor({end,pause,resume,skip,stopSpeech,finish,settings}){
  this.dialog=document.createElement('dialog');this.dialog.className='message-menu voice-call voice-call-reference';this.dialog.setAttribute('aria-label','Conversa por voz local');
  this.dialog.innerHTML=`<header class="call-header">${control('minimize','back','Voltar ao chat')}<div class="call-brand"><span class="brand-mark" aria-hidden="true"></span><strong>Haruna</strong></div>${control('end','close','Encerrar')}</header><div class="call-state" aria-live="polite"><i></i><span data-state-label>Conversa por voz</span></div><p class="call-subtitle">Local · português · offline</p><div class="call-orbit"><div class="voice-call-orb" data-state="ready" aria-hidden="true"></div></div><div class="call-copy"><h2 data-heading>Olá! Vamos conversar?</h2><p data-phase aria-live="polite">Estou pronta para conversar. Toque em iniciar quando quiser.</p><p data-transcript class="settings-note"></p><div class="call-thinking" aria-hidden="true"><i></i><i></i><i></i><i></i></div></div><progress data-level max="1" value="0" hidden aria-label="Nível do áudio"></progress><footer class="call-controls">${control('keyboard','keyboard','Teclado')}${control('resume','mic','Iniciar conversa','primary')}${control('settings','settings','Configurar voz')}${control('pause','pause','Pausar conversa')}${control('finish','stop','Concluir fala')}${control('skip','skip','Pular fala')}${control('stop-speech','stop','Parar fala')}${control('cancel-call','close','Cancelar chamada')}${control('cancel-response','close','Cancelar resposta')}</footer>`;
  this.mini=document.createElement('aside');this.mini.className='voice-miniplayer';this.mini.hidden=true;this.mini.setAttribute('aria-label','Chamada de voz em andamento');
  this.mini.innerHTML=`<button type="button" data-open class="mini-open" aria-label="Abrir chamada"><span class="mini-orb" aria-hidden="true"></span><span><strong>Haruna</strong><small data-mini-label>Conversa por voz</small></span></button><button type="button" data-mini-pause aria-label="Pausar conversa">${voiceIcon('pause')}</button><button type="button" data-mini-end class="call-end" aria-label="Encerrar chamada">${voiceIcon('close')}</button>`;
  this.wave=document.createElement('span');this.wave.className='voice-composer-wave';this.wave.setAttribute('aria-hidden','true');this.wave.innerHTML='<i></i><i></i><i></i><i></i><i></i><i></i><i></i>';
  document.querySelector('#composer')?.appendChild(this.wave);
  const q=s=>this.dialog.querySelector(s);
  this.orb=q('.voice-call-orb');this.label=q('[data-phase]');this.transcript=q('[data-transcript]');this.resume=q('[data-resume]');this.pause=q('[data-pause]');
  q('[data-end]').onclick=end;q('[data-minimize]').onclick=()=>this.minimize();this.pause.onclick=pause;this.resume.onclick=resume;q('[data-skip]').onclick=skip;q('[data-finish]').onclick=finish;q('[data-settings]').onclick=settings;q('[data-keyboard]').onclick=()=>this.minimize();q('[data-stop-speech]').onclick=stopSpeech;q('[data-cancel-call]').onclick=end;q('[data-cancel-response]').onclick=pause;
  this.mini.querySelector('[data-open]').onclick=()=>this.open();this.mini.querySelector('[data-mini-pause]').onclick=pause;this.mini.querySelector('[data-mini-end]').onclick=end;
  this.dialog.addEventListener('cancel',e=>{e.preventDefault();this.minimize()});
  document.body.append(this.dialog,this.mini);
  this.layoutMini=()=>{if(this.mini.hidden)return;const composer=document.querySelector('#composer'),rect=composer?.getClientRects().length?composer.getBoundingClientRect():null;this.mini.style.setProperty('--voice-mini-bottom',Math.max(82,rect&&rect.top>0?window.innerHeight-rect.top+10:82)+'px')};
  this.composerObserver=new ResizeObserver(this.layoutMini);const composer=document.querySelector('#composer');if(composer)this.composerObserver.observe(composer);window.addEventListener('resize',this.layoutMini);window.visualViewport?.addEventListener('resize',this.layoutMini);this.open();
 }
 open(){this.mini.hidden=true;if(!this.dialog.open)this.dialog.showModal()}
 minimize(){if(this.dialog.open)this.dialog.close();this.mini.hidden=false;this.layoutMini()}
 phase(phase){
  this.dialog.dataset.phase=phase;this.mini.dataset.phase=phase;
  const states={ready:'Conversa por voz',starting:'Preparando…',listening:'Ouvindo…',transcribing:'Transcrevendo…',thinking:'Pensando…',speaking:'Falando…',audiopaused:'Fala pausada',paused:'Pausada',waiting:'Sua vez…',error:'Não foi possível continuar'};
  this.dialog.querySelector('[data-state-label]').textContent=states[phase]||'Conversa por voz';
  this.mini.querySelector('[data-mini-label]').textContent=states[phase]||'Conversa por voz';
  const heading={ready:'Olá! Vamos conversar?',listening:'Pode falar…',thinking:'Preparando sua resposta…',speaking:'A resposta está sendo lida em voz alta.',paused:'Conversa pausada',audiopaused:'Toque para continuar a fala.',error:'Vamos tentar novamente?'};
  this.dialog.querySelector('[data-heading]').textContent=heading[phase]||'';
  this.pause.disabled=['ready','paused','error','audiopaused'].includes(phase);
  const ready=['ready','paused','error'].includes(phase),talking=['speaking','audiopaused'].includes(phase),listening=phase==='listening';
  this.dialog.querySelector('[data-keyboard]').hidden=!ready;this.dialog.querySelector('[data-settings]').hidden=!ready;
  this.resume.hidden=!(ready||phase==='audiopaused');this.pause.hidden=!(listening||phase==='speaking');
  this.dialog.querySelector('[data-stop-speech]').hidden=!talking;this.dialog.querySelector('[data-cancel-call]').hidden=!listening;this.dialog.querySelector('[data-cancel-response]').hidden=!['thinking','transcribing','starting'].includes(phase);
  this.dialog.querySelector('[data-finish]').hidden=phase!=='listening';this.dialog.querySelector('[data-skip]').hidden=!['speaking','audiopaused'].includes(phase);
  this.mini.querySelector('[data-mini-pause]').disabled=this.pause.disabled;
  this.pause.setAttribute('aria-label',phase==='speaking'?'Pausar áudio':'Pausar conversa');this.pause.querySelector('span').textContent=phase==='speaking'?'Pausar áudio':'Pausar conversa';
  this.wave.classList.toggle('active',['listening','speaking'].includes(phase));
 }
 level(value){this.orb.style.setProperty('--voice-scale',String(1+value*.13));this.mini.style.setProperty('--voice-scale',String(1+value*.13));this.wave.style.setProperty('--voice-amplitude',String(.15+value*.85))}
 close(){this.composerObserver.disconnect();window.removeEventListener('resize',this.layoutMini);window.visualViewport?.removeEventListener('resize',this.layoutMini);this.dialog.close();this.dialog.remove();this.mini.remove();this.wave.remove()}
}

export function voiceSettings({stt,tts,invoke,onStreaming}){
 const d=document.createElement('dialog');d.className='message-menu call-voice-settings';d.setAttribute('aria-label','Configurações de voz');
 d.innerHTML=`<div class="call-settings-title"><strong>Configurações de voz</strong><button type="button" data-close aria-label="Fechar configurações de voz">${voiceIcon('close')}</button></div><label class="speech-field">Modelo de reconhecimento (STT)<select data-stt></select></label><p class="settings-note" data-format></p><label class="speech-field">Voz — Supertonic 3 INT8<select data-tts></select></label><label class="speech-field">Velocidade da fala <output data-speed-value></output><input data-speed type="range" min="0.7" max="1.4" step="0.05" /></label><label class="speech-field">Volume da voz <output data-volume-value></output><input data-volume type="range" min="0" max="1" step="0.05" /></label><label class="call-toggle">Iniciar fala enquanto gera<input data-stream type="checkbox" role="switch" /></label><label class="call-toggle">Encerrar fala na pausa<input data-auto type="checkbox" role="switch" /></label><p class="settings-note">O reconhecimento é local e por turnos, com limite de 20 segundos por fala. Instalação e remoção de modelos ficam nas Configurações. O microfone pausa enquanto Haruna responde.</p><p data-error role="status"></p>`;
 const q=s=>d.querySelector(s),message=q('[data-error]');
 const action=fn=>()=>{try{fn();message.textContent=''}catch(e){message.textContent=e.message}};
 for(const model of stt.models||[]){if(!model.installed)continue;const o=document.createElement('option');o.value=model.id;o.textContent=model.name;q('[data-stt]').appendChild(o)}
 q('[data-stt]').value=stt.selectedId||'';q('[data-format]').textContent='Somente modelos instalados e compatíveis. Áudio no dispositivo.';
 for(let i=0;i<Number(tts.speakers||0);i++){const o=document.createElement('option');o.value=String(i);o.textContent=tts.voiceLabels?.[i]||`Voz ${i+1}`;q('[data-tts]').appendChild(o)}q('[data-tts]').value=String(tts.speaker??-1);
 q('[data-speed]').value=String(tts.speed||1);q('[data-volume]').value=String(tts.volume??1);
 const labels=()=>{q('[data-speed-value]').textContent=Number(q('[data-speed]').value).toFixed(2)+'×';q('[data-volume-value]').textContent=Math.round(Number(q('[data-volume]').value)*100)+'%'};labels();
 q('[data-stt]').onchange=action(()=>invoke('stt','selectModel',q('[data-stt]').value));
 q('[data-tts]').onchange=action(()=>invoke('tts','configure',JSON.stringify({speaker:Number(q('[data-tts]').value)})));
 for(const field of ['speed','volume']){q(`[data-${field}]`).oninput=labels;q(`[data-${field}]`).onchange=action(()=>invoke('tts','configure',JSON.stringify({[field]:Number(q(`[data-${field}]`).value)})))}
 q('[data-stream]').checked=localStorage.getItem('haruna_voice_stream')!=='off';q('[data-auto]').checked=stt.automaticPause!==false;
 q('[data-stream]').onchange=action(()=>{const enabled=q('[data-stream]').checked;localStorage.setItem('haruna_voice_stream',enabled?'on':'off');onStreaming(enabled)});
 q('[data-auto]').onchange=action(()=>invoke('stt','configure',JSON.stringify({automaticPause:q('[data-auto]').checked})));
 const modelStatus=e=>{if(e.detail?.meter)return;const data=e.detail||{};if(data.selectedId)q('[data-stt]').value=data.selectedId;if(data.state==='error')message.textContent=data.error||'Não foi possível selecionar o modelo.'};window.addEventListener('haruna-stt-status',modelStatus);
 const close=()=>{window.removeEventListener('haruna-stt-status',modelStatus);d.close();d.remove()};q('[data-close]').onclick=close;d.addEventListener('cancel',e=>{e.preventDefault();close()});document.body.appendChild(d);d.showModal();
}
