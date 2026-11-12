import {runtimeCards} from './runtime-report.js';
const unavailable='Indisponível';
const valid=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const clean=value=>typeof value==='string'&&value.trim()?value.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,200):unavailable;
const modelName=value=>typeof value==='string'?clean(value.split(/[\\/]/).pop()):unavailable;
const number=value=>valid(value)?value.toLocaleString('pt-BR',{maximumFractionDigits:0}):unavailable;
function bytes(value){if(!valid(value))return unavailable;const units=['B','KiB','MiB','GiB'];let n=value,i=0;while(n>=1024&&i<units.length-1){n/=1024;i++}return `${n.toLocaleString('pt-BR',{maximumFractionDigits:i?1:0})} ${units[i]}`}
function duration(value){if(!valid(value))return unavailable;return value<1000?`${value.toLocaleString('pt-BR',{maximumFractionDigits:1})} ms`:`${(value/1000).toLocaleString('pt-BR',{maximumFractionDigits:2})} s`}
function uptime(value){if(!valid(value))return unavailable;const seconds=Math.floor(value/1000);return seconds<60?`${seconds} s`:`${Math.floor(seconds/60)} min ${seconds%60} s`}
const stateLabels={idle:'Ocioso',installed:'Instalado',not_loaded:'Descarregado',active:'Carregado',basic:'Modo básico',loading:'Carregando',generating:'Gerando',preparing:'Preparando',listening:'Ouvindo',transcribing:'Transcrevendo',result:'Transcrição concluída',no_speech:'Sem fala detectada',playing:'Reproduzindo',downloading:'Baixando',importing:'Importando',extracting:'Preparando instalação',cancelling:'Cancelando',cancelled:'Cancelado',error:'Erro',unknown:unavailable};
const state=value=>stateLabels[value]||unavailable;
const routeReasons={empty:'Mensagem vazia',user_opt_out:'Pedido explícito para não consultar',attachment_priority:'Prioridade ao anexo da conversa',essential_priority:'Prioridade à Memória Essencial',social:'Conversa comum',simple_math:'Expressão aritmética simples',recent_priority:'Prioridade ao contexto recente',provided_context:'Contexto fornecido na mensagem',no_documents:'Sem documentos ativos',no_knowledge:'Sem documentos de conhecimento ativos',communication:'Exemplos de conversação sob demanda',explicit_documents:'Pedido explícito sobre documentos',catalog_match:'Assunto encontrado no catálogo',factual_question:'Pergunta factual',no_signal:'Sem sinal de consulta útil',context_budget:'Sem espaço após contexto prioritário',unavailable:'Consulta indisponível'};
const routeLabel=value=>value?`${value.decision==='query'?'Consulta solicitada':'Fast path'} · ${Object.hasOwn(routeReasons,value.reason)?routeReasons[value.reason]:unavailable}`:unavailable;

/** Build both UI and clipboard from this explicit allowlist; never serialize raw native/knowledge objects. */
export function diagnosticCards(native={},knowledge={}){
 const m=native.memory||{},device=native.device||{},llm=native.llm||{},session=native.session||{};
 const row=(label,value)=>({label,value});
 const section=(id,title,rows,note)=>({id,title,rows,note});
 const voiceRows=(kind,label,model)=>{
  const current=native[kind]||{},timing=session[kind]||{};
  const recognition=current.recognition||{};
  const outcome={success:'Sucesso (texto retornado; precisão não aferida)',no_speech:'Sem fala',invalid:'Saída inválida descartada',error:'Falha',cancelled:'Cancelado'};
  return [row(`${label} — estado`,state(current.state)),
   row(`${label} — modelo`,current.installed===true?model:current.installed===false?'Não instalado':unavailable),
   row(`${label} — motor em memória`,typeof timing.loaded==='boolean'?(timing.loaded?'Carregado':'Descarregado'):unavailable),
   row(`${label} — ${kind==='tts'?'último segmento sintetizado':'última transcrição/liberação'}`,duration(timing.lastMs)),row(`${label} — média das amostras`,duration(timing.meanMs)),
   row(`${label} — amostras`,number(timing.samples)),row(`${label} — RAM atribuída`,unavailable),
   ...(kind==='stt'?[
    row('STT — engine',clean(recognition.engine)),row('STT — idioma configurado',recognition.language==='pt'?'Português (pt)':unavailable),
    row('STT — sample rate capturado',valid(recognition.sampleRate)?`${number(recognition.sampleRate)} Hz`:unavailable),
    row('STT — preparação do modelo',duration(recognition.modelLoadMs)),row('STT — sessão reutilizada',typeof recognition.sessionReused==='boolean'?(recognition.sessionReused?'Sim':'Não'):unavailable),
    row('STT — duração do último trecho enviado',duration(recognition.audioMs)),row('STT — última inferência (decode)',duration(recognition.decodeMs)),
    row('STT — RTF (decode / áudio)',valid(recognition.rtf)?recognition.rtf.toLocaleString('pt-BR',{maximumFractionDigits:3}):unavailable),
    row('STT — último resultado',Object.hasOwn(outcome,recognition.outcome)?outcome[recognition.outcome]:unavailable),
    row('STT — tentativas / transcrições na sessão',valid(recognition.attempts)?`${number(recognition.attempts)} / ${number(recognition.successes)}`:unavailable)
   ]:[])];
 };
 const request=knowledge.lastRequest;
 const consulted=request?(request.calls?`Sim · ${number(request.calls)} chamadas${request.failures?' · houve falha':''}`:'Nenhuma consulta observada'):unavailable;
 const age=valid(m.sampleAgeMs)?m.sampleAgeMs+(valid(native.snapshotAgeMs)?native.snapshotAgeMs:0):null;
 return [
  section('memory','Memória',[
   row('RAM do processo · PSS',bytes(m.pssBytes)),row('RSS do processo · /proc',bytes(m.rssBytes)),row('Heap Java/Kotlin alocado',bytes(m.javaHeapBytes)),
   row('Heap nativo alocado',bytes(m.nativeHeapBytes)),row('PSS Java/VM',bytes(m.javaPssBytes)),
   row('PSS nativo',bytes(m.nativePssBytes)),row('PSS de outras áreas',bytes(m.otherPssBytes)),
   row('RAM disponível no sistema',bytes(m.systemAvailableBytes)),row('Pico PSS observado pelo DBG',bytes(m.observedPeakPssBytes)),
   row('Pico RSS do processo · kernel',bytes(m.kernelPeakRssBytes)),row('Idade da amostra de memória',duration(age))
  ],'PSS divide páginas compartilhadas proporcionalmente. Heaps alocados e PSS são medições diferentes: não devem ser somados. O pico PSS só considera amostras com DBG aberto; o pico RSS vem do kernel quando disponível. Não inclui processos separados do renderizador WebView.'),
  section('llm','Modelo LLM',[
   row('Modelo',modelName(llm.name)),row('Estado',state(llm.state)),row('Arquivo instalado',bytes(llm.fileBytes)),
   row('Arquitetura · metadata GGUF',clean(llm.observation?.runtime?.architecture)),
   row('Descrição técnica · runtime',clean(llm.observation?.runtime?.description)),
   row('Quantização · file_type GGUF/runtime',number(llm.observation?.runtime?.fileType)),
   row('Contexto de treinamento reportado',number(llm.observation?.runtime?.trainedContext)),
   row('Template · última solicitação',llm.context?.ggufTemplate===1?'Metadados do GGUF · Jinja':llm.context?.ggufTemplate===0?'Padrão da biblioteca · GGUF sem template':unavailable)
  ],'Arquitetura e tipo não são inferidos do nome do arquivo. Descrição técnica inclui a classificação de quantização do runtime; file_type é o enum GGUF (misturas de tensores podem existir). Contexto reportado pelo modelo não é garantia de capacidade prática de RAM. A configuração atual e a última geração aparecem separadas.'),
  ...runtimeCards(native,knowledge,{section,row,number,bytes,duration,clean,valid}),
  section('knowledge','Segundo Cérebro',[
   row('Estado',valid(knowledge.activeDocuments)?knowledge.activeDocuments>0?'Ativo':'Inativo / sem documentos ativos':unavailable),
   row('Documentos registrados',number(knowledge.documents)),row('Documentos ativos',number(knowledge.activeDocuments)),
   row('Chunks registrados nos metadados',number(knowledge.chunks)),row('Comprimento registrado · UTF-16',number(knowledge.sourceChars)),
   row('Tamanho em disco',unavailable),row('Roteamento · última solicitação',routeLabel(request?.route)),
   row('Solicitações sem consulta / com consulta',knowledge.routing?`${number(knowledge.routing.skipped)} / ${number(knowledge.routing.requested)}`:unavailable),
   row('Consultas · última solicitação concluída',consulted),
   row('Trechos recuperados · última solicitação',request?number(request.hits):unavailable),
   row('Trechos selecionados para contexto',number(request?.selection?.selectedChunks)),row('Contexto recuperado · caracteres',number(request?.selection?.contextChars)),
   row('Tempo das buscas · última solicitação',request&&request.calls?duration(request.totalMs):unavailable),
   row('Última chamada de busca',duration(knowledge.lastMs)),row('Média por chamada de busca',duration(knowledge.meanMs)),
   row('Chamadas observadas / falhas',valid(knowledge.searchCount)?`${number(knowledge.searchCount)} / ${number(knowledge.failedSearches)}`:unavailable)
  ],'Tempos de busca são observados desde o carregamento desta página. Contagens vêm dos metadados existentes; o DBG não abre nem varre o IndexedDB e não chama search(). Tempos observam as chamadas reais, incluindo retornos vazios. Roteamento é uma regra local, sem inferência extra. Chamadas e seleção são medidas separadamente; recuperar trechos não comprova uso pelo LLM. Solicitações não incluem conteúdo nem identificadores no relatório.'),
  section('voice','Voz',[
   ...voiceRows('stt','STT · fala → texto','Whisper Tiny INT8'),...voiceRows('tts','TTS · texto → fala','Supertonic 3 INT8')
  ],'STT: preparação do modelo é separada e pode ocorrer durante a captura; decode/RTF medem a transcrição, sem carregar novamente pesos reutilizados. Sessões pequenas podem permanecer até 30 s quando há margem de memória. Não há transcrição parcial simulada. Áudio é o trecho após remoção de silêncio inicial. Sucesso significa saída estruturalmente válida, não confiança ou precisão medida. TTS mede segmentos sintetizados, sem reprodução/fila/carregamento. Ler diagnóstico não carrega motores nem guarda texto/áudio.'),
  section('subsystems','Uso por subsistema',[
   row('Haruna / base',unavailable),row('LLM · buffers modelo',bytes(llm.observation?.runtime?.modelBufferBytes)),row('LLM · cache/contexto',bytes(llm.observation?.runtime?.contextBufferBytes)),row('LLM · computação',bytes(llm.observation?.runtime?.computeBufferBytes)),row('Segundo Cérebro',unavailable),row('STT',unavailable),row('TTS',unavailable)
  ],'Buffers LLM vêm de llama_get_memory_breakdown(), amostrados em preparação/prefill. Contexto inclui KV e/ou estados recorrentes; não há separação adicional confiável. São bytes de buffers, não RAM residente exclusiva: não somar a PSS/RSS/heaps. Não há atribuição confiável aos demais subsistemas.'),
  section('device','Dispositivo e sessão',[
   row('Memória Essencial · acesso direto',knowledge.essential?.available===true?'Ativa':unavailable),row('Memória Essencial · campos definidos',number(knowledge.essential?.fields)),
   row('Memória Aprendida · experiências',number(knowledge.learned?.stored)),row('Memória Aprendida · em avaliação',number(knowledge.learned?.observed)),
   row('Memória Aprendida · candidatas',number(knowledge.learned?.training_candidate)),row('Memória Aprendida · aprovadas',number(knowledge.learned?.approved)),
   row('Memória Aprendida · rejeitadas',number(knowledge.learned?.rejected)),row('Memória Aprendida · substituídas',number(knowledge.learned?.superseded)),
   row('App · versão / build',device.app?.version?`${clean(device.app.version)} / ${number(device.app.build)}`:unavailable),
   row('Dispositivo',device.model?`${clean(device.manufacturer)} ${clean(device.model)}`:unavailable),
   row('Android',device.android?`${clean(device.android)} · API ${number(device.api)}`:unavailable),
   row('Arquitetura do processo',device.processArch?`${clean(device.processArch)}${typeof device.process64Bit==='boolean'?(device.process64Bit?' · 64 bits':' · 32 bits'):''}`:unavailable),
   row('RAM total do sistema',bytes(m.systemTotalBytes)),row('RAM disponível',bytes(m.systemAvailableBytes)),
   row('Uptime do processo',uptime(device.processUptimeMs)),row('Janela dos contadores nativos',uptime(session.sessionUptimeMs)),
   row('Gerações concluídas no runtime · sessão',number(session.responsesCompleted)),row('Temperatura da CPU',unavailable)
  ],'Contadores são mantidos apenas no processo atual, sem persistência. Gerações concluídas não incluem cancelamentos, falhas ou respostas do modo básico. Nenhum sensor de temperatura de CPU é presumido.')
 ];
}

export function diagnosticReport(cards){
 return ['HARUNA — DIAGNÓSTICO','DBG · métricas; experimento A/B explicitamente identificado','Atualização: estado a cada 5 s; memória a cada 10 s.','',
  ...cards.flatMap(card=>[card.title.toUpperCase(),...card.rows.map(r=>`${r.label}: ${r.value}`),`Nota: ${card.note}`,''])].join('\n');
}





