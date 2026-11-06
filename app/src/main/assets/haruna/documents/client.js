const native=()=>window.HarunaDocuments;
export const available=()=>!!native();
export function call(name,...args){if(!native())throw Error('Documentos locais indisponíveis nesta versão');const value=native()[name](...args);if(value===undefined)return {};const result=JSON.parse(value);if(result.error)throw Error(result.error);return result}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let parser=null,parserJob=null,parserURL=null,docxAbort=null;
function finishWorker(){docxAbort?.abort();docxAbort=null;parser?.terminate();parser=null;parserJob=null;if(parserURL)URL.revokeObjectURL(parserURL);parserURL=null}
async function parseDocx(state){if(parserJob===state.id)return;parserJob=state.id;docxAbort=new AbortController();
 try{const [library,handler,response]=await Promise.all([fetch(new URL('../vendor/mammoth-1.13.0.min.js',import.meta.url)).then(r=>{if(!r.ok)throw Error('Leitor DOCX indisponível');return r.text()}),fetch(new URL('./docx-worker.js',import.meta.url)).then(r=>{if(!r.ok)throw Error('Leitor DOCX indisponível');return r.text()}),fetch(state.url,{signal:docxAbort.signal})]);if(!response.ok)throw Error('DOCX indisponível');const buffer=await response.arrayBuffer();if(buffer.byteLength>32*1024*1024)throw Error('DOCX excede 32 MiB');const current=call('status');if(parserJob!==state.id||current.id!==state.id||!current.busy){finishWorker();return;}
 parserURL=URL.createObjectURL(new Blob([library,'\n',handler],{type:'text/javascript'}));parser=new Worker(parserURL);
 parser.onmessage=event=>{try{if(event.data.error)throw Error(event.data.error);const blocks=event.data.blocks;for(let i=0,ordinal=0;i<Math.max(1,blocks.length);i+=25,ordinal++)call('docxBatch',state.id,ordinal,JSON.stringify(blocks.slice(i,i+25)),i+25>=blocks.length)}catch{native().docxFailed(state.id)}finally{finishWorker()}};
 parser.onerror=()=>{native().docxFailed(state.id);finishWorker()};parser.postMessage({buffer},[buffer]);
 }catch{native().docxFailed(state.id);finishWorker()}}
function announce(state){window.harunaDocumentsBusy=!!state.busy;window.dispatchEvent(new CustomEvent('haruna-documents-progress',{detail:state}));if(state.state==='WAITING_DOCX')parseDocx(state);if(!state.busy&&parserJob)finishWorker()}
export async function wait(id){for(;;){const state=call('status');announce(state);if(state.id!==id)throw Error('A operação de documentos foi substituída');if(['ERROR','CANCELLED'].includes(state.state))throw Error(state.error||'Operação cancelada');if(state.state==='DONE'){changed();return state}await sleep(300)}}
export async function run(name,...args){const started=call(name,...args);return wait(started.id)}
export async function prepare(file,question){const result=await run('prepare',file.path,question);if(!result.context?.length)throw Error('Nenhum texto ou descrição foi obtido. Para fotografias, instale o modelo visual em Configurações.');return {file:{...file,nativeDocId:result.documentId},chunks:result.context,text:result.context.map(c=>c.content).join('\n\n')}}
export function cached(file,question=''){if(!available())return null;const result=call('context',file.path,question);return result.context?.length?{file:{...file,nativeDocId:result.documentId},chunks:result.context,text:result.context.map(c=>c.content).join('\n\n')}:null}
export function changed(){window.dispatchEvent(new CustomEvent('haruna-knowledge-changed',{detail:{action:'native_documents'}}))}
export function cancel(){const s=call('status');if(s.busy)native().cancel(s.id);finishWorker()}
// An Activity can be recreated while its process-owned worker continues. Resume observation, not inference.
if(available())setInterval(()=>{if(document.hidden)return;try{const s=call('status');announce(s);if(!s.busy&&s.id&&s.id!==lastDone&&s.state==='DONE'){lastDone=s.id;changed()}}catch{}},750);
let lastDone=null;
