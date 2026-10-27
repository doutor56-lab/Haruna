import {readMemory,commit,essentialSummary} from './store.js';
import {inspectUser} from './capture-policy.js';
import {OPENINGS,QUESTIONS,REACTIONS,choose} from './phrases.js';

function done(state){state.introduction.status='done'}
export function openingFor(chat,{chatIds=[],ready=false,hasDraft=false}={}){
 if(!ready||hasDraft||!essentialSummary().available||chat.messages.length)return null;
 const state=readMemory(),intro=state.introduction;
 if(intro.status==='done')return null;
 if(state.essential.preferredName||state.essential.userName){commit(done,{feedback:false});return null}
 const missingPrevious=!chatIds.includes(intro.chatId);
 if(intro.status!=='new'&&!missingPrevious&&intro.chatId!==chat.id)return null;
 const selected=choose(OPENINGS,intro.lastOpening);
 const saved=commit(s=>{s.introduction.status='greeted';s.introduction.chatId=chat.id;s.introduction.lastOpening=selected},{feedback:false});
 return saved.ok?{text:OPENINGS[selected],kind:'opening'}:null;
}
export function handleUser(text,{chatId,lastMessage,hasAttachments=false}={}){
 const before=readMemory(),intro=before.introduction;
 const direct=intro.status==='asked'&&intro.chatId===chatId&&lastMessage?.essentialIntro==='name-question';
 const activeIntro=intro.status!=='done'&&(intro.status==='new'||intro.chatId===chatId);
 const intent=inspectUser(text,{directAnswer:direct});
 let preferred='',reaction=-1;
 const hasUpdates=Object.keys(intent.updates).length>0;
 const ask=activeIntro&&intro.status==='greeted'&&intent.greeting&&!hasUpdates&&!intent.declined&&!hasAttachments;
 const question=ask?choose(QUESTIONS,intro.lastQuestion):-1;
 const shouldFinish=activeIntro&&!ask;
 if(!hasUpdates&&!intent.forget&&!ask&&!shouldFinish)return {reply:null};
 const saved=commit(s=>{
  if(intent.forget){
   if(intent.forget==='names'||intent.forget==='all'){s.essential.userName='';s.essential.preferredName='';s.privacy.namesForgotten=true}
   if(intent.forget==='preferences'||intent.forget==='all'){s.essential.preferredLanguage='';s.essential.responseStyle='';s.privacy.preferencesForgotten=true}
   done(s);
  }else{
   Object.assign(s.essential,intent.updates);
   if(intent.updates.userName||intent.updates.preferredName)s.privacy.namesForgotten=false;
   if(intent.updates.preferredLanguage||intent.updates.responseStyle)s.privacy.preferencesForgotten=false;
   preferred=s.essential.preferredName||s.essential.userName;
   if(ask){s.introduction.status='asked';s.introduction.chatId=chatId;s.introduction.lastQuestion=question}
   else if(shouldFinish||hasUpdates)done(s);
   if((intent.updates.userName||intent.updates.preferredName)&&intent.simple){reaction=choose(REACTIONS,s.introduction.lastReaction);s.introduction.lastReaction=reaction}
  }
 },{feedback:!intent.forget});
 if(!saved.ok){
  if(hasUpdates||intent.forget)return {reply:hasAttachments?null:'Entendi, mas não consegui salvar essa mudança na Memória Essencial deste dispositivo. Você pode tentar novamente pela página Memória.'};
  return {reply:null};
 }
 if(hasAttachments)return {reply:null};
 if(intent.forget)return {reply:'Removi essa informação da Memória Essencial. Isso não apaga o que já foi escrito no histórico ou salvo no Segundo Cérebro.'};
 if((intent.updates.userName||intent.updates.preferredName)&&intent.simple){
  // A legal name does not overwrite a separately chosen preferred name.
  return {reply:REACTIONS[reaction](preferred),kind:'name-reaction'};
 }
 if(hasUpdates&&intent.simple)return {reply:'Combinado. Vou considerar essa preferência nas próximas conversas.'};
 if(activeIntro&&intent.declined)return {reply:'Tudo bem. Você não precisa me dizer seu nome. Podemos conversar do mesmo jeito.'};
 if(activeIntro&&intent.negative)return {reply:'Tudo bem, não vou insistir. Se quiser conversar, estou por aqui.'};
 if(ask)return {reply:(/tudo bem|tudo certo|como vai/.test(text.toLowerCase())?'Tudo bem por aqui. ':'')+QUESTIONS[question],kind:'name-question'};
 if(activeIntro&&intent.identityQuestion)return {reply:'Sou a Haruna, uma assistente local. Conversas e memórias ficam neste dispositivo, e o modelo GGUF instalado é quem gera as respostas. Você pode conversar comigo sem informar seu nome.'};
 return {reply:null};
}
