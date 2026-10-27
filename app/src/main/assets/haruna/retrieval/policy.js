const stop=new Set(('a o e de da do das dos em no na nos nas um uma uns umas para por com que se ao aos as os meu minha meus minhas seu sua seus suas voce voces vc isso isto esse essa estes estas aquele aquela qual quais como quando onde porque quanto quantos quero preciso gostaria poderia pode podes fazer faca fale diga explique explicar mostrar mostre ajudar ajude saber sobre usar uso funciona funcionar arquivo arquivos documento documentos texto textos txt contexto referencia referencias segundo cerebro memoria').split(' '));
const languages=new Set('python javascript typescript java csharp cplusplus golang rust kotlin swift sql html css bash php ruby dart linguagem linguagens programacao'.split(' '));
export const normalize=text=>String(text||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
export const terms=text=>[...new Set(normalize(text).match(/[a-z0-9]{3,}/g)||[])].filter(w=>!stop.has(w)).slice(0,40);
export function routeMessage(text,context={},catalogProvider=()=>({knowledge:0,behavior:0,titleTerms:new Set()})){
 const q=normalize(text.replace(/```[\s\S]*?(?:```|$)/g,' ')).trim(),trimmed=q.replace(/[.!?…]+$/,'').trim();
 const skip=reason=>({consult:false,reason,mode:null});
 if(!q||!trimmed)return skip('empty');
 const noSearch=/\b(?:nao (?:consulte|pesquise|busque)|sem (?:consultar|pesquisar|buscar|usar) (?:o |a |os |as |meus |minhas )?(?:segundo cerebro|memoria|documentos|arquivos))\b/.test(q);
 if(noSearch)return skip('user_opt_out');
 const brain=/\b(?:segundo cerebro|conhecimento (?:salvo|permanente)|memoria (?:salva|permanente))\b/.test(q);
 const doc=/\b(?:arquivo|documento|apostila|manual|contrato|txt|fonte|base de conhecimento)\b/.test(q)&&/\b(?:consulte|pesquise|busque|conforme|segundo|baseado|no|na|nesse|neste|desse|deste|resuma|resumir|o que diz|qual|compare|procure|encontre)\b/.test(q);
 const explicit=brain||doc;
 const attachment=!!context.hasAttachments&&/\b(?:anexo|anexado|arquivo enviado|arquivo que enviei|esse arquivo|este arquivo|desse arquivo|neste arquivo)\b/.test(q);
 if(attachment&&!brain)return skip('attachment_priority');
 if(!explicit){
  if(/\b(?:meu nome|me chamar|me chama|me chamo|me chame|meu apelido|meu idioma|minha preferencia|minhas preferencias|meu estilo|como (?:eu )?(?:prefiro|gosto))\b/.test(q))return skip('essential_priority');
  if(/^(?:oi+|ola|opa|bom dia|boa tarde|boa noite|e ai|obrigad[oa]|valeu|ok|okay|certo|entendi|beleza|sim|nao|tchau|ate mais|boa|legal)(?:[ ,]+(?:tudo bem|tudo certo|como vai|obrigad[oa]|kk+|haha|sim|entendi))*$/.test(trimmed))return skip('social');
  if(/^(?:e voce|e vc|e com voce|e contigo|qual (?:e )?(?:seu|o seu) nome|tudo certo|tudo bom|quem e voce|posso te perguntar algo|voce consegue me ajudar|voce pode conversar comigo|voce (?:ta|esta) ai|tem alguem ai|alguem ai|voce me ouve|me escuta|voce sabe programar|tudo bem|como (?:voce|vc) (?:esta|ta|vai)|quem (?:e|eh) voce|quem e a haruna|o que voce faz|conte (?:uma )?piada|estou (?:bem|triste|feliz|cansad[oa])|to (?:bem|triste|feliz|cansad[oa]))$/.test(trimmed))return skip('social');
  if((/[+*/^%=-]/.test(trimmed)||/^(?:quanto e|calcule|calcula)/.test(trimmed))&&/^(?:(?:quanto e|calcule|calcula)\s*)?[\d\s.,+*/()^%=\-]+$/.test(trimmed)&&/\d/.test(trimmed))return skip('simple_math');
  const recent=Array.isArray(context.recentMessages)&&context.recentMessages.some(m=>m?.role==='assistant'&&!m.error&&typeof m.content==='string'&&m.content.trim().length>0);
  if(recent&&/^(?:(?:e|mas|entao)[ ,]+)?(?:por que|porque|como assim|e isso|continue|continua|prossiga|explique melhor|explique isso|resuma (?:isso|sua resposta|a resposta)|repita|pode detalhar|de mais detalhes|como (?:faco|aplico|uso|mudo) isso|adapte (?:isso|esse codigo|esta funcao)|reescreva (?:isso|sua resposta)|na sua resposta|sobre (?:isso|o que voce disse)|o que voce (?:disse|falou))\b/.test(q))return skip('recent_priority');
  if(text.includes('```')||text.length>2400)return skip('provided_context');
 }
 const catalog=catalogProvider();
 if(!catalog.knowledge&&!catalog.behavior)return skip('no_documents');
 const communication=/\b(?:como (?:devo |posso )?responder|escreva (?:uma )?resposta|ajude.*responder|exemplos? de conversa|conversacao|comportamento|tom de (?:voz|resposta))\b/.test(q);
 let mode=communication?'behavior':'knowledge';
 if(explicit&&/\b(?:todas|todos|ambos)\b/.test(q))mode='both';
 if(explicit){
  if(mode==='knowledge'&&!catalog.knowledge)mode='behavior';
  if(mode==='behavior'&&!catalog.behavior)mode='knowledge';
  return {consult:true,explicit:true,reason:'explicit_documents',mode};
 }
 if(communication&&catalog.behavior)return {consult:true,explicit:false,reason:'communication',mode:'behavior'};
 if(!catalog.knowledge)return skip('no_knowledge');
 const words=terms(q),titleMatch=words.some(w=>catalog.titleTerms.has(w));
 const factual=/^(?:qual|quais|como|o que|oque|por que|porque|quando|onde|explique|defina|descreva|compare|me explique|me fale sobre|fale sobre|calcule|implemente|crie (?:uma )?funcao|escreva (?:um )?codigo|procure|encontre|what|how|why|when|where|which|explain|define|describe|cual|cuando|donde|explica)\b/.test(q)||q.includes('?');
 if(titleMatch||factual)return {consult:true,explicit:false,reason:titleMatch?'catalog_match':'factual_question',mode:'knowledge'};
 return skip('no_signal');
}
export function relevant(chunk,query,{explicit=false}={}){
 const words=terms(query),content=normalize(chunk.content||''),name=normalize(chunk.name||'');
 if(!words.length)return false;
 const topical=words.filter(w=>!languages.has(w)),wanted=topical.length?topical:words;
 const matches=wanted.filter(w=>new RegExp(`\\b${w}\\b`).test(content));
 if(!matches.length)return explicit&&wanted.some(w=>new RegExp(`\\b${w}\\b`).test(name));
 if(explicit||wanted.length<=2||matches.length>=2)return true;
 // A specific long term can be enough; language labels alone are not enough for a longer question.
 return matches.some(w=>w.length>=6&&!['projeto','exemplo','exemplos','resposta','respostas','dados','informacao','informacoes'].includes(w));
}
