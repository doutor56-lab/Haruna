import {KEY,FIELDS,LANGUAGES,STYLES,validStoredName,emptyState,normalize} from './schema.js';

let state=emptyState(),available=true;
function load(){try{const text=localStorage.getItem(KEY);state=text?normalize(JSON.parse(text)):emptyState();available=true}catch{state=emptyState();available=false}}
load();
const clone=value=>JSON.parse(JSON.stringify(value));
function notify(saved=false){try{window.dispatchEvent(new CustomEvent('haruna-essential-memory-changed'));if(saved)window.dispatchEvent(new CustomEvent('haruna-essential-memory-saved'))}catch{}}
export const readMemory=()=>clone(state);
export function essentialSummary(){return {available,active:available,fields:FIELDS.filter(k=>!!state.essential[k]).length}}
export function commit(change,{feedback=true}={}){
 if(!available)return {ok:false,changed:false,error:'Não foi possível acessar a Memória Essencial local.'};
 try{
  const next=clone(state);change(next);
  for(const key of ['userName','preferredName'])if(next.essential[key]&&!validStoredName(next.essential[key]))throw new Error('Nome inválido.');
  if(next.essential.preferredLanguage&&!Object.hasOwn(LANGUAGES,next.essential.preferredLanguage))throw new Error('Idioma inválido.');
  if(next.essential.responseStyle&&!Object.hasOwn(STYLES,next.essential.responseStyle))throw new Error('Estilo inválido.');
  const safe=normalize(next);
  const changed=FIELDS.some(k=>state.essential[k]!==safe.essential[k]);
  if(changed)safe.essential.updatedAt=new Date().toISOString();
  if(JSON.stringify(safe)===JSON.stringify(state))return {ok:true,changed:false};
  const encoded=JSON.stringify(safe);localStorage.setItem(KEY,encoded);
  if(localStorage.getItem(KEY)!==encoded)throw new Error('Persistência não confirmada.');
  state=safe;notify(changed&&feedback);return {ok:true,changed};
 }catch{return {ok:false,changed:false,error:'Não consegui salvar a Memória Essencial neste dispositivo.'}}
}
export function clearEssential(){
 // Explicit user action only. Other localStorage keys, conversations and knowledge are untouched.
 try{
  const next=available?readMemory():emptyState();next.essential=emptyState().essential;
  next.essential.updatedAt=new Date().toISOString();next.introduction.status='done';
  next.privacy={namesForgotten:true,preferencesForgotten:true};
  const encoded=JSON.stringify(next);localStorage.setItem(KEY,encoded);
  if(localStorage.getItem(KEY)!==encoded)throw new Error();
  state=normalize(next);available=true;notify(false);return {ok:true};
 }catch{return {ok:false,error:'Não foi possível apagar a Memória Essencial.'}}
}
export function withEssentialContext(prompt){
 if(!available)return prompt;
 const {essential:e,introduction:i,privacy:p}=state,lines=[];
 if(e.userName)lines.push(`Nome informado: ${JSON.stringify(e.userName)}.`);
 if(e.preferredName)lines.push(`Nome preferido: ${JSON.stringify(e.preferredName)}.`);
 if(e.preferredLanguage)lines.push(`Idioma explicitamente preferido: ${LANGUAGES[e.preferredLanguage]}.`);
 if(e.responseStyle)lines.push(`Estilo global explicitamente preferido: ${STYLES[e.responseStyle]}.`);
 if(p.namesForgotten)lines.push('O usuário revogou nomes anteriores: não use nomes antigos do histórico nem peça o nome novamente.');
 if(p.preferencesForgotten)lines.push('Preferências anteriores foram revogadas; siga o pedido atual sem presumir estilos ou idiomas antigos.');
 if(i.status==='done'||i.status==='asked')lines.push('Não retome uma entrevista de apresentação nem pergunte novamente como chamar o usuário.');
 if(!lines.length)return prompt;
 const prefix='MEMÓRIA ESSENCIAL — personalização atual confirmada; substitui preferências antigas, sem substituir o pedido atual:\n'+lines.join('\n');
 return `${prefix.slice(0,900)}\n\n${prompt}`;
}
window.addEventListener('storage',event=>{if(event.key===KEY){load();notify(false)}});
