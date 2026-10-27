import {fold,validName} from './schema.js';

// Future learned-memory collectors must opt in separately; the LLM has no write API here.
export const learnedMemoryPolicy=Object.freeze({automaticInference:false,source:'explicit-user-only',allowedFields:['userName','preferredName','preferredLanguage','responseStyle']});
const preferred=/^(?:pode me chamar de|poderia me chamar de|me cham[ae] de|prefiro que (?:voc[eê] )?me chame de|prefiro ser chamad[oa] de)\s+(.+)$/iu;
const identity=/^(meu nome [ée]|(?:eu )?me chamo|(?:eu )?sou(?: [oa])?)\s+(.+)$/iu;
const greetingPrefix=/^(?:(?:oi+|olá|ola|opa|bom dia|boa tarde|boa noite|e aí|e ai|tem|sim|kk+|haha|hehe)[\s,!.…-]+){1,4}/iu;
const directBlocked=/^(?:hoje|amanha|ontem|programacao|matematica|portugues|ingles|ajuda|pergunta|resposta|sei|quero|passo a passo|tanto faz|depois|obrigado|obrigada|ninguem|anonimo|feliz|triste)$/;
function candidate(raw){
 const cut=raw.search(/[.!?,;\n]/),end=cut<0?raw.length:cut;
 if(raw[end]==='?')return null;
 let name=raw.slice(0,end).split(/\s+(?:mas|e (?:eu|quero|preciso|prefiro|pode))\s+/iu)[0].trim();
 if((name.startsWith('"')&&name.endsWith('"'))||(name.startsWith('“')&&name.endsWith('”')))name=name.slice(1,-1).trim();
 return validName(name)&&!directBlocked.test(fold(name))?name:null;
}
const hasLanguagePreference=updates=>!!updates.preferredLanguage;
function preferences(part){
 const value=fold(part).replace(/[.!]+$/,'').trim(),updates={};
 if(/[?]|\b(?:hoje|agora|nesta|nessa|desta|dessa|apenas nesta|para esta)\b/.test(value))return updates;
 const lang=value.match(/^(?:meu idioma (?:principal|preferido) e|prefiro (?:conversar|falar) em|prefiro que voce (?:fale|converse|responda)(?: comigo)? em) (.+)$/);
 const languages={'portugues':'pt','portugues brasileiro':'pt-BR','portugues do brasil':'pt-BR','portugues de portugal':'pt-PT','ingles':'en','espanhol':'es','frances':'fr','alemao':'de','italiano':'it','japones':'ja'};
 if(lang&&Object.hasOwn(languages,lang[1]))updates.preferredLanguage=languages[lang[1]];
 if(/^(?:eu )?prefiro (?:respostas|explicacoes|quando voce|que voce)\b/.test(value)||/^pode (?:falar|conversar) comigo de forma\b/.test(value)){
  const matches=[['step-by-step',/passo a passo|por etapas/],['concise',/curtas|concisas|diretas|objetivas/],['detailed',/detalhadas|detalhadamente|com detalhes/],['casual',/descontraid[oa]|informal/],['formal',/\bformal\b/]].filter(([,pattern])=>pattern.test(value));
  if(matches.length===1)updates.responseStyle=matches[0][0];
 }
 return updates;
}
export function inspectUser(text,{directAnswer=false}={}){
 const result={updates:{},forget:null,declined:false,greeting:false,negative:false,identityQuestion:false,simple:false};
 if(typeof text!=='string'||!text.trim()||text.length>600||/[\n`{}]|^[>"“'#]/.test(text.trim()))return result;
 if(/\b(?:exemplo|hipotetico|personagem|finja|simule|citacao|na historia|no jogo)\b/.test(fold(text)))return result;
 const plain=text.trim(),base=plain.replace(greetingPrefix,''),value=fold(plain).replace(/[.!…]+$/,'').trim();
 if(/^(?:esqueca|apague|remova) (?:o )?meu nome$/.test(value))result.forget='names';
 if(/^(?:esqueca|apague|remova) (?:as )?minhas preferencias$/.test(value))result.forget='preferences';
 if(/^(?:esqueca|apague|remova|limpe) (?:a |minha |a minha )?memoria essencial$/.test(value))result.forget='all';
 result.declined=/^(?:prefiro nao (?:dizer|informar|contar)(?: meu nome)?|nao quero (?:dizer|informar|falar (?:o )?meu nome)|nao vou (?:dizer|informar)|deixa pra depois|deixa para depois|pode pular|pular|nao insista|meu nome nao importa|pode me chamar de anonimo)$/.test(value);
 result.negative=/^nao(?:[ ,]+(?:kk+|haha|hehe))?$/.test(value);
 result.greeting=/^(?:oi+|ola|opa|bom dia|boa tarde|boa noite)(?:[, ]+(?:tudo bem|tudo certo|como vai))?[?!]*$/.test(value)||/^(?:oi+|ola|opa|sim|tem|tem sim|estou aqui|to aqui|estou sim|claro|pode|pode sim|e ai)(?:[ ,.!…]+(?:kk+|haha|hehe|sim))*[?!]*$/.test(value);
 result.identityQuestion=/^(?:quem (?:e|eh) voce|quem e a haruna|o que voce (?:faz|e)|o que e a haruna)[?!.]*$/.test(value);
 if(result.forget||result.declined)return result;
 const pref=base.match(preferred),own=base.match(identity);
 if(pref){const name=candidate(pref[1]);if(name)result.updates.preferredName=name}
 if(own){
  const name=candidate(own[2]);
  const genericIdentity=/sou/i.test(own[1]);
  if(name&&(!genericIdentity||/^\p{Lu}/u.test(name)))result.updates.userName=name;
  if(result.updates.userName){
   const later=base.match(/(?:[,;.]\s*|\s+mas\s+)(?:pode me chamar de|me cham[ae] de|prefiro que (?:voc[eê] )?me chame de)\s+(.+)$/iu);
   if(later){const nick=candidate(later[1]);if(nick)result.updates.preferredName=nick}
  }
 }
 if(directAnswer&&!Object.keys(result.updates).length&&!result.declined&&!result.negative&&!result.greeting){
  const bare=plain.replace(/[.!]+$/,'').trim();
  if(validName(bare)&&!directBlocked.test(fold(bare))&&!/[?]/.test(plain))result.updates.preferredName=bare;
 }
 Object.assign(result.updates,preferences(base));
 if(result.updates.userName)for(const part of base.split(/[.;]/).slice(1))Object.assign(result.updates,preferences(part.trim()));
 // Local reactions only consume short declarations; questions and additional tasks still reach the LLM.
 if(!plain.includes('?')&&Object.keys(result.updates).length){
  const names=[result.updates.userName,result.updates.preferredName].filter(Boolean);
  let remaining=base;
  if(pref&&names.length)remaining=pref[1].replace(names[0],'');
  else if(own&&names.length)remaining=own[2].replace(names[0],'');
  else if(directAnswer&&names.length)remaining=plain.replace(names[0],'');
  else if(!names.length){
   const normalized=fold(base).replace(/[.!]+$/,'').trim();
   const styleOnly=/^(?:(?:eu )?prefiro (?:respostas (?:mais )?(?:curtas|concisas|diretas|objetivas|detalhadas)|explicacoes (?:mais )?(?:detalhadas|passo a passo)|quando (?:voce )?explica (?:passo a passo|por etapas|com detalhes))|pode (?:falar|conversar) comigo de forma (?:mais )?(?:descontraida|descontraido|informal|formal))$/.test(normalized);
   remaining=hasLanguagePreference(result.updates)||styleOnly?'':base;
  }
  result.simple=!remaining.replace(/[.!,'“”";\s]/g,'');
 }
 return result;
}
