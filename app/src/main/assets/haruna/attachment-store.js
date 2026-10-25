const sessions=new Map();
const PENDING_KEY='haruna_pending_attachments_v1';
const pendingMap=()=>{try{return JSON.parse(localStorage.getItem(PENDING_KEY)||'{}')}catch{return{}}};
function pending(chatId){return pendingMap()[chatId]||[]}
function stage(chatId,file){const all=pendingMap();all[chatId]=[...pending(chatId),{name:file.name,path:file.path,bytes:file.bytes||0}];localStorage.setItem(PENDING_KEY,JSON.stringify(all));trackPath(chatId,file.path)}
function unstage(chatId,path){const all=pendingMap();all[chatId]=pending(chatId).filter(f=>f.path!==path);if(!all[chatId].length)delete all[chatId];localStorage.setItem(PENDING_KEY,JSON.stringify(all))}
function forgetPath(chatId,path){savePaths(chatId,paths(chatId).filter(p=>p!==path))}
const PATHS_KEY='haruna_chat_attachment_paths_v1';
const savedPaths=()=>{try{return JSON.parse(localStorage.getItem(PATHS_KEY)||'{}')}catch{return{}}};
function paths(chatId){return [...new Set([...(savedPaths()[chatId]||[]),...(sessions.get(chatId)||[]).map(f=>f.path)].filter(Boolean))]}
function trackPath(chatId,path){if(path)savePaths(chatId,[...new Set([...paths(chatId),path])])}
function savePaths(chatId,values){const saved=savedPaths();if(values.length)saved[chatId]=values;else delete saved[chatId];localStorage.setItem(PATHS_KEY,JSON.stringify(saved))}
const stop=new Set('a o e de da do das dos em no na nos nas um uma para por com que se ao aos é ser foi são como mais mas ou eu você vc meu minha isso isto esse essa'.split(' '));
const words=t=>(t||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').match(/[a-z0-9]{3,}/g)?.filter(w=>!stop.has(w))||[];
function split(text,size=850,overlap=100){const clean=(text||'').replace(/\r/g,'').replace(/\n{3,}/g,'\n\n').trim(),out=[];let p=0;while(p<clean.length){let end=Math.min(clean.length,p+size);if(end<clean.length){const cut=Math.max(clean.lastIndexOf('\n\n',end),clean.lastIndexOf('. ',end));if(cut>p+size*.55)end=cut+1}const content=clean.slice(p,end).trim();if(content)out.push({content,terms:[...new Set(words(content))].slice(0,80)});if(end>=clean.length)break;p=Math.max(p+1,end-overlap)}return out}
function add(chatId,file,text){const item={id:`a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`,name:file.name,path:file.path,bytes:file.bytes||text.length,chunks:split(text),createdAt:Date.now()};const list=sessions.get(chatId)||[];list.push(item);sessions.set(chatId,list);trackPath(chatId,file.path);return item}
function list(chatId){return sessions.get(chatId)||[]}
function search(chatId,query,limit=5){const q=[...new Set(words(query))].slice(0,60),qs=new Set(q);if(!q.length)return[];return list(chatId).flatMap(file=>file.chunks.map((c,i)=>{let score=0;for(const t of c.terms)if(qs.has(t))score+=1;const low=c.content.toLowerCase();for(const t of q)if(low.includes(t))score+=.12;return{name:file.name,path:file.path,index:i,content:c.content,score}})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,limit)}
function remove(chatId,id){const list=sessions.get(chatId)||[],item=list.find(x=>x.id===id);sessions.set(chatId,list.filter(x=>x.id!==id));if(item)savePaths(chatId,paths(chatId).filter(p=>p!==item.path));return item}
function clear(chatId){sessions.delete(chatId);savePaths(chatId,[]);const all=pendingMap();delete all[chatId];localStorage.setItem(PENDING_KEY,JSON.stringify(all))}
export default{add,list,search,remove,clear,paths,trackPath,pending,stage,unstage,forgetPath};