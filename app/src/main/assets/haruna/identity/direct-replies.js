import android from '../android-bridge.js';
import {readMemory} from '../essential/store.js';
import {fold} from '../essential/schema.js';

// These are short conversation replies, not output filters or instructions stored as memories.
const pt={self:n=>`Sou a ${n}, sua assistente local.`,model:(f,n)=>`O arquivo GGUF carregado é “${f}”. Esse é o modelo-base; a assistente continua sendo a ${n}.`,unknown:'Não consigo verificar qual modelo base está carregado agora.',origin:(n,d)=>`Sou a ${n}, assistente de inteligência artificial desenvolvida pela ${d}. Minha capacidade de linguagem é fornecida pelo modelo atualmente selecionado, desenvolvido por seu respectivo fornecedor.`,userError:'Sem problema. Vamos revisar e corrigir a conta ou o raciocínio.'};
const texts={
 'pt':pt,'pt-BR':pt,'pt-PT':{...pt,model:(f,n)=>`O ficheiro GGUF carregado é “${f}”. Esse é o modelo-base; a assistente continua a ser a ${n}.`},
 en:{self:n=>`I'm ${n}, your local assistant.`,model:(f,n)=>`The loaded GGUF file is “${f}”. That identifies the base model; the assistant is still ${n}.`,unknown:"I can't verify which base model is loaded right now.",origin:(n,d)=>`I'm ${n}, an AI assistant developed by ${d}. My language capabilities come from the selected model, developed by its respective provider.`,userError:"No problem. Let's review and correct the calculation or reasoning."},
 es:{self:n=>`Soy ${n}, tu asistente local.`,model:(f,n)=>`El archivo GGUF cargado es “${f}”. Ese es el modelo base; la asistente sigue siendo ${n}.`,unknown:'No puedo verificar qué modelo base está cargado ahora.',origin:(n,d)=>`Soy ${n}, asistente de inteligencia artificial desarrollada por ${d}. Mis capacidades de lenguaje proceden del modelo seleccionado, desarrollado por su respectivo proveedor.`,userError:'No pasa nada. Revisemos y corrijamos el cálculo o el razonamiento.'},
 fr:{self:n=>`Je suis ${n}, votre assistante locale.`,model:(f,n)=>`Le fichier GGUF chargé est « ${f} ». Il identifie le modèle de base ; l’assistante reste ${n}.`,unknown:'Je ne peux pas vérifier quel modèle de base est chargé actuellement.',origin:(n,d)=>`Je suis ${n}, une assistante d’intelligence artificielle développée par ${d}. Mes capacités linguistiques proviennent du modèle sélectionné, développé par son fournisseur respectif.`,userError:'Pas de problème. Revoyons et corrigeons le calcul ou le raisonnement.'},
 de:{self:n=>`Ich bin ${n}, deine lokale Assistentin.`,model:(f,n)=>`Die geladene GGUF-Datei heißt „${f}“. Sie bezeichnet das Basismodell; die Assistentin bleibt ${n}.`,unknown:'Ich kann gerade nicht überprüfen, welches Basismodell geladen ist.',origin:(n,d)=>`Ich bin ${n}, eine von ${d} entwickelte KI-Assistentin. Meine Sprachfähigkeiten stammen vom ausgewählten Modell und dessen jeweiligem Anbieter.`,userError:'Kein Problem. Prüfen und korrigieren wir die Rechnung oder die Überlegung.'},
 it:{self:n=>`Sono ${n}, la tua assistente locale.`,model:(f,n)=>`Il file GGUF caricato è “${f}”. Identifica il modello di base; l’assistente resta ${n}.`,unknown:'Non posso verificare quale modello di base sia caricato ora.',origin:(n,d)=>`Sono ${n}, assistente di intelligenza artificiale sviluppata da ${d}. Le mie capacità linguistiche provengono dal modello selezionato e dal suo rispettivo fornitore.`,userError:'Nessun problema. Rivediamo e correggiamo il calcolo o il ragionamento.'},
 ja:{self:n=>`私はローカルアシスタントの${n}です。`,model:(f,n)=>`読み込まれているGGUFファイルは「${f}」です。これは基盤モデルの識別情報で、アシスタントの名前は${n}のままです。`,unknown:'現在読み込まれている基盤モデルを確認できません。',origin:(n,d)=>`私は${d}が開発したAIアシスタントの${n}です。言語能力は、各提供元が開発した選択中のモデルによって提供されます。`,userError:'大丈夫です。計算や考え方を一緒に見直して修正しましょう。'}
};
const languageNames={portugues:'pt-BR','portugues brasileiro':'pt-BR','portugues de portugal':'pt-PT',ingles:'en',english:'en',portuguese:'pt-BR',espanhol:'es',spanish:'es',frances:'fr',french:'fr',alemao:'de',german:'de',italiano:'it',italian:'it',japones:'ja',japanese:'ja'};
const groups={
 'pt-BR':{self:['quem e voce','quem e vc','quem e a haruna','qual e seu nome','qual seu nome','como voce se chama','pode me dizer quem voce e'],model:['qual modelo voce usa','qual e seu modelo base','qual seu modelo base','que modelo voce usa','qual modelo esta carregado','qual gguf esta carregado'],origin:['quem te criou','quem criou voce','quem criou a haruna','quem desenvolveu voce','quem desenvolveu a haruna','quem e seu desenvolvedor','quem e o seu desenvolvedor','qual empresa te criou']},
 en:{self:['who are you','what is your name','who is haruna'],model:['what model do you use','what is your base model','which model is loaded'],origin:['who created you','who developed you']},
 es:{self:['quien eres','como te llamas'],model:['que modelo usas','cual es tu modelo base'],origin:['quien te creo']},
 fr:{self:['qui es-tu','qui es tu','qui etes-vous'],model:['quel modele utilises-tu','quel est ton modele de base'],origin:[]},
 de:{self:['wer bist du','wie heisst du','wie heißt du'],model:['welches modell verwendest du'],origin:[]},
 it:{self:['chi sei','come ti chiami'],model:['quale modello usi'],origin:[]},
 ja:{self:['あなたは誰ですか'],model:['どのモデルを使っていますか'],origin:[]}
};
function parse(text){
 let value=fold(text).replace(/[.!?？。]+$/,'').trim(),override=null;
 const requested=value.match(/^(?:(?:responda|fale|diga) em|em|answer in|reply in) ([\p{L} -]+)\s*[:,]\s*(.+)$/u);
 if(requested&&Object.hasOwn(languageNames,requested[1])){override=languageNames[requested[1]];value=requested[2].trim()}
 for(const [language,intents]of Object.entries(groups))for(const [kind,questions]of Object.entries(intents))if(questions.includes(value))return {kind,language,override};
 if(/^(?:voce (?:e|eh|se chama)|are you|eres|bist du|sei) (?:o |a )?(?:haruna|qwen|chatgpt|claude|gemini|copilot|llama)$/.test(value))return {kind:'self',language:value.startsWith('are you')?'en':value.startsWith('eres')?'es':value.startsWith('bist du')?'de':value.startsWith('sei ')?'it':'pt-BR',override};
 if(/^voce foi (?:criada|criado|desenvolvida|desenvolvido) pel[ao] (?:anthropic|openai|google|microsoft)$/.test(value))return {kind:'origin',language:'pt-BR',override};
 if(/^(?:(?:desculpa|desculpe|foi mal|perdao)[, ]+)?eu (?:errei|fiz a conta errada|me confundi|usei o valor errado)$/.test(value))return {kind:'userError',language:'pt-BR',override};
 if(/^(?:sorry[, ]+)?i (?:was wrong|made a mistake|got it wrong)$/.test(value))return {kind:'userError',language:'en',override};
 return null;
}
function identityDetails(){try{return JSON.parse(window.HarunaAndroid?.getIdentityDetails?.()||'null')}catch{return null}}
function assistantName(){try{const value=window.HarunaAndroid?.getAssistantIdentity?.();return typeof value==='string'&&value.trim().length>0&&value.length<=60?value.trim():null}catch{return null}}
export function directIdentityReply(text,{hasAttachments=false}={}){
 if(hasAttachments||typeof text!=='string'||text.length>220||text.includes('\n'))return null;
 const intent=parse(text);if(!intent)return null;
 const preferred=readMemory().essential.preferredLanguage;
 const locale=intent.override||preferred||intent.language,reply=texts[locale]||pt;
 if(intent.kind==='userError')return reply.userError;
 const name=assistantName();if(!name)return null;
 const details=identityDetails(),developer=details?.developer;
 if(intent.kind==='self'||intent.kind==='origin'){if(typeof developer==='string'&&developer.trim())return locale.startsWith('pt')&&typeof details.referenceReply==='string'?details.referenceReply.replaceAll('{name}',name).replaceAll('{developer}',developer):reply.origin(name,developer);return intent.kind==='self'?reply.self(name):null;}
 if(intent.kind==='model'){
  try{
   const status=android.getStatus();
   if(!status?.modelLoaded||typeof status.modelName!=='string'||!status.modelName.trim())return reply.unknown;
   const file=status.modelName.split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,180);
   if(!file)return reply.unknown;
   const m=status.modelMetadata||{};const fields=['name','author','organization','license','url'].filter(k=>typeof m[k]==='string'&&m[k].trim()).map(k=>`${k}: ${m[k].replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,512)}`);
   return reply.model(file,name)+(fields.length?'\nGGUF metadata (declared / declarado): '+fields.join(' · '):'');
  }catch{return reply.unknown}
 }
 return null;
}
