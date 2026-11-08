import {installImageControls} from './image-controls.js';
const api=window.HarunaImages,settings=document.querySelector('#settingsView');
if(api&&settings){
 const card=document.createElement('div');card.className='page-card image-settings-card';card.dataset.modelGroup='images';card.innerHTML='<div class="section-title"><strong>Geração de imagens</strong></div><details class="image-settings-guide"><summary>Formatos compatíveis e orientações</summary><p class="image-settings-help">Importe um pacote ZIP SD1.5 MNN Haruna ou Nezumi SD1.5 (Anything V5 / CyberRealistic). Ou importe um checkpoint SD1.5 completo .safetensors (experimental, CPU). SDXL Base/Illustrious completo também pode ser importado (experimental; CPU, pesos em disco, CLIP-L + CLIP-G + VAE). SD2, LoRA e componentes separados não são suportados. Para SD1.5 convencional, prefira cerca de 20 etapas; cinco servem como teste rápido.</p></details><div class="image-options"><div class="image-settings-subtitle">Preferências de geração</div><label data-chat-only-dimensions hidden>Resolução quadrada <select data-resolution><option value="custom">Personalizada</option><option value="256">256 × 256</option><option value="512">512 × 512</option><option value="1024">1024 × 1024</option></select></label><div class="model-actions" data-chat-only-dimensions hidden><button data-dimensions type="button">Dimensões da imagem</button></div><p data-native-info hidden></p><label><input data-previews type="checkbox"> Mostrar prévias por projeção dos latentes</label><p data-preview-support hidden></p><label>Etapas <input data-steps-range type="range" min="1" max="100"><input data-steps type="number" min="1" max="100"></label><label>CFG · força da descrição <input data-cfg-range type="range" min="1" max="20" step="0.5"><input data-cfg type="number" min="1" max="20" step="0.5"></label><details><summary>Controles avançados</summary><label>Clip skip <input data-clip type="number" min="-1" max="12"><small>-1 preserva o padrão do motor.</small></label><label>Sampler <select data-sampler><option value="default">Padrão do motor</option><option value="euler">Euler</option><option value="euler_a">Euler a</option><option value="dpm++2m">DPM++ 2M</option></select></label><label>Scheduler <select data-scheduler><option value="default">Padrão do motor</option><option value="discrete">Normal</option><option value="karras">Karras</option></select></label><label>Seed <input data-seed type="number" min="-1" max="2147483647"><small>-1 escolhe uma seed aleatória.</small></label><label>Descrição negativa <textarea data-negative rows="3" maxlength="2000"></textarea></label><label><input data-low type="checkbox"> Pouca memória · pesos em disco e VAE em blocos</label></details></div><label>Desempenho <select data-performance><option value="economy">Econômico</option><option value="balanced">Equilibrado</option><option value="performance">Desempenho</option></select></label><label><input data-save type="checkbox"> Salvar também na galeria automaticamente</label><button data-config type="button" hidden aria-hidden="true" tabindex="-1">Salvar preferências</button><p data-state role="status"></p><progress data-progress hidden></progress><div class="image-settings-subtitle">Modelos instalados</div><div data-models></div><button data-add type="button">Adicionar modelo do dispositivo</button><button data-cancel type="button">Cancelar operação</button>';
 card.querySelectorAll('select,input:not([type=checkbox])').forEach(e=>{e.style.maxWidth='100%';e.style.boxSizing='border-box'});card.querySelectorAll('label').forEach(e=>{e.style.display='block';e.style.marginBlock='12px'});for(const b of card.querySelectorAll('button')){const actions=document.createElement('div');actions.className='model-actions';b.replaceWith(actions);actions.append(b)}settings.append(card);
 // Put model management first; advanced options remain available on demand.
 const modelsHeading=[...card.querySelectorAll('.image-settings-subtitle')].find(el=>el.textContent.trim()==='Modelos instalados');
 const modelsList=card.querySelector('[data-models]');
 const addAction=card.querySelector('[data-add]')?.parentElement;
 const cancelAction=card.querySelector('[data-cancel]')?.parentElement;
 const guide=card.querySelector('.image-settings-guide');
 const advanced=document.createElement('details');
 advanced.className='image-settings-advanced';
 const advancedTitle=document.createElement('summary');
 advancedTitle.textContent='Preferências de geração';advanced.open=true;
 advanced.append(advancedTitle);
 // Advanced engine inputs remain bound and persisted, but do not occupy the
 // simplified image-model screen. They can be surfaced in a dedicated expert UI later.
 const engineAdvanced=card.querySelector('.image-options > details');
 if(engineAdvanced){engineAdvanced.hidden=true;engineAdvanced.style.display='none';}
 const options=card.querySelector('.image-options');
 const redundantTitle=options?.querySelector('.image-settings-subtitle');if(redundantTitle)redundantTitle.remove();
 const performance=card.querySelector('[data-performance]')?.closest('label');
 const save=card.querySelector('[data-save]')?.closest('label');
 const previews=card.querySelector('[data-previews]')?.closest('label');
 // Keep performance above both checkboxes in the simplified preferences.
 if(performance&&options)options.prepend(performance);
 const config=card.querySelector('[data-config]')?.parentElement;
 if(config)config.hidden=true;
 for(const element of [options,save,config].filter(Boolean))advanced.append(element);
 if(modelsHeading){
  card.insertBefore(modelsHeading,guide);
  for(const element of [modelsList,addAction,cancelAction].filter(Boolean))card.insertBefore(element,guide);
 }
 card.insertBefore(advanced,guide);
 // Keep privacy as the last section and group all model management together.
 const privacy=[...settings.querySelectorAll(':scope > .page-card')].find(el=>el.querySelector('.section-title strong')?.textContent.trim()==='Privacidade e armazenamento');
 if(privacy)settings.insertBefore(card,privacy);
 // Dimension controls remain in the DOM for the existing engine bindings, but
 // their visible UI belongs to the chat's image-generation panel.
 card.querySelectorAll('[data-chat-only-dimensions]').forEach(element=>{element.hidden=true;element.style.display='none'});
 const $=s=>card.querySelector(s);let initialized=false,last='';
 const controls=installImageControls(card,api);
 // Keep the native save binding, but persist visible preferences as they change.
 let preferenceTimer;
 const persistPreferences=()=>{clearTimeout(preferenceTimer);preferenceTimer=setTimeout(()=>{if(!$('[data-config]').disabled)controls.save({performance:$('[data-performance]').value,autoSave:$('[data-save]').checked,showPreviews:$('[data-previews]').checked})},250)};
 for(const selector of ['[data-performance]','[data-save]','[data-previews]'])$(selector).addEventListener('change',persistPreferences);

 $('[data-add]').onclick=()=>api.add();$('[data-cancel]').onclick=()=>api.cancel();
 $('[data-config]').onclick=()=>controls.save({performance:$('[data-performance]').value,autoSave:$('[data-save]').checked,showPreviews:$('[data-previews]').checked});
 function update(){if(document.hidden)return;try{const raw=api.status();if(raw===last)return;last=raw;const s=JSON.parse(raw);if(!s.models)return;controls.update(s);if(!initialized||card.dataset.model!==(s.selected||'')){$('[data-performance]').value=s.performance;$('[data-save]').checked=s.autoSave;$('[data-previews]').checked=!!s.showPreviews;initialized=true;card.dataset.model=s.selected||''}

 const labels={NOT_INSTALLED:'Não instalado',INSTALLED:'Instalado',INCOMPATIBLE:'Incompatível',LOADING:'Carregando',LOADED:'Carregado',GENERATING:'Gerando imagem',ERROR:'Erro',INSTALLING:'Instalando',RESTORING_LLM:'Recarregando o GGUF anterior'};
 $('[data-previews]').disabled=s.busy||!s.previewSupported;$('[data-preview-support]').textContent=s.previewSupported?'Prévia real aproximada, até 128 × 128; desativada se faltar margem de memória. Não é a imagem final.':'Este motor não fornece prévias eficientes; somente progresso real.';
 $('[data-state]').textContent=(labels[s.state]||s.state)+(s.error?' · '+s.error:'')+(s.restoreWarning?' · '+s.restoreWarning:'')+(s.busy&&s.copiedBytes?' · '+(s.copiedBytes/1048576).toFixed(1)+' MiB copiados':'');$('[data-progress]').hidden=!s.busy;
 $('[data-performance]').disabled=s.busy||s.performanceSupported===false;$('[data-performance]').title=s.performanceSupported===false?'Nezumi usa configuração CPU própria; este perfil se aplica ao motor Haruna.':'';$('[data-add]').disabled=s.busy;$('[data-config]').disabled=s.busy;
 const list=$('[data-models]');list.replaceChildren();for(const m of s.models){const row=document.createElement('div');row.className='setting-row';row.style.flexWrap='wrap';const name=document.createElement('span');name.style.flex='1 1 100%';name.style.overflowWrap='anywhere';name.textContent=m.name+' · '+(labels[m.state]||m.state)+(s.selected===m.id?' · Principal':'');row.append(name);const actions=document.createElement('div');actions.className='model-actions';row.append(actions);
 for(const [label,action,disabled]of [['Selecionar',()=>api.select(m.id),m.state==='INCOMPATIBLE'],['Carregar',()=>api.load(m.id),!(m.engineAvailable??s.engineAvailable)||m.state==='INCOMPATIBLE'||s.loaded===m.id],['Descarregar',()=>api.unload(),s.loaded!==m.id],['Remover',()=>{if(confirm('Excluir este modelo de imagens do dispositivo?'))api.remove(m.id,true)},false]]){const b=document.createElement('button');b.type='button';b.textContent=label;b.disabled=s.busy||disabled;b.onclick=action;actions.append(b)}list.append(row)}
 if(!s.engineAvailable){const n=document.createElement('p');n.textContent='Motor nativo indisponível. Instalação não implica que o modelo possa ser carregado.';list.append(n)}
 }catch(e){$('[data-state]').textContent='Não foi possível consultar os modelos de imagem'}}
 const timer=setInterval(update,1500);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});update();
}

