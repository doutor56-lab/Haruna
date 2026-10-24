import llm from './llm-engine.js';

const messagesEl=document.querySelector('#messages');
const input=document.querySelector('#input');
const form=document.querySelector('#composer');
const brain=document.querySelector('#brain');
const modelBtn=document.querySelector('#model');
const history=[];
let shownError=null;

function add(role,text){
  const el=document.createElement('div');
  el.className=`msg ${role}`;
  if(role==='assistant'){
    const avatar=document.createElement('div');
    avatar.className='avatar'; avatar.textContent='H'; el.appendChild(avatar);
  }
  const bubble=document.createElement('div');
  bubble.className='bubble'; bubble.textContent=text; el.appendChild(bubble);
  messagesEl.appendChild(el); messagesEl.scrollTop=messagesEl.scrollHeight;
  return bubble;
}

function basic(text){
  const t=text.toLowerCase().trim();
  if(/^(oi|olá|ola|bom dia|boa tarde|boa noite)/.test(t))return 'Olá! ✦ Estou funcionando no modo básico. Toque em Modelo para carregar um GGUF local.';
  if(t.includes('quem é você')||t.includes('quem e voce'))return 'Eu sou a Haruna, sua assistente local e privada.';
  return 'Ainda estou no modo básico. Para respostas generativas, carregue um modelo GGUF local.';
}

function describeError(error){
  const raw=String(error||'Falha desconhecida no mecanismo local.').trim();
  return `⚠️ Falha ao carregar o LLM\n\n${raw}\n\nTente novamente apenas depois de verificar esta mensagem.`;
}

function paint(s){
  const map={basic:'Modo básico',not_loaded:'Modelo não carregado',loading:'Carregando modelo…',active:'LLM local ativo',generating:'Gerando…',error:'Erro no LLM'};
  brain.textContent=map[s.state]||s.state;
  if(s.state==='error'&&s.error&&s.error!==shownError){
    shownError=s.error;
    add('assistant',describeError(s.error));
  }
  if(s.state!=='error') shownError=null;
}

function resizeInput(){input.style.height='auto';input.style.height=`${Math.min(input.scrollHeight,120)}px`;}
input.addEventListener('input',resizeInput);
input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();form.requestSubmit();}});

llm.subscribe(paint);
llm.refreshStatus().then(paint).catch(err=>add('assistant',describeError(err?.message)));
modelBtn.addEventListener('click',async()=>{
  try{
    const r=await llm.loadModel({action:'pick_local_gguf'});
    if(r?.error) add('assistant',describeError(r.error));
  }catch(err){
    add('assistant',describeError(err?.message));
  }
});

form.addEventListener('submit',async e=>{
  e.preventDefault();
  const text=input.value.trim(); if(!text)return;
  input.value=''; resizeInput();
  add('user',text); history.push({role:'user',content:text});
  try{
    const status=await llm.refreshStatus();
    if(!status.modelLoaded){
      if(status.state==='error'&&status.error){add('assistant',describeError(status.error));return;}
      const r=basic(text);add('assistant',r);history.push({role:'assistant',content:r});return;
    }
    const out=add('assistant','');
    try{
      const r=await llm.generate(history,{onToken:(_,all)=>{out.textContent=all;messagesEl.scrollTop=messagesEl.scrollHeight;}});
      out.textContent=r.text; history.push({role:'assistant',content:r.text});
    }catch(err){out.textContent=`Falha local: ${err.message}`;}
  }catch(err){add('assistant',`Não consegui acessar o mecanismo local: ${err.message}`);}
});