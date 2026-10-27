import {inspectUser} from '../essential/capture-policy.js';
import {fold,clip} from './schema.js';
import {sensitive} from './privacy.js';

/** Cheap intent gates only. No inference, RAG search or assistant-output harvesting. */
export function candidate(text,{chatId,recentMessages=[],fromVoice=false,hasAttachments=false,legacyMemories=[]}={}){
 if(fromVoice||hasAttachments||typeof text!=='string'||text.length<4||text.length>1000)return null;
 const value=fold(text);
 if(/^[>"“'#`]|\n|```/.test(text)||/[?]/.test(text)||/\b(?:exemplo|hipotetico|finja|simule|personagem|na historia)\b/.test(value))return null;
 // Essential fields and legacy explicit memories keep their existing owner; no duplicate copy.
 const essential=inspectUser(text);if(essential.forget||essential.declined||Object.keys(essential.updates).length)return null;
 if(sensitive(text)||(!/\bsempre\b/.test(value)&&/\b(?:hoje|agora|neste momento|estou com sono|estou almocando|esperando o onibus)\b/.test(value)))return null;
 let type=null,topicKey='';
 if(/^(?:nao[, ]+|voce errou|o correto e|corrigindo\b)/.test(value))type='correction';
 else if(/^(?:eu )?prefiro\b/.test(value))type='preference';
 else if(/^(?:quando .{3,100},? (?:use|faca)|da proxima vez|nao quero que voce|quando eu .{3,100},? nao)/.test(value))type='behavior';
 else if(/^(?:decidi que|decidimos que|para (?:este|esse|o) projeto.{0,80},? (?:vamos usar|usaremos|vamos seguir))/.test(value))type='decision';
 else if(/^(?:meu projeto|o projeto) .{2,60} (?:usa|utiliza|tem como objetivo|vai usar|e baseado)/.test(value))type='project_context';
 else if(/^(?:guarde|guarda|lembre|lembra)(?: isso| disso| para depois| que|:)/.test(value))type='fact';
 if(!type)return null;
 if(type==='fact'&&legacyMemories.some(m=>fold(text).includes(fold(m))))return null;
 const recent=recentMessages.filter(m=>!m.error&&typeof m.content==='string').slice(-8);
 const previousAssistant=[...recent].reverse().find(m=>m.role==='assistant'&&!m.essentialIntro);
 const previousUser=[...recent].reverse().find(m=>m.role==='user');
 const needsContext=type==='correction'||/\b(?:assim|desse jeito|isso|disso)\b/.test(value);
 if(needsContext&&(!previousAssistant||!previousUser))return null;
 const project=value.match(/\bprojeto ([a-z0-9_-]{3,40})(?:\b|$)/)?.[1];
 const scope=project?{kind:'project',label:project}:{kind:'chat',chatId};
 const rule=value.match(/^(quando .{3,100}?)[, ]+(?:use sempre|faca sempre|nao)/);
 if(rule)topicKey=rule[1];
 if(project&&/\barquitetura\b/.test(value))topicKey=`arquitetura:${project}`;
 return {type,summary:clip(text,800),source:'user_explicit',originChatId:chatId,scope,topicKey,
  confidence:type==='correction'?'medium':'high',importance:['behavior','correction','decision'].includes(type)?'high':'medium',
  context:needsContext?{input:clip(previousUser.content,600),badOutput:clip(previousAssistant.content,600)}:{input:'',badOutput:''},
  example:{input:'',output:''},provenance:{input:'manual',reviewed:true}};
}
