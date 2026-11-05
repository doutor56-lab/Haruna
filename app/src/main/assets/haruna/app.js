import {beginPipeline,measured,measuredAsync,takeInspectorRequest} from './diagnostics/pipeline.js';
import {modelStatus} from './voice/model-names.js';
import {createMessageView} from './streaming/message-view.js';
import {preparationStarted,contextPrepared,domUpdated,presentationFinished} from './diagnostics/inference.js';
import {observe as observeExperience} from './learned/store.js';import {learnedContext} from './learned/context.js';
import {directIdentityReply} from './identity/direct-replies.js';
import * as firstContact from './essential/first-contact.js';import {essentialContext,recentMessages,referenceContent,fitReferences,conversationMessages} from './context/messages.js';
import llm from './llm-engine.js';import {refreshModels} from './model-library.js';import knowledge from './knowledge-store.js';import attachments from './attachment-store.js';import android from './android-bridge.js';
const $=s=>document.querySelector(s),messagesEl=$('#messages'),input=$('#input'),form=$('#composer'),brain=$('#brain'),modelName=$('#modelName'),stopBtn=$('#stop'),sendBtn=$('#send'),newChatBtn=$('#newChat'),thinkBtn=$('#think'),reasoningMode=$('#reasoningMode'),toast=$('#memoryToast'),drawer=$('#drawer'),scrim=$('#scrim'),menu=$('#menu'),closeMenu=$('#closeMenu'),drawerNew=$('#drawerNew'),chatList=$('#chatList'),chatSearch=$('#chatSearch'),memoryCount=$('#memoryCount'),memoryPageCount=$('#memoryPageCount'),memoryItems=$('#memoryItems'),feedAi=$('#feedAi'),knowledgeFile=$('#knowledgeFile'),knowledgeList=$('#knowledgeList'),kp=$('#knowledgeProgress'),kpTitle=$('#knowledgeProgressTitle'),kpPct=$('#knowledgeProgressPercent'),kpBar=$('#knowledgeProgressBar'),kpDetail=$('#knowledgeProgressDetail'),attachmentTray=$('#attachmentTray'),selectChats=$('#selectChats'),selectionBar=$('#chatSelectionBar'),selectAllChats=$('#selectAllChats'),selectedChatCount=$('#selectedChatCount'),cancelChatSelection=$('#cancelChatSelection'),deleteBar=$('#chatDeleteBar'),deleteSelectedChats=$('#deleteSelectedChats'),drawerSubtitle=$('#drawerSubtitle'),onboarding=$('#onboarding'),onboardingWelcome=$('#onboardingWelcome'),onboardingModels=$('#onboardingModels'),onboardingProgress=$('#onboardingProgress'),onboardingReady=$('#onboardingReady'),onboardingStart=$('#onboardingStart'),onboardingSkip=$('#onboardingSkip'),onboardingBack=$('#onboardingBack'),onboardingImport=$('#onboardingImport'),onboardingFinish=$('#onboardingFinish'),onboardingProgressTitle=$('#onboardingProgressTitle'),onboardingProgressDetail=$('#onboardingProgressDetail'),onboardingProgressBar=$('#onboardingProgressBar'),onboardingProgressPercent=$('#onboardingProgressPercent');
const CHATS_KEY='haruna_chats_v2',LEGACY_KEY='haruna_chat_v1',MEMORY_KEY='haruna_memories_v1',THINK_KEY='haruna_think_mode',ONBOARDING_KEY='haruna_onboarding_v1';const read=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}},now=()=>Date.now(),id=()=>`${Date.now().toString(36)}${Math.random().toString(36).slice(2,7)}`;let memories=read(MEMORY_KEY,[]),chats=read(CHATS_KEY,[]),activeId=localStorage.getItem('haruna_active_chat'),shownError=null,generating=false,thinkMode=localStorage.getItem(THINK_KEY)==='1',currentModelName='',knowledgeType='knowledge',selectingChats=false,onboardingImporting=false,chatBusy=false,activeGeneration=null,attachmentTargetId=null,voiceRequestId=null,voiceStreamObserver=null;let essentialReady=false;const selectedChats=new Set();const legacy=read(LEGACY_KEY,[]);if(!chats.length&&legacy.length){chats=[{id:id(),title:'Conversa anterior',createdAt:now(),updatedAt:now(),messages:legacy,pinned:false}];activeId=chats[0].id;localStorage.removeItem(LEGACY_KEY)}for(const c of chats)if(typeof c.pinned!=='boolean')c.pinned=false;
function sortChats(){chats.sort((a,b)=>(Number(b.pinned)-Number(a.pinned))||((b.updatedAt||0)-(a.updatedAt||0)))}function fresh(){const c={id:id(),title:'Nova conversa',createdAt:now(),updatedAt:now(),messages:[],pinned:false};chats.unshift(c);activeId=c.id;persist();return c}function active(){return chats.find(c=>c.id===activeId)||chats[0]||fresh()}function renderMemories(){if(memoryPageCount)memoryPageCount.textContent=`${memories.length} ${memories.length===1?'memória salva':'memórias salvas'}`;if(!memoryItems)return;memoryItems.innerHTML='';if(!memories.length){memoryItems.innerHTML='<div class="model-empty">Nenhuma memória de conversa salva ainda.</div>';return}memories.slice().reverse().forEach(m=>{const el=document.createElement('div');el.className='memory-item';el.textContent=m;memoryItems.appendChild(el)})}function persist(){sortChats();localStorage.setItem(CHATS_KEY,JSON.stringify(chats));localStorage.setItem(MEMORY_KEY,JSON.stringify(memories.slice(-200)));localStorage.setItem('haruna_active_chat',activeId||'');memoryCount.textContent=`${memories.length} ${memories.length===1?'memória salva':'memórias salvas'}`;renderList();renderMemories()}
function renderKnowledge(){if(!knowledgeList)return;const docs=knowledge.list();knowledgeList.innerHTML='';if(!docs.length){knowledgeList.innerHTML='<div class="model-empty">Nenhum conhecimento adicionado ainda.</div>';return}docs.forEach(d=>{const row=document.createElement('div');row.className='model-row';row.innerHTML='<div class="model-info"><strong></strong><small></small></div><div class="model-actions"></div>';row.querySelector('strong').textContent=d.name;row.querySelector('small').textContent=`${d.type==='behavior'?'Conversação':'Conhecimento'} • ${d.chunks} trechos • ${d.active?'Ativo':'Pausado'}`;const a=row.querySelector('.model-actions'),toggle=document.createElement('button'),del=document.createElement('button');toggle.textContent=d.active?'Pausar':'Ativar';toggle.onclick=()=>{knowledge.toggle(d.id);renderKnowledge()};del.textContent='Excluir';del.className='danger';del.onclick=async()=>{if(confirm(`Excluir ${d.name}?`)){await knowledge.remove(d.id);renderKnowledge()}};a.append(toggle,del);knowledgeList.appendChild(row)})}
window.addEventListener('haruna-knowledge-changed',renderKnowledge);
function renderAttachments(){
 if(!attachmentTray)return;
 const files=attachments.pending(activeId);attachmentTray.replaceChildren();
 attachmentTray.hidden=!files.length;attachmentTray.style.display=files.length?'flex':'none';
 for(const file of files){
  const chip=document.createElement('div'),name=document.createElement('span'),remove=document.createElement('button');
  chip.className='draft-file';name.textContent=file.name;name.title=file.name;
  remove.type='button';remove.textContent='×';remove.setAttribute('aria-label',`Remover ${file.name} do rascunho`);
  remove.onclick=()=>{const result=android.deleteAttachment(file.path);if(result?.status!=='ok'){alert(result?.error||'Não foi possível remover o arquivo');return}attachments.unstage(activeId,file.path);attachments.forgetPath(activeId,file.path);renderAttachments()};
  chip.append(name,remove);attachmentTray.appendChild(chip);
 }
}
async function restoreChatFiles(chat){
 const files=chat.messages.flatMap(m=>m.attachments||[]);
 for(const file of files){
  if(attachments.list(chat.id).some(f=>f.path===file.path))continue;
  const result=android.readTextAttachment(file.path);
  if(result?.status==='ok')attachments.add(chat.id,file,result.text||'');
 }
}
function openMessageMenu(chat,message,bubble){
 if(document.querySelector('.message-menu[open]'))return;
 const dialog=document.createElement('dialog');dialog.className='message-menu';dialog.setAttribute('aria-label','Opções da mensagem');
 const heading=document.createElement('strong');heading.textContent='Mensagem';dialog.appendChild(heading);
 const close=()=>{dialog.close();dialog.remove();bubble.focus()};
 const action=(label,handler,danger=false)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.uiIcon=({'Ouvir':'volume','Copiar texto':'copy','Responder citando':'reply','Salvar no Segundo Cérebro':'memory','Excluir mensagem':'trash','Cancelar':'close'}[label]||'folder');if(danger)b.className='danger';b.onclick=async()=>{close();try{await handler(b)}catch(error){alert(error.message||String(error))}};dialog.appendChild(b)};
 if(message.role==='assistant'&&!message.error)action('Ouvir',async()=>{const speech=await import('./speech-ui.js');speech.hearMessage(message.content||'',`${chat.id}:${message.at}`)});
 action('Copiar texto',async()=>{const text=message.content||'';try{await navigator.clipboard.writeText(text)}catch{const field=document.createElement('textarea');field.value=text;document.body.appendChild(field);field.select();const copied=document.execCommand('copy');field.remove();if(!copied)alert('Não foi possível copiar o texto.')}});
 action('Responder citando',()=>{input.value=`> ${(message.content||'').slice(0,600).replace(/\n/g,'\n> ')}\n\n${input.value}`;resize();input.focus()});
 action('Salvar no Segundo Cérebro',b=>saveKnowledge(chat,[message],b));
 for(const file of message.attachments||[])action(`Salvar conteúdo de ${file.name}`,async b=>{const result=android.readTextAttachment(file.path);if(result?.status!=='ok')throw new Error(result?.error||'Não foi possível ler este arquivo');await saveKnowledge(chat,[{role:'user',content:`Arquivo: ${file.name}\n${result.text}`}],b)});
 action('Excluir mensagem',async()=>{
  if(chatBusy||activeGeneration){alert('Aguarde a resposta terminar antes de excluir uma mensagem.');return}
  if(!confirm('Excluir esta mensagem? O conteúdo já salvo no Segundo Cérebro será mantido.'))return;
  await resetChatContext();
  for(const file of message.attachments||[]){
   const used=chat.messages.some(m=>m!==message&&(m.attachments||[]).some(f=>f.path===file.path))||attachments.pending(chat.id).some(f=>f.path===file.path);
   if(!used){const result=android.deleteAttachment(file.path);if(result?.status!=='ok')throw new Error(result?.error||'Não foi possível excluir o anexo');const item=attachments.list(chat.id).find(f=>f.path===file.path);if(item)attachments.remove(chat.id,item.id);attachments.forgetPath(chat.id,file.path)}
  }
  chat.messages=chat.messages.filter(m=>m!==message);chat.updatedAt=now();persist();render();
 },true);
 action('Cancelar',()=>{});
 dialog.addEventListener('cancel',e=>{e.preventDefault();close()});dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close()}});
 document.body.appendChild(dialog);dialog.showModal();
}
function bindMessageMenu(bubble,chat,message){
 let timer=null,startX=0,startY=0,opened=false;
 const cancel=()=>{clearTimeout(timer);timer=null};
 bubble.classList.add('message-interactive');bubble.tabIndex=0;bubble.setAttribute('aria-label','Mensagem. Pressione e segure para abrir opções.');
 bubble.addEventListener('pointerdown',e=>{if(e.button!==0)return;cancel();opened=false;startX=e.clientX;startY=e.clientY;timer=setTimeout(()=>{if(!bubble.isConnected)return;opened=true;openMessageMenu(chat,message,bubble)},500)});
 bubble.addEventListener('pointermove',e=>{if(Math.abs(e.clientX-startX)>12||Math.abs(e.clientY-startY)>12)cancel()});
 for(const name of ['pointerup','pointercancel','pointerleave'])bubble.addEventListener(name,cancel);
 bubble.addEventListener('contextmenu',e=>{e.preventDefault();cancel();if(!opened)openMessageMenu(chat,message,bubble);opened=true});
 bubble.addEventListener('keydown',e=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')||e.key==='Enter'){e.preventDefault();openMessageMenu(chat,message,bubble)}});
}

function add(role,text,message=null,chat=null,autoScroll=true){const el=document.createElement('div');el.className=`msg ${role}`;if(role==='assistant'){const a=document.createElement('div');a.className='avatar';a.textContent='H';el.appendChild(a)}const b=document.createElement('div');b.className='bubble';b.textContent=text;if(message?.image&&window.harunaRenderImageCard)window.harunaRenderImageCard(b,message);if(message&&chat){for(const file of message.attachments||[]){const label=document.createElement('span');label.className='sent-file';label.textContent=file.name;b.prepend(label)}bindMessageMenu(b,chat,message)}el.appendChild(b);messagesEl.appendChild(el);if(autoScroll)messagesEl.scrollTop=messagesEl.scrollHeight;return b}function render({followEnd=true}={}){const oldTop=messagesEl.scrollTop;messagesEl.innerHTML='';const c=active();maybeEssentialOpening(c);if(!c.messages.length){messagesEl.innerHTML='<div class="empty"><div class="orb">H✦</div><strong>Olá, eu sou a Haruna.</strong><span>Converse comigo. Suas conversas e memórias ficam salvas localmente neste dispositivo.</span></div>';renderAttachments();return}c.messages.forEach(m=>add(m.role,m.display||m.content,m,c,false));messagesEl.scrollTop=followEnd?messagesEl.scrollHeight:oldTop;renderAttachments()}
function maybeEssentialOpening(chat){
 if(!essentialReady||generating||activeGeneration||onboarding&&!onboarding.hidden)return;
 const opening=firstContact.openingFor(chat,{ready:true,chatIds:chats.map(c=>c.id),hasDraft:!!(input.value.trim()||attachments.pending(chat.id).length)});
 if(!opening)return;
 const before=chat.messages.length;
 try{push('assistant',opening.text,chat,{essentialIntro:opening.kind})}
 catch{chat.messages.length=before;essentialReady=false}
}
function filteredChats(q=chatSearch?.value?.trim().toLowerCase()||''){sortChats();return chats.filter(c=>!q||c.title.toLowerCase().includes(q)||c.messages.some(m=>(m.content||'').toLowerCase().includes(q)))}function updateSelectionUi(){if(!selectionBar)return;selectionBar.hidden=!selectingChats;selectionBar.style.display=selectingChats?'flex':'none';deleteBar.hidden=!selectingChats;deleteBar.style.display=selectingChats?'block':'none';drawerNew.hidden=selectingChats;drawerNew.style.display=selectingChats?'none':'';selectChats.textContent=selectingChats?'Concluir':'Selecionar';drawerSubtitle.textContent=selectingChats?'Escolha as conversas':'Seu histórico local';selectedChatCount.textContent=`${selectedChats.size} ${selectedChats.size===1?'selecionada':'selecionadas'}`;deleteSelectedChats.disabled=!selectedChats.size;const visible=filteredChats();selectAllChats.textContent=visible.length&&visible.every(c=>selectedChats.has(c.id))?'Desmarcar tudo':'Selecionar tudo'}function setSelectionMode(value,firstId=null){selectingChats=value;selectedChats.clear();if(value&&firstId)selectedChats.add(firstId);updateSelectionUi();renderList()}function toggleChatSelection(chatId){selectedChats.has(chatId)?selectedChats.delete(chatId):selectedChats.add(chatId);updateSelectionUi();renderList()}function renameChat(c){const next=prompt('Renomear conversa',c.title);if(next===null)return;const clean=next.replace(/\s+/g,' ').trim().slice(0,80);if(!clean)return;c.title=clean;c.updatedAt=now();persist()}function togglePin(c){c.pinned=!c.pinned;c.updatedAt=now();persist()}function renderList(q=chatSearch?.value?.trim().toLowerCase()||''){chatList.innerHTML='';for(const c of filteredChats(q)){const row=document.createElement('div'),b=document.createElement('button'),chosen=selectedChats.has(c.id);row.className='chat-row'+(c.pinned?' pinned':'');b.className='chat-item'+(c.id===activeId?' active':'')+(chosen?' selected':'');b.type='button';b.innerHTML=(selectingChats?'<span class="chat-check">✓</span>':'')+'<span class="chat-item-copy"><strong></strong><small></small></span>';b.querySelector('strong').textContent=c.title;b.querySelector('small').textContent=(c.messages.at(-1)?.content||'Sem mensagens').slice(0,80);let pressTimer=null,longPressed=false;const startPress=()=>{if(selectingChats||generating)return;longPressed=false;pressTimer=setTimeout(()=>{longPressed=true;setSelectionMode(true,c.id)},520)};const stopPress=()=>{if(pressTimer){clearTimeout(pressTimer);pressTimer=null}};b.addEventListener('pointerdown',startPress);b.addEventListener('pointerup',stopPress);b.addEventListener('pointercancel',stopPress);b.addEventListener('pointerleave',stopPress);b.oncontextmenu=e=>{e.preventDefault();if(!selectingChats)setSelectionMode(true,c.id)};b.onclick=async()=>{if(chatBusy)return;if(longPressed){longPressed=false;return}if(selectingChats){toggleChatSelection(c.id);return}await switchConversation(c.id)};row.appendChild(b);if(!selectingChats){const actions=document.createElement('div');actions.className='chat-quick-actions';const pin=document.createElement('button'),rename=document.createElement('button');pin.type=rename.type='button';pin.className='chat-mini';rename.className='chat-mini';pin.textContent='';pin.title=c.pinned?'Desafixar conversa':'Fixar conversa';rename.textContent='';rename.title='Renomear conversa';pin.onclick=e=>{e.stopPropagation();togglePin(c)};rename.onclick=e=>{e.stopPropagation();renameChat(c)};const save=document.createElement('button');save.type='button';save.className='chat-mini';save.textContent='';save.title='Salvar conversa no Segundo Cérebro';save.setAttribute('aria-label',save.title);save.onclick=e=>{e.stopPropagation();saveKnowledge(c,c.messages,save)};actions.append(pin,rename,save);row.appendChild(actions)}chatList.appendChild(row)}updateSelectionUi()}function titleFrom(t){return t.replace(/\s+/g,' ').trim().slice(0,42)||'Nova conversa'}function push(role,content,c=active(),extra={}){c.messages.push({role,content,at:now(),...extra});if(role==='user'&&c.messages.filter(x=>x.role==='user').length===1)c.title=titleFrom(content);c.updatedAt=now();persist()}
async function saveKnowledge(chat,messages,button){
 const content=messages.filter(m=>m.content&&!m.error).map(m=>`${m.role==='user'?'Usuário':'Haruna'}: ${m.display||m.content}`).join('\n\n');
 if(!content.trim()){alert('Esta conversa ainda não tem conteúdo para salvar.');return}
 const reviewed=prompt('Revise o conteúdo que deseja guardar no Segundo Cérebro. Você pode editar ou resumir antes de salvar.',content);
 if(reviewed===null||!reviewed.trim())return;
 button.disabled=true;
 try{
  await knowledge.addText(`Conversa: ${chat.title}`,reviewed.trim(),'knowledge',()=>{},{source:`chat:${chat.id}`,approvedForTraining:false,rejectedForTraining:false});
  button.textContent='Salvo';button.title='Conteúdo salvo no Segundo Cérebro';toast.textContent='Conteúdo salvo no Segundo Cérebro';toast.hidden=false;setTimeout(()=>toast.hidden=true,2200);
 }catch(error){button.disabled=false;alert(`Não foi possível salvar: ${error.message||error}`)}
}
async function stopCurrentGeneration(){
 if(!activeGeneration)return;
 const pending=activeGeneration;
 llm.stopGeneration();
 await pending;
}
async function resetChatContext(){
 window.dispatchEvent(new CustomEvent('haruna-chat-context-changing'));
 const status=await llm.refreshStatus();
 if(status.modelLoaded)await llm.resetConversation();
}
async function switchConversation(chatId){
 if(chatBusy||chatId===activeId){hideDrawer();return}
 chatBusy=true;
 try{
  await stopCurrentGeneration();
  await resetChatContext();
  activeId=chatId;persist();render();hideDrawer();showView('chat');
 }catch(error){alert(`Não foi possível trocar de conversa: ${error.message||error}`)}
 finally{chatBusy=false}
}
async function deleteSelected(){
 if(chatBusy||!selectedChats.size)return;
 const count=selectedChats.size;
 if(!confirm(`Excluir ${count===1?'esta conversa':`${count} conversas`}? Esta ação não pode ser desfeita. Memórias e conhecimento permanente serão mantidos.`))return;
 chatBusy=true;
 try{
  await stopCurrentGeneration();
  const removing=[...selectedChats],activeRemoved=selectedChats.has(activeId);
  if(activeRemoved)await resetChatContext();
  for(const chatId of removing){
   for(const path of attachments.paths(chatId)){
    const result=android.deleteAttachment(path);
    if(result?.status!=='ok')throw new Error(result?.error||'Falha ao excluir anexo temporário');
   }
   attachments.clear(chatId);
  }
  chats=chats.filter(c=>!selectedChats.has(c.id));selectedChats.clear();selectingChats=false;
  if(!chats.length)fresh();else if(activeRemoved||!chats.some(c=>c.id===activeId))activeId=chats[0].id;
  persist();render();updateSelectionUi();
 }catch(error){alert(`Não foi possível excluir: ${error.message||error}`)}
 finally{chatBusy=false}
}

function remember(text){const m=text.match(/(?:lembre(?:-se)?(?: de)? que|guarde que|quero que (?:você|vc) (?:se )?lembre que)\s+(.+)/i);if(!m)return;const fact=m[1].trim().replace(/[.!?]+$/,'');if(fact.length>2&&!memories.some(x=>x.toLowerCase()===fact.toLowerCase())){memories.push(fact);persist();toast.hidden=false;setTimeout(()=>toast.hidden=true,1800)}}function searchPast(text){const terms=text.toLowerCase().split(/\W+/).filter(x=>x.length>3).slice(0,8);return chats.filter(c=>c.id!==activeId).flatMap(c=>c.messages.map(m=>({c,m,score:terms.reduce((n,t)=>n+((m.content||'').toLowerCase().includes(t)?1:0),0)}))).filter(x=>x.score).sort((a,b)=>b.score-a.score).slice(0,5)}async function enriched(text,newFiles=[]){
 const chat=active(),profile=measured('essentialMemoryMs',essentialContext),history=measured('historyMs',()=>recentMessages(chat));
 const budget=Math.max(0,7200-text.length-profile.length-history.reduce((n,m)=>n+m.content.length,0)-300);
 await restoreChatFiles(chat);
 const matches=attachments.search(activeId,text,5);
 const initial=attachments.list(activeId).filter(f=>newFiles.some(n=>n.path===f.path)).flatMap(f=>f.chunks.slice(0,3).map((c,index)=>({...c,index,name:f.name,path:f.path})));
 const seen=new Set(),attached=[...initial,...matches].filter(c=>{const key=`${c.path}:${c.index}`;if(seen.has(key))return false;seen.add(key);return true}).slice(0,5);
 const local=attached.map(x=>({fonte:'anexo',nome:x.name.slice(0,180),texto:x.content}));
 const learned=measured('learnedMemoryMs',()=>learnedContext(text,{chatId:activeId,hasAttachments:attachments.list(activeId).length>0||newFiles.length>0,structured:true}));
 for(const experience of learned)local.push({fonte:'experiência mantida',dados:experience});
 for(const memory of memories.slice(-40).reverse())local.push({fonte:'memória autorizada',texto:memory});
 const selected=fitReferences(local,budget);
 const result=await measuredAsync('ragPipelineMs',()=>window.__HARUNA_ENRICH_PROMPT__(text,{
  structured:true,recentMessages:history,essentialChars:profile.length,
  localContextChars:selected.length?referenceContent('',selected).length:0,
  hasAttachments:attachments.list(activeId).length>0||newFiles.length>0,newAttachmentFocus:newFiles.length>0
 }));
 const refs=result&&typeof result==='object'&&Array.isArray(result.references)?result.references:[];
 const retrieved=refs.map(x=>({fonte:'Segundo Cérebro',tipo:x.tipo,texto:x.trecho}));
 const prompt=referenceContent(text,fitReferences([...selected,...retrieved],budget));
 return {prompt,profile};
}

function basic(t){return /^(oi|olá|ola)/i.test(t)?'Olá! ✦ Abra Configurações para adicionar um modelo GGUF e ativar minha IA.':'Ainda estou no modo básico. Adicione um modelo GGUF local em Configurações.'}function err(e){return `Falha no LLM\n\n${String(e||'Falha desconhecida').trim()}`}function updateThinkUi(){thinkBtn.classList.toggle('active',thinkMode);thinkBtn.setAttribute('aria-pressed',String(thinkMode));reasoningMode.textContent=thinkMode?'Pensar':'Rápido';reasoningMode.classList.toggle('thinking',thinkMode)}function paint(s){const map={basic:'Modo básico',not_loaded:'Modelo não carregado',loading:'Preparando Haruna…',active:'LLM local ativo',generating:thinkMode?'Haruna está pensando…':'Haruna está respondendo…',error:'Erro no LLM'};brain.textContent=modelStatus(android.isAvailable()?android.getStatus():s);brain.dataset.visualState=s.state;currentModelName=s.modelName||currentModelName||'';modelName.textContent='';modelName.hidden=true;generating=s.state==='generating';stopBtn.hidden=!generating;sendBtn.hidden=generating;thinkBtn.disabled=generating;if(s.state==='error'&&s.error&&s.error!==shownError){shownError=s.error;add('assistant',err(s.error))}if(s.state!=='error')shownError=null}
function showView(name){document.querySelectorAll('.view').forEach(v=>v.hidden=true);const target=$(`#${name}View`);if(target)target.hidden=false;document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===name));if(name==='settings')refreshModels();if(name==='memory'){renderMemories();renderKnowledge()}}document.querySelectorAll('.nav-item').forEach(b=>b.onclick=()=>showView(b.dataset.view));document.querySelectorAll('.knowledge-choice').forEach(b=>b.onclick=()=>{knowledgeType=b.dataset.knowledgeType;document.querySelectorAll('.knowledge-choice').forEach(x=>x.classList.toggle('active',x===b))});window.addEventListener('haruna-open-view',e=>showView(e.detail?.view||'chat'));if(feedAi)feedAi.onclick=()=>knowledgeFile.click();if(knowledgeFile)knowledgeFile.onchange=async()=>{const file=knowledgeFile.files?.[0];knowledgeFile.value='';if(!file)return;if(!file.name.toLowerCase().endsWith('.txt')){alert('Por enquanto, use um arquivo TXT.');return}try{feedAi.disabled=true;kp.hidden=false;kpTitle.textContent='Lendo arquivo…';kpPct.textContent='';kpBar.style.width='8%';kpDetail.textContent=file.name;const text=await file.text();kpTitle.textContent='Indexando…';await knowledge.addText(file.name,text,knowledgeType,p=>{kpPct.textContent=`${p}%`;kpBar.style.width=`${p}%`});kpTitle.textContent='✓ Conhecimento adicionado';kpPct.textContent='100%';kpDetail.textContent=`${file.name} está disponível para a Haruna.`;renderKnowledge();setTimeout(()=>kp.hidden=true,2200)}catch(e){kpTitle.textContent='Falha ao adicionar';kpDetail.textContent=e.message||String(e)}finally{feedAi.disabled=false}};
function showOnboardingStep(step){if(!onboarding)return;onboardingWelcome.hidden=step!=='welcome';onboardingModels.hidden=step!=='models';onboardingProgress.hidden=step!=='progress';onboardingReady.hidden=step!=='ready'}function finishOnboarding(){localStorage.setItem(ONBOARDING_KEY,'done');onboarding.hidden=true;onboardingImporting=false;showView('chat')}function maybeShowOnboarding(){if(!onboarding||localStorage.getItem(ONBOARDING_KEY)==='done')return;let hasModel=false;try{hasModel=!!android.listModels?.()?.models?.length}catch{}if(hasModel){localStorage.setItem(ONBOARDING_KEY,'done');return}onboarding.hidden=false;showOnboardingStep('welcome')}function beginOnboardingImport(){onboardingImporting=true;showOnboardingStep('progress');onboardingProgressTitle.textContent='Selecionando modelo…';onboardingProgressDetail.textContent='Escolha um arquivo GGUF no dispositivo.';onboardingProgressBar.style.width='4%';onboardingProgressPercent.textContent='';try{android.loadModel({action:'pick_local_gguf'})}catch(e){onboardingImporting=false;showOnboardingStep('models');alert(e.message||String(e))}}if(onboardingStart)onboardingStart.onclick=()=>showOnboardingStep('models');if(onboardingSkip)onboardingSkip.onclick=finishOnboarding;if(onboardingBack)onboardingBack.onclick=()=>showOnboardingStep('welcome');if(onboardingImport)onboardingImport.onclick=beginOnboardingImport;if(onboardingFinish)onboardingFinish.onclick=finishOnboarding;document.querySelectorAll('.recommended-model').forEach(b=>b.onclick=()=>{const names={light:'Leve',balanced:'Equilibrado',capable:'Mais capaz'};alert(`${names[b.dataset.tier]}: o catálogo de downloads será conectado na próxima etapa. Você já pode importar um GGUF local.`)});window.addEventListener('haruna-model-import-progress',e=>{if(!onboardingImporting)return;const d=e.detail||{},phase=d.phase||d.state||'',pct=Number(d.percent);showOnboardingStep('progress');if(phase==='copying'||phase==='importing'||phase==='selected'){onboardingProgressTitle.textContent='Importando modelo…';onboardingProgressDetail.textContent=d.name||'Copiando para o armazenamento privado da Haruna.';if(Number.isFinite(pct)){onboardingProgressBar.style.width=`${Math.max(4,Math.min(100,pct))}%`;onboardingProgressPercent.textContent=`${Math.round(pct)}%`}}else if(phase==='preparing'||phase==='loading'){onboardingProgressTitle.textContent='Preparando a Haruna…';onboardingProgressDetail.textContent='Carregando o modelo local para uso.';onboardingProgressBar.style.width='100%';onboardingProgressPercent.textContent=''}else if(phase==='completed'||phase==='ready'){onboardingImporting=false;showOnboardingStep('ready');refreshModels()}else if(phase==='cancelled'){onboardingImporting=false;showOnboardingStep('models')}else if(phase==='error'){onboardingImporting=false;showOnboardingStep('models');alert(d.error||'Não foi possível preparar este modelo.')}});
function showDrawer(){drawer.classList.add('open');scrim.hidden=false;renderList()}function hideDrawer(){drawer.classList.remove('open');scrim.hidden=true;if(selectingChats)setSelectionMode(false)}menu.onclick=showDrawer;closeMenu.onclick=hideDrawer;scrim.onclick=hideDrawer;chatSearch.oninput=()=>renderList();selectChats.onclick=()=>setSelectionMode(!selectingChats);cancelChatSelection.onclick=()=>setSelectionMode(false);selectAllChats.onclick=()=>{const visible=filteredChats();const all=visible.length&&visible.every(c=>selectedChats.has(c.id));for(const c of visible)all?selectedChats.delete(c.id):selectedChats.add(c.id);updateSelectionUi();renderList()};deleteSelectedChats.onclick=deleteSelected;async function newConversation(){
 if(chatBusy)return;
 chatBusy=true;
 try{await stopCurrentGeneration();await resetChatContext();fresh();render();hideDrawer();showView('chat')}
 catch(error){alert(`Não foi possível iniciar uma conversa: ${error.message||error}`)}
 finally{chatBusy=false}
}newChatBtn.onclick=newConversation;drawerNew.onclick=newConversation;thinkBtn.onclick=()=>{if(generating)return;thinkMode=!thinkMode;localStorage.setItem(THINK_KEY,thinkMode?'1':'0');updateThinkUi()};updateThinkUi();$('#attach').addEventListener('click',()=>{attachmentTargetId=activeId});
window.addEventListener('haruna-attachment-ready',e=>{
 const d=e.detail||{},chatId=attachmentTargetId||activeId;attachmentTargetId=null;
 if(d.cancelled)return;
 if(d.error){alert(`Não foi possível anexar: ${d.error}`);return}
 if(!d.path)return;
 if(!chats.some(c=>c.id===chatId)){android.deleteAttachment(d.path);return}
 try{attachments.stage(chatId,d);if(chatId===activeId){renderAttachments();input.focus()}}
 catch(error){alert(`Não foi possível preparar o anexo: ${error.message||error}`)}
});

function resize(){input.style.height='auto';input.style.height=`${Math.min(input.scrollHeight,120)}px`}input.addEventListener('input',resize);input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();form.requestSubmit()}});llm.subscribe(paint);llm.refreshStatus().then(paint).catch(e=>add('assistant',err(e?.message)));stopBtn.onclick=()=>llm.stopGeneration();async function sendMessage(fromVoice=false){
 beginPipeline();
 const voiceObserver=fromVoice?voiceStreamObserver:null;
 const chat=active(),files=attachments.pending(chat.id);
 const text=input.value.trim()||(files.length?'Analise os arquivos anexados.':'');if(!text)return;
 // Reading is local. Attachments enter the model context only after Send is pressed.
 const prepared=[],previousLength=chat.messages.length;
 try{
  if(files.length&&!(await llm.refreshStatus()).modelLoaded){alert('Carregue um modelo GGUF antes de enviar o arquivo.');return}
  for(const file of files){const result=android.readTextAttachment(file.path);if(result?.status!=='ok')throw new Error(`${file.name}: ${result?.error||'Formato ainda não suportado para leitura'}`);prepared.push({file,text:result.text||''})}
  push('user',text,chat,{attachments:files,inputSource:fromVoice?'voice-call':'manual',reviewed:!fromVoice});
 }catch(error){chat.messages.length=previousLength;alert(`Não foi possível enviar: ${error.message||error}`);return}
 for(const item of prepared){attachments.add(chat.id,item.file,item.text);attachments.unstage(chat.id,item.file.path)}
 input.value='';resize();render();
 try{
  if(!fromVoice)remember(text);
  const contact=fromVoice?{}:firstContact.handleUser(text,{chatId:chat.id,lastMessage:chat.messages[previousLength-1],hasAttachments:files.length>0});
  if(!fromVoice)observeExperience(text,{chatId:chat.id,recentMessages:chat.messages.slice(0,previousLength).slice(-8),hasAttachments:files.length>0,legacyMemories:memories});
  const identityReply=directIdentityReply(text,{hasAttachments:files.length>0});
  const localReply=identityReply||contact.reply;
  if(localReply){
   push('assistant',localReply,chat,{essentialIntro:identityReply?'identity':contact.kind||'local'});render();
   return {chatId:chat.id,text:localReply,error:false};
  }
  const status=await llm.refreshStatus();currentModelName=status.modelName||currentModelName;
  if(!status.modelLoaded){push('assistant',basic(text),chat);render();return {chatId:chat.id,error:true,text:'Nenhum modelo GGUF carregado'}}
  const out=add('assistant','✦');
  const draft={role:'assistant',content:'',at:now(),interrupted:true};
  preparationStarted();
  const {prompt,profile}=await enriched(text,files),messages=measured('promptConstructionMs',()=>conversationMessages(chat,prompt,profile,{persistent:status.incrementalConversation===true}));
  contextPrepared();
  chat.messages.push(draft);
  const view=createMessageView({bubble:out,container:messagesEl,onVisual:domUpdated,
   checkpoint:content=>{draft.content=content;chat.updatedAt=now();localStorage.setItem(CHATS_KEY,JSON.stringify(chats))}});
  let generationError=null,followEnd=true;
  try{
   await llm.generate(messages,{conversationId:chat.id,essentialContext:profile,enableThinking:thinkMode,maxTokens:thinkMode?512:256,
    ...(takeInspectorRequest()?{labInspector:true}:{}),streamOnly:true,onToken:delta=>{view.push(delta);try{voiceObserver?.push(delta,thinkMode)}catch{}}});
   delete draft.interrupted;
  }catch(error){generationError=error}
  finally{
   const finished=measured('postprocessingMs',()=>view.finish());draft.content=finished.text;followEnd=finished.follow;
  }
  if(generationError){
   const cancelled=generationError.code==='cancelled'||generationError.message?.includes('interrompida');
   if(!draft.content){draft.content=cancelled?'Geração interrompida.':`Falha local: ${generationError.message}`;draft.error=true}
   if(!cancelled)draft.error=true;
  }else if(!draft.content)draft.content='Não consegui formular uma resposta.';
  chat.updatedAt=now();persist();render({followEnd});
  presentationFinished(draft.content.length,!!draft.content);
  return {chatId:chat.id,text:draft.content,error:!!draft.error,interrupted:!!draft.interrupted};
 }catch(error){
  push('assistant',`Não consegui concluir a mensagem: ${error.message}`,chat,{error:true});render();return {chatId:chat.id,error:true,text:error.message};
 }
}
function submitMessage(fromVoice=false){
 if(chatBusy||activeGeneration||generating||window.harunaImagesBusy)throw new Error('Aguarde a operação atual da Haruna.');
 window.dispatchEvent(new CustomEvent('haruna-chat-submit',{detail:{fromVoice}}));
 activeGeneration=sendMessage(fromVoice).finally(()=>{activeGeneration=null;try{window.dispatchEvent(new CustomEvent('haruna-dbg-chat-finished'))}catch{}});return activeGeneration;
}
form.addEventListener('submit',e=>{
 e.preventDefault();if(chatBusy||activeGeneration||generating)return;
 submitMessage().catch(error=>alert(`Não foi possível salvar a conversa: ${error.message||error}`));
});
// Image jobs share the existing chat store; a completed PNG is never encoded into localStorage.
window.harunaChatImages={
 state:()=>({busy:!!(chatBusy||activeGeneration||generating),draft:input.value,attachments:attachments.pending(activeId).length}),
 begin:(request,prompt)=>{const c=active();push('assistant','Imagem: '+prompt,c,{image:{request,prompt,state:'LOADING'}});render();input.value='';resize()},
 update:job=>{for(const c of chats){const m=c.messages.find(m=>m.image?.request===job.request);if(!m)continue;m.image={...m.image,...job};persist();if(c.id===activeId)render({followEnd:false});return}},
 entries:()=>chats.flatMap(c=>c.messages.filter(m=>m.image).map(m=>m.image)),
 refresh:()=>render({followEnd:false})
};
// Narrow interface: voice turns reuse the exact same persistence, attachments and RAG path.
window.harunaChatVoice={
 state:()=>({chatId:activeId,busy:!!(chatBusy||activeGeneration||generating||window.harunaImagesBusy),draft:input.value,attachments:attachments.pending(activeId).length,modelLoaded:!!android.getStatus()?.modelLoaded}),
 send:async(text,chatId,requestId,observer=null)=>{
  if(chatId!==activeId)throw new Error('A conversa ativa mudou.');
  if(input.value.trim()||attachments.pending(activeId).length)throw new Error('Envie ou limpe o rascunho antes de usar a chamada.');
  if(chatBusy||activeGeneration||generating||window.harunaImagesBusy)throw new Error('Aguarde a operação atual da Haruna.');
  input.value=text;resize();voiceRequestId=requestId;voiceStreamObserver=observer;
  try{return await submitMessage(true)}finally{if(voiceRequestId===requestId){voiceRequestId=null;voiceStreamObserver=null}}
 },
 cancel:async requestId=>{if(voiceRequestId===requestId&&activeGeneration){llm.stopGeneration();await activeGeneration}}
};
if(!chats.length)fresh();else if(!chats.some(c=>c.id===activeId))activeId=chats[0].id;persist();renderKnowledge();render();showView('chat');maybeShowOnboarding();
// Hand off chat events only after all handlers and persisted state are ready.
window.__HARUNA_CHAT_READY__=true;
essentialReady=true;render();
// Observe only the existing overlay's visibility; do not alter its flow or appearance.
if(onboarding){const introObserver=new MutationObserver(()=>{if(onboarding.hidden)render()});introObserver.observe(onboarding,{attributes:true,attributeFilter:['hidden']})}







