import {enrichOnDemand} from '../retrieval/enrich.js';
import {baseline,profiles,summary,difference,exportReport} from './lab-core.js';
export function inferenceLab(){
 const bridge=window.HarunaDiagnostics;
 if(!bridge?.labAvailable?.())return null;
 const root=document.createElement('details');root.className='haruna-dbg-card';const title=document.createElement('summary');title.textContent='Laboratório de Inferência · DEBUG';root.append(title);
 const body=document.createElement('div');body.style.padding='12px';root.append(body);
 const note=document.createElement('p');note.textContent='Haruna padrão continua ativo no chat. Presets recomendados são candidatos experimentais, nunca aplicados automaticamente. Benchmarks isolados, sem conversas, memória ou acervo privado. RAG ON consulta explicitamente o acervo local; os trechos ficam apenas na memória temporária e não são exportados. Cache híbrido permanece bloqueado.';body.append(note);
 const preset=document.createElement('select');for(const name of [...Object.keys(profiles),'Personalizado'])preset.add(new Option(name,name));body.append(preset);
 const fields={};
 for(const [key,value] of Object.entries(baseline)){
  const label=document.createElement('label');label.style.cssText='display:flex;justify-content:space-between;gap:12px;margin:10px 0';label.append(document.createTextNode(key));
  const input=document.createElement('input');input.type=typeof value==='boolean'?'checkbox':'number';input.style.cssText='max-width:110px;min-width:0';if(input.type==='checkbox')input.checked=value;else{input.value=value;input.step='any'}fields[key]=input;label.append(input);body.append(label);
 }
 const read=()=>Object.fromEntries(Object.entries(fields).map(([k,input])=>[k,input.type==='checkbox'?input.checked:Number(input.value)]));
 const fill=p=>{for(const [key,value]of Object.entries(p)){if(!fields[key])continue;fields[key].type==='checkbox'?fields[key].checked=value:fields[key].value=value}};
 preset.onchange=()=>{if(profiles[preset.value])fill(profiles[preset.value])};
 const saved=document.createElement('select');saved.add(new Option('Perfis locais salvos',''));let prefs={};try{prefs=JSON.parse(localStorage.getItem('haruna_lab_profiles_v1')||'{}')}catch{};for(const k of Object.keys(prefs))saved.add(new Option(k,k));saved.onchange=()=>{if(prefs[saved.value])fill(prefs[saved.value])};body.append(saved);
 let rows=[],bank={},queue=[],busy=false,serial=0;
 const output=document.createElement('pre');output.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font:inherit';output.textContent='N/D — execute no dispositivo com GGUF carregado.';
 const inspector=document.createElement('textarea');inspector.readOnly=true;inspector.style.cssText='width:100%;box-sizing:border-box;min-height:120px';inspector.placeholder='Prompt Inspector: template Jinja do fixture. Tokens por origem: N/D; somente total tokenizado nativo está disponível. Nenhum prompt privado é capturado.';
 const answers=document.createElement('pre');answers.style.cssText=output.style.cssText;
 const info=document.createElement('p');info.textContent='Threads: 0 preserva o valor padrão; mudança somente no benchmark. n_ctx, batch/ubatch, FA, KV e GPU: observação no DBG acima; alteração/reload não implementados nesta primeira entrega. Nenhum backend novo ativado. Histório ON usa apenas duas falas sintéticas fixas. Máximo: 1024 tokens; 1–5 repetições. Baseline dos dois modelos: pendente de execução física.';
 const repetitions=document.createElement('input');repetitions.type='number';repetitions.min=1;repetitions.max=5;repetitions.value=3;repetitions.setAttribute('aria-label','Repetições');body.append(document.createTextNode('Repetições: '),repetitions);
 function button(text,fn){const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=()=>{try{fn()}catch(e){output.textContent=e.message}};body.append(b);return b}
 async function prepare(){busy=true;const needed=queue.some(x=>x.config.rag);if(needed){const t=performance.now(),answer=await enrichOnDemand('Consulte o Segundo Cérebro: Explique por que o céu parece azul.',{structured:true});const refs=[];for(const ref of answer.references||[]){if(JSON.stringify([...refs,ref]).length<=2500)refs.push(ref)}const ms=performance.now()-t;queue=queue.map(x=>({...x,config:{...x.config,references:x.config.rag?refs:[],ragMs:x.config.rag?ms:0}}))}next()}
 function next(){if(!queue.length){busy=false;return}busy=true;const item=queue.shift();const result=JSON.parse(bridge.labRun(JSON.stringify(item.config)));if(result.status!=='ok'){queue=[];busy=false;throw Error(result.error)}root.dataset.request=result.request;output.textContent='Benchmark em execução: '+item.name+'; não altere modelo nem inicie voz.';root.dataset.runName=item.name}
 button('Executar benchmark',()=>{if(busy)throw Error('Aguarde o benchmark atual');const n=Number(repetitions.value);if(!Number.isInteger(n)||n<1||n>5)throw Error('Use 1 a 5 repetições');queue=Array.from({length:n},()=>({name:preset.value,config:read()}));prepare().catch(e=>{busy=false;queue=[];output.textContent=e.message})});
 button('Parar',()=>{queue=[];bridge.labCancel()});
 button('Seed aleatória',()=>fields.seed.value=4294967295);
 button('Salvar como A',()=>bank.A=read());button('Salvar como B',()=>bank.B=read());
 button('Executar A/B',()=>{if(busy||!bank.A||!bank.B)throw Error('Salve A e B e aguarde o runtime');const n=Number(repetitions.value);if(!Number.isInteger(n)||n<1||n>5)throw Error('Use 1 a 5 repetições');if(bank.A.seed!==bank.B.seed||bank.A.maxTokens!==bank.B.maxTokens||bank.A.history!==bank.B.history)throw Error('A/B exige mesmo seed, histórico e limite de saída');queue=Array.from({length:n},()=>[{name:'A',config:bank.A},{name:'B',config:bank.B}]).flat();if(bank.A.seed===4294967295&&bank.B.seed===4294967295){const seed=crypto.getRandomValues(new Uint32Array(1))[0];queue=queue.map(x=>({...x,config:{...x.config,seed}}))}prepare().catch(e=>{busy=false;queue=[];output.textContent=e.message})});
 button('Salvar perfil',()=>{const name=prompt('Nome local do perfil (sem informações pessoais):');if(!name||name.length>60)return;if(Object.keys(prefs).length>=12&&!prefs[name])throw Error('Limite de 12 perfis');prefs[name]=read();localStorage.setItem('haruna_lab_profiles_v1',JSON.stringify(prefs));saved.add(new Option(name,name))});
 button('Restaurar Haruna padrão',()=>{fill(baseline);preset.value='Haruna padrão'});
 button('Exportar JSON sem respostas',()=>{const a=document.createElement('a'),url=URL.createObjectURL(new Blob([exportReport(rows)],{type:'application/json'}));a.href=url;a.download='HARUNA_LAB.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)});
 button('Limpar histórico Debug',()=>{localStorage.removeItem('haruna_lab_results_v1');rows=[];answers.textContent='';inspector.value='';output.textContent='Histórico técnico apagado. Chats e memória não foram alterados.'});
 let previous=[];try{previous=JSON.parse(localStorage.getItem('haruna_lab_results_v1')||'[]')}catch{};output.textContent=JSON.stringify(previous.slice(-6),null,2)||'N/D';
 body.append(info,output,inspector,answers);
 const listener=e=>{if(!busy||e.detail?.request!==root.dataset.request)return;const result=e.detail;rows.push(result);rows=rows.slice(-30);const scalar=rows.map(summary);localStorage.setItem('haruna_lab_results_v1',JSON.stringify(scalar));output.textContent=JSON.stringify(summary(result),null,2);inspector.value=result.observation?.laboratory?.canonicalFormattedPrompt||'N/D';answers.textContent=rows.slice(-6).map((r,i)=>`Execução ${i+1}:\n${r.output||''}`).join('\n\n');if(rows.length>=2){const a=summary(rows.at(-2)),b=summary(result);output.textContent+='\nVariação TTFT entre as duas últimas execuções: '+(difference(a.ttftMs,b.ttftMs)?.toFixed(1)??'N/D')+'%. Isso não classifica qualidade.'}try{next()}catch(error){output.textContent=error.message}};
 window.addEventListener('haruna-lab-result',listener);
 return {element:root,dispose(){queue=[];if(busy)bridge.labCancel();busy=false;rows=[];inspector.value='';answers.textContent='';window.removeEventListener('haruna-lab-result',listener)}};
}
