import {readMemory,essentialSummary} from '../essential/store.js';
import {LANGUAGES,STYLES} from '../essential/schema.js';

// Trusted current profile only. No storage writes and no runtime documentation in the prompt.
export function essentialContext(){
 if(!essentialSummary().available)return '';
 const {essential:e,introduction:i,privacy:p}=readMemory(),data={};
 if(e.userName)data.nome=e.userName;
 if(e.preferredName)data.chamar=e.preferredName;
 if(e.preferredLanguage)data.idioma=LANGUAGES[e.preferredLanguage];
 if(e.responseStyle)data.estilo=STYLES[e.responseStyle];
 if(p.namesForgotten)data.nomes_anteriores='revogados; não usar';
 if(p.preferencesForgotten)data.preferencias_anteriores='revogadas';
 if(i.status==='done'||i.status==='asked')data.apresentacao='encerrada; não perguntar nome novamente';
 return Object.keys(data).length?'Perfil atual do usuário: '+JSON.stringify(data):'';
}

// Actual user/assistant pairs; the existing per-message input cap never rewrites UI history.
export function recentMessages(chat,{budget=3200}={}){
 const pairs=[];let user=null;
 for(const m of chat.messages.slice(0,-1)){
  if(!m||m.error||m.interrupted||typeof m.content!=='string')continue;
  if(m.role==='user')user=m;
  else if(m.role==='assistant'&&user){pairs.push([user,m]);user=null}
 }
 const result=[];let remaining=Math.max(0,Math.min(3200,budget));
 for(let i=pairs.length-1;i>=0&&result.length<8;i--){
  const pair=pairs[i].map(m=>({role:m.role,content:m.content.slice(-1600)})),size=pair[0].content.length+pair[1].content.length;
  if(size>remaining)continue;
  result.unshift(...pair);remaining-=size;
 }
 return result;
}
export function referenceContent(text,references=[]){
 return references.length?`${text}\n\n<dados_de_referencia>\n${JSON.stringify(references)}\n</dados_de_referencia>`:text;
}
export function fitReferences(items,budget){
 const selected=[];
 for(const item of items)if(referenceContent('',[...selected,item]).length<=budget)selected.push(item);
 return selected;
}
export function conversationMessages(chat,prompt,systemContext=''){
 return [...recentMessages(chat,{budget:7200-prompt.length-systemContext.length}),{role:'user',content:prompt}];
}
