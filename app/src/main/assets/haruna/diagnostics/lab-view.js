// Presentation only. Aggregates and benchmark configuration come from lab-core unchanged.
import {baseline,difference} from './lab-core.js';
import {runtimeRows} from './runtime-state.js';
const names={nCtx:"n_ctx · requer contexto novo",nBatch:"n_batch",nUbatch:"n_ubatch",flashAttention:"Flash Attention por contexto",typeK:"Tipo K",typeV:"Tipo V",systemPromptVariant:"System Prompt",temperature:'Temperatura',topK:'Top-K',topP:'Top-P',minP:'Min-P',presence:'Presence penalty',frequency:'Frequency penalty',repeat:'Repeat penalty',seed:'Seed',maxTokens:'Máximo de tokens de saída',thinking:'Thinking',history:'Histórico sintético',cache:'Cache de prefixo',rag:'RAG / Segundo Cérebro',threads:'Threads de geração / decode',threadsBatch:'Threads de processamento / batch'};
const node=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e};
const display=value=>value===null||value===undefined?'N/D':typeof value==='boolean'?(value?'ON':'OFF'):String(value);
function list(rows){const dl=node('dl');for(const [key,value]of rows){const row=node('div');row.append(node('dt',key),node('dd',display(value)));dl.append(row)}return dl}
function section(title,open=true){const e=node('details',undefined,'haruna-dbg-card haruna-lab-area');e.open=open;e.append(node('summary',title));const body=node('div',undefined,'haruna-lab-area-body');e.append(body);return {element:e,body}}
export function organizeLab({root,body,preset,saved,fields,repetitions,output,inspector,answers,comparison,info,note}){
 root.classList.add('haruna-lab');
 const areas=Object.fromEntries(['Laboratório','Benchmark','Experimento A/B','Resultados'].map(title=>[title,section(title,title!=='Resultados')]));
 const originalButtons=[...body.querySelectorAll('button')];
 const config=areas['Laboratório'].body,bench=areas.Benchmark.body,ab=areas['Experimento A/B'].body,results=areas.Resultados.body;
 config.append(note,node('h4','Perfil experimental'),preset,node('h4','Perfis locais'),saved);
 const groups=[['Contexto experimental · recriado ao executar',['nCtx','nBatch','nUbatch','flashAttention']],['KV de atenção experimental · sem reuse híbrido',['typeK','typeV']],['System Prompt',['systemPromptVariant']],['Sampler',['temperature','topK','topP','minP','presence','frequency','repeat']],['Seed e limite',['seed','maxTokens']],['Contexto do fixture',['thinking','history','cache','rag']],['CPU · controles independentes',['threads','threadsBatch']]];
 for(const [title,keys]of groups){const group=section(title,title==='Seed e limite'||title.startsWith('CPU'));group.element.classList.add('haruna-lab-subgroup');for(const key of keys){const field=fields[key],label=field.closest('label');const caption=label.querySelector('span');if(caption)caption.textContent=names[key];else if(label.firstChild?.nodeType===Node.TEXT_NODE)label.firstChild.textContent=names[key]+' ';label.classList.add('haruna-lab-field');group.body.append(label);if(key==='threads'||key==='threadsBatch')group.body.append(node('p',key==='threads'?'Geração token a token. 0 preserva o padrão; não força threadsBatch.':'Processamento do prompt/batch. 0 preserva o padrão; não força threads.', 'haruna-dbg-note'))}config.append(group.element)}
 const runtimeHost=node('div');runtimeHost.dataset.labRuntimeHost='';config.append(runtimeHost,info);
 const repeatLabel=node('label',undefined,'haruna-lab-repeat');repeatLabel.append(node('span','Repetições (1–5)'),repetitions);bench.append(repeatLabel);
 const seedStatus=node('p',undefined,'haruna-dbg-note');bench.append(seedStatus);
 const progress=node('p','Pronto para configurar.', 'haruna-lab-status');progress.setAttribute('role','status');progress.dataset.labProgress='';bench.append(progress);
 const bankHost=node('div');bankHost.dataset.labBank='';const diffHost=node('div');diffHost.dataset.labDifferences='';
 const preview=node('p',undefined,'haruna-lab-status');const warning=node('p',undefined,'haruna-lab-warning');warning.setAttribute('role','status');ab.append(bankHost,diffHost,preview,warning);
 const metrics=node('div');metrics.dataset.labMetrics='';const aggregates=node('div');aggregates.dataset.labAggregates='';
 results.append(metrics,aggregates);
 const details=section('Dados técnicos completos',false);details.body.append(output,comparison);results.append(details.element);
 const answerArea=section('Respostas temporárias · avaliação de qualidade',true);answerArea.body.append(answers);results.append(answerArea.element);
 const inspectArea=section('Prompt Inspector · privado e somente RAM',false);inspectArea.body.append(node('p','A captura da próxima geração normal exige ação explícita. O conteúdo não entra no JSON exportado.','haruna-dbg-note'),inspector);results.append(inspectArea.element);
 const extraArea=section('Pipeline e voz · observação',false);results.append(extraArea.element);
 const secondary=section('Histórico Debug · ações secundárias',false);results.append(secondary.element);
 const destinations={
 'Executar benchmark':bench,'Parar':bench,'Seed aleatória':config,
 'Salvar como A':ab,'Salvar como B':ab,'Executar A/B':ab,
 'Salvar perfil':config,'Restaurar Haruna padrão':config,
 'Respostas A':answerArea.body,'Respostas B':answerArea.body,'Todas as respostas':answerArea.body,
 'Capturar próximo prompt · somente RAM':inspectArea.body,'Ver prompt capturado':inspectArea.body,
 'Pipeline da última mensagem normal':extraArea.body,'Métricas de voz observadas':extraArea.body,
 'Exportar JSON sem respostas':results,'Limpar histórico Debug':secondary.body};
 for(const b of originalButtons){b.classList.add('haruna-lab-action');if(['Executar benchmark','Executar A/B','Exportar JSON sem respostas'].includes(b.textContent))b.classList.add('haruna-lab-primary');if(b.textContent==='Parar')b.classList.add('haruna-lab-stop');(destinations[b.textContent]||config).append(b)}
 body.replaceChildren(...Object.values(areas).map(a=>a.element));
 function seedText(config){return config.seed===4294967295?'Seed aleatória: a execução individual não é determinística. No A/B, o mecanismo existente resolve uma seed compartilhada para o lote.':`Seed fixa: ${config.seed}`}
 return {runtimeHost,
  status(text){progress.textContent=text},
  preview(bank,bankRuntime,reps,current,issues){
   seedStatus.textContent=seedText(current);preview.textContent=`Experimento: A ${bank.A?'salva':'não salva'} · B ${bank.B?'salva':'não salva'} · ${reps} repetições por configuração. ${bank.A?seedText(bank.A):'Salve as duas configurações.'}`;
   warning.textContent=[...issues.blocking,...issues.warnings].join(' ');warning.hidden=!warning.textContent;
   bankHost.replaceChildren();for(const arm of ['A','B']){const card=section(`Configuração ${arm}`,true);if(bank[arm]){const cfg=bank[arm],observed=bankRuntime[arm],states=observed?runtimeRows(observed):[];card.body.append(list([['System Prompt',cfg.systemPromptVariant==='factual_precision_experimental'?'Precisão factual — experimental':'Haruna atual'],['Threads decode / batch',`${cfg.threads} / ${cfg.threadsBatch}`],['Seed',cfg.seed===4294967295?'Aleatória':`Fixa: ${cfg.seed}`],['Máximo de tokens',cfg.maxTokens],['FA solicitada · efetiva observada',`${cfg.flashAttention} · ${observed?.faActual??'Não confirmada'}`],['Contexto/batch/ubatch solicitados',`${cfg.nCtx} / ${cfg.nBatch} / ${cfg.nUbatch}`],['Contexto/batch/ubatch observados',`${observed?.context??'N/D'} / ${observed?.batch??'N/D'} / ${observed?.ubatch??'N/D'}`],['K/V solicitados',`${cfg.typeK} / ${cfg.typeV}`],['K/V observados',`${observed?.k??'N/D'} / ${observed?.v??'N/D'}`],['CPU solicitada · CPU efetiva',observed?`${states[3][1]} · ${states[4][1]}`:'Não confirmado']]));const full=section('Todos os parâmetros e estado observado',false);full.body.append(list(Object.keys(baseline).map(k=>[names[k],k==='seed'&&cfg[k]===4294967295?'Aleatória':cfg[k]])));if(observed)full.body.append(node('p','Estado do processo ao salvar, não uma configuração aplicada por braço. Threads 0 preservam o padrão; confirme valores efetivos no resultado.','haruna-dbg-note'),list(states));card.body.append(full.element)}else card.body.append(node('p','Ainda não salva.','haruna-dbg-note'));bankHost.append(card.element)}
   const diffs=bank.A&&bank.B?Object.keys(baseline).filter(k=>!Object.is(bank.A[k],bank.B[k])).map(k=>[names[k],`A: ${display(bank.A[k])} · B: ${display(bank.B[k])}`]):[];
   if(bankRuntime.A&&bankRuntime.B){const a=runtimeRows(bankRuntime.A),b=runtimeRows(bankRuntime.B);for(const index of [0,2,3,4,5])if(a[index][1]!==b[index][1]&&a[index][1]!=='Não confirmado'&&b[index][1]!=='Não confirmado')diffs.push(['Estado global observado · '+a[index][0],`A: ${a[index][1]} · B: ${b[index][1]}`])}
   diffHost.replaceChildren(node('h4','Diferenças entre A e B'));diffHost.append(diffs.length?list(diffs):node('p',bank.A&&bank.B?'Nenhum parâmetro difere. As configurações não foram alteradas automaticamente.':'Salve A e B para comparar.','haruna-dbg-note'));
  },
  result(m,aggregate){
   areas.Resultados.element.open=true;metrics.replaceChildren(node('h4',m.model||'Modelo não confirmado'),node('p','System Prompt: '+(m.systemPromptVariant==='factual_precision_experimental'?'Precisão factual — experimental':'Haruna atual'),'haruna-dbg-note'),list([
    ['TTFT · callback Kotlin',m.ttftMs==null?'N/D':m.ttftMs.toFixed(2)+' ms'],['TTFT · nativo',m.nativeTtftMs==null?'N/D':m.nativeTtftMs.toFixed(2)+' ms'],['Prefill',m.promptTokensPerSecond==null?'N/D':m.promptTokensPerSecond.toFixed(2)+' tok/s'],['Decode · trabalho nativo',m.decodeWorkTokensPerSecond==null?'N/D':m.decodeWorkTokensPerSecond.toFixed(2)+' tok/s'],['Tokens entrada / saída',`${display(m.promptTokens)} / ${display(m.outputTokens)}`],['Motivo de parada',m.stopReason],['Contexto/batch/ubatch efetivos',`${m.runtime?.nCtx??'N/D'} / ${m.runtime?.nBatch??'N/D'} / ${m.runtime?.nUbatch??'N/D'}`],['FA solicitada / configurada / efetiva',`${m.configuration?.flashAttention??'auto'} / ${m.runtime?.flashRequested??'N/D'} / ${m.runtime?.flashEffective===1?'Ativa':m.runtime?.flashEffective===0?'Inativa':'Não confirmada'}`],['K/V efetivos',`${m.runtime?.kvActualK??'N/D'} / ${m.runtime?.kvActualV??'N/D'}`]]));
   aggregates.replaceChildren(node('h4','Comparação A/B · medianas existentes'));
   for(const [label,key,unit]of [['TTFT · callback Kotlin','ttftMedianMs','ms'],['Prefill','promptMedianTokensPerSecond','tok/s'],['Decode · trabalho nativo','decodeMedianTokensPerSecond','tok/s']]){
    const a=aggregate.A[key],b=aggregate.B[key],percent=difference(a,b);aggregates.append(list([[label,`A: ${a==null?'N/D':a.toFixed(2)+' '+unit} · B: ${b==null?'N/D':b.toFixed(2)+' '+unit}`],['B em relação a A',percent==null?'N/D':`${Math.abs(percent).toFixed(2)}% ${percent<0?'menor':percent>0?'maior':'igual'} (B − A) / A`]]));
   }
   aggregates.append(node('p','Nenhum vencedor automático. Confira resposta, memória, condições térmicas e parâmetros no JSON.','haruna-dbg-note'));
  },
  clear(){metrics.replaceChildren();aggregates.replaceChildren()},
  revealInspector(){areas.Resultados.element.open=true;inspectArea.element.open=true},
  revealTechnical(){areas.Resultados.element.open=true;details.element.open=true},
  buttons:originalButtons
 };
}
