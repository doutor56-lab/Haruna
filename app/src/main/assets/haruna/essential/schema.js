export const KEY='haruna_essential_memory_v1';
export const FIELDS=['userName','preferredName','preferredLanguage','responseStyle'];
export const LANGUAGES=Object.freeze({'pt':'Português','pt-BR':'Português brasileiro','pt-PT':'Português de Portugal',en:'Inglês',es:'Espanhol',fr:'Francês',de:'Alemão',it:'Italiano',ja:'Japonês'});
export const STYLES=Object.freeze({concise:'Respostas curtas e diretas',detailed:'Explicações detalhadas','step-by-step':'Explicações passo a passo',casual:'Tom descontraído',formal:'Tom formal'});
export const fold=text=>String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const notName=new Set(('sim não nao oi ola opa tem voce eu ele ela meu minha nome pode prefiro chamar chama dizer falar contar saber quero preciso tenho sou somos professor professora doutor doutora engenheiro engenheira programador programadora estudante trabalho tarefa teste exemplo hipotetico personagem senha token chave segredo diabetes cancer depressao ansioso anonimato anonimo ninguem alguem ninguém alguém recuso obrigado obrigada legal beleza claro certo tudo bem como quando porque para aqui agora existe funciona fazer com sem mas entao então kk kkk haha hehe').split(' '));
const particles=new Set(['da','das','de','do','dos','e','di','du','van','von']);
export function validStoredName(value){return typeof value==='string'&&value.trim().length>0&&value.trim().length<=60&&value.trim().split(/\s+/).length<=6&&/\p{L}/u.test(value)&&/^[\p{L}\p{M}\p{N}'’_. -]+$/u.test(value)}
export function validName(value){
 if(typeof value!=='string')return false;
 const text=value.trim().replace(/\s+/g,' '),parts=text.split(' ');
 if(!text||text.length>60||parts.length>5||!/^\p{L}[\p{L}\p{M}'’\- ]*$/u.test(text))return false;
 if(parts.some(p=>notName.has(fold(p))))return false;
 if(parts.length>1&&parts.some((p,i)=>i>0&&!particles.has(fold(p))&&/^\p{Ll}/u.test(p)))return false;
 return !particles.has(fold(parts[0]));
}
export function emptyState(){return {version:1,essential:{userName:'',preferredName:'',preferredLanguage:'',responseStyle:'',updatedAt:null},introduction:{status:'new',chatId:'',lastOpening:-1,lastQuestion:-1,lastReaction:-1},privacy:{namesForgotten:false,preferencesForgotten:false}}}
export function normalize(value){
 if(!value||value.version!==1||typeof value.essential!=='object'||value.essential===null)throw new Error('Formato de Memória Essencial incompatível.');
 const result=emptyState(),e=value.essential,i=value.introduction||{};
 for(const key of ['userName','preferredName'])if(validStoredName(e[key]))result.essential[key]=e[key].trim().replace(/\s+/g,' ');
 if(Object.hasOwn(LANGUAGES,e.preferredLanguage))result.essential.preferredLanguage=e.preferredLanguage;
 if(Object.hasOwn(STYLES,e.responseStyle))result.essential.responseStyle=e.responseStyle;
 if(typeof e.updatedAt==='string'&&e.updatedAt.length<=40&&Number.isFinite(Date.parse(e.updatedAt)))result.essential.updatedAt=e.updatedAt;
 if(['new','greeted','asked','done'].includes(i.status))result.introduction.status=i.status;
 if(typeof i.chatId==='string')result.introduction.chatId=i.chatId.slice(0,180);
 for(const key of ['lastOpening','lastQuestion','lastReaction'])if(Number.isInteger(i[key])&&i[key]>=-1&&i[key]<30)result.introduction[key]=i[key];
 result.privacy.namesForgotten=value.privacy?.namesForgotten===true;
 result.privacy.preferencesForgotten=value.privacy?.preferencesForgotten===true;
 return result;
}
