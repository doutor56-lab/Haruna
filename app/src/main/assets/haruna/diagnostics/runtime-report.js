// Explicit scalar allowlist, shared by the existing DBG cards and clipboard report.
export function runtimeCards(native,local,f){
 const {section,row,number,bytes,duration,clean,valid}=f;
 const obs=native.llm?.observation||{},r=obs.runtime||{},g=obs.generation||{};
 const inc=obs.incremental||{};
 const k=obs.prefix||{},planned=k.planned===true;
 const p=native.session?.pipeline||{},v=local.inference||p.visual||{},t=p.transport||{};
 const has=valid(g.serial)&&g.serial>0;
 const us=n=>valid(n)?duration(n/1000):'Indisponível';
 const rate=(n,t)=>valid(n)&&valid(t)&&t>0?`${(n*1e6/t).toLocaleString('pt-BR',{maximumFractionDigits:2})} tokens/s`:'Indisponível';
 const yes=x=>typeof x==='boolean'?(x?'Sim':'Não'):'Indisponível';
 const stages={1:'Template',2:'Tokenização',3:'Prefill',4:'Decode / transporte',5:'Finalizado no native'};
 const stop={0:'Desconhecido / ainda sem parada nativa',1:'EOG do vocabulário',2:'Limite de tokens',3:'Erro no decode nativo',4:'Erro ao preparar entrada',5:'Cancelamento do usuário',6:'Erro de prefill',7:'Cancelamento para unload/troca',8:'Cancelamento para destroy',9:'Tela/bridge encerrada',10:'Erro de transporte UTF-8'};
 const same=has&&valid(p.bridgeStartBootUs)&&g.nativeStartBootUs>=p.bridgeStartBootUs;
 const gap=same&&valid(g.firstDeltaUs)&&valid(p.firstDomAckBootUs)?p.firstDomAckBootUs-g.nativeStartBootUs-g.firstDeltaUs:null;
 const sendGap=same&&valid(g.firstDeltaUs)&&valid(p.firstWebViewSendBootUs)?p.firstWebViewSendBootUs-g.nativeStartBootUs-g.firstDeltaUs:null;
 return [
 section('incremental','Sequência híbrida · estado completo',[
 row('Modo / motivo',`${clean(inc.mode)} / ${clean(inc.reason||inc.invalidation)}`),
 row('Prompt / novos / avaliados / reutilizados',`${number(inc.promptTokens)} / ${number(inc.newTokens)} / ${number(inc.evaluatedTokens)} / ${number(inc.reusedTokens)}`),
 row('n_past antes / após restore / final',`${number(inc.nPastBefore)} / ${number(inc.nPastAfterRestore)} / ${number(inc.nPastAfter)}`),
 row('Sequência / reset',`${number(inc.sequenceId)} / ${yes(inc.sequenceReset)}`),row('Estado recorrente',clean(inc.recurrentStatePreserved)),
 row('KV preservado',yes(inc.kvPreserved)),row('Snapshots completos em RAM',bytes(inc.snapshotBytes)),row('Captura / restore',`${us(inc.captureUs)} / ${us(inc.restoreUs)}`)
 ],'Append exige igualdade dos tokens e fronteira válida. Restore serializa atenção + recorrência/convolução, nunca KV-only. Snapshots voláteis e limitados a 128 MiB; sistema estático sem perfil pessoal. Reuse reduz tokens efetivamente avaliados, não altera o tamanho do prompt. Benchmark com cache OFF continua frio e integral.'),
 section('runtime' ,'Runtime',[
  row('llama.cpp · commit compilado',clean(r.llamaCommit)),row('ABI nativa',clean(r.abi)),
  row('Dispositivos dos buffers efetivos',clean(r.bufferDevices)),row('Variante CPU carregada · dladdr',clean(r.cpuVariant)),
  row('ARM · DOTPROD detectado',yes(r.dotprod)),row('ARM · FP16 vetorial detectado',yes(r.fp16)),row('ARM · I8MM detectado',yes(r.i8mm)),
  row('CPUs online / permitidas à thread',`${number(r.cpuOnline)} / ${number(r.cpuAllowed)}`),
  row('Pools CPU persistentes anexados',yes(r.cpuThreadpools?.persistent)),
  row('Pools · decode / batch / pares criados',`${number(r.cpuThreadpools?.decodeThreads)} / ${number(r.cpuThreadpools?.batchThreads)} / ${number(r.cpuThreadpools?.pairsCreated)}`),
  row('Preparação do prefixo · no carregamento',clean(r.startup?.status)),
  row('Tempo de preparação · não é TTFT frio',us(r.startup?.preparationUs)),
  row('Prefixo estático · tokens / snapshot',`${number(r.startup?.systemPrefixTokens)} / ${bytes(r.startup?.snapshotBytes)}`),
  row('Prefixo estático restaurado nesta solicitação',yes(r.startup?.restoredForRequest)),
  row('Restore do prefixo · duração',us(r.startup?.restoreUs))
 ],'Variante vem do símbolo do backend CPU registrado, sem caminhos. Features vêm de HWCAP/HWCAP2: disponibilidade não comprova uso em cada kernel. Dispositivos são os que possuem buffers alocados; não é um profiler de operações. CPU permitida é amostrada na thread de inferência. Dados da preparação/prefill, sem polling do contexto.'),
 section('configuration','Configuração aplicada',[
  row('Threads · decode / batch',`${number(r.threads)} / ${number(r.threadsBatch)}`),row('Contexto configurado',number(r.nCtx)),
  row('Batch / ubatch',`${number(r.nBatch)} / ${number(r.nUbatch)}`),row('Sequências · capacidade',number(r.nSeqMax)),
  row('K / V · tipos aplicados na criação',`${clean(r.kvK)} / ${clean(r.kvV)}`),
  row('Contexto solicitado · laboratório',number(r.contextExperiment?.requested?.nCtx)),
  row('Batch / ubatch solicitados · laboratório',`${number(r.contextExperiment?.requested?.nBatch)} / ${number(r.contextExperiment?.requested?.nUbatch)}`),
  row('Contexto experimental · estado',clean(r.contextExperiment?.state)),
  row('K / V · tensores efetivos',`${clean(r.kvActualK)} / ${clean(r.kvActualV)}`),
  row('Flash Attention · solicitada',clean(r.flashRequested)),
  row('Flash Attention · efetiva',r.flashEffective===1?'Ativa':r.flashEffective===0?'Inativa':'Indisponível / negociação pendente'),
  row('Camadas transformer atribuídas à GPU',number(r.gpuTransformerLayers))
 ],'Configuração lida do contexto criado. K/V são os tipos encaminhados à criação da memória de atenção; estados recorrentes de modelos híbridos podem ter outros tipos. GPU conta camadas transformer, exclui a projeção de saída. Este card só observa. O experimento A/B separado pode solicitar FA off após recarga e CPU conservadora em outro processo; padrões normais preservados.'),
 section('generation','Última geração / atual',[
  row('Serial nativo · apenas correlação',has?number(g.serial):'Indisponível'),row('Fase nativa',has?stages[g.stage]||'Desconhecida':'Indisponível'),
  row('Preparação de referências/contexto · JS',duration(v.contextMs)),
  row('Template · tempo acumulado',has?us(g.templateUs):'Indisponível'),row('Tokenização · tempo acumulado',has?us(g.tokenizeUs):'Indisponível'),
  row('Entrada · tokens selecionados',has?number(g.inputTokens):'Indisponível'),
  row('Prefill · tokens avaliados com sucesso',has?number(g.prefillTokens):'Indisponível'),
  row('Prefill · duração',has&&g.stage>=4?us(g.prefillUs):'Indisponível / em andamento'),
  row('Prefill · velocidade',has&&g.stage>=4?rate(g.prefillTokens,g.prefillUs):'Indisponível'),
  row('TTFT nativo · primeiro delta UTF-8',has?us(g.firstDeltaUs):'Indisponível'),
  row('Primeiro token amostrado · nativo',has?us(g.firstSampleUs):'Indisponível'),
  row('Primeiro envio à WebView · desde ponte',duration(p.firstWebViewSendMs)),
  row('Primeiro texto da resposta no DOM · JS',duration(v.clientFirstVisibleMs)),
  row('Primeiro texto DOM · ack na ponte (limite superior)',duration(p.firstDomAckMs)),
  row('Saída · tokens gerados sem EOG',has?number(g.outputTokens):'Indisponível'),
  row('Decode · trabalho nativo acumulado',has&&g.decodeSteps>0?us(g.decodeUs):'Indisponível'),
  row('Decode · velocidade do trabalho nativo',has&&g.decodeSteps>0?rate(g.outputTokens,g.decodeUs):'Indisponível'),
  row('Native · até parada observada',has?us(g.endUs):'Indisponível / em andamento'),
  row('Ponte · duração / andamento',duration(p.elapsedMs)),
  row('Parada nativa',has?stop[g.nativeStopCode]||'Desconhecido':'Indisponível'),
  row('Conclusão Kotlin',p.active?'Em andamento':({completed:'Flow concluído',cancelled:'Cancelamento Kotlin',error:'Erro'}[native.session?.lastOutcome]||'Indisponível'))
 ],'TTFT nativo começa ao entrar no JNI estruturado; ponte começa ao receber o pedido; JS começa antes de chamar a bridge. Preparação JS é anterior e separada. DOM significa textContent atribuído, não pixels confirmados. Decode soma sampling/decode/conversão por chamada, incluindo passo EOG; exclui espera entre chamadas e prefill. Velocidades de trabalho não são throughput ponta a ponta. Erros nativos agora são propagados ao Flow; cancelamento e EOG continuam sendo eventos distintos.'),
 section('streaming','Streaming',[
  row('Deltas UTF-8 nativos',has?number(g.nativeDeltas):'Indisponível'),row('Lotes com texto enviados Kotlin → WebView',number(p.bridgeEvents)),
  row('Entregas de stream / confirmadas pelo JS',`${number(t.batches)} / ${number(t.acknowledgedBatches)}`),
  row('Deltas aceitos pelo buffer Android',number(t.acceptedDeltas)),
  row('Média de deltas / lote com texto',valid(t.textBatches)&&t.textBatches>0?(t.acceptedDeltas/t.textBatches).toLocaleString('pt-BR',{maximumFractionDigits:2}):'Indisponível'),
  row('Maior lote · deltas / UTF-16',`${number(t.maxBatchDeltas)} / ${number(t.maxBatchChars)}`),
  row('Texto enviado · unidades UTF-16',number(t.charsSent)),
  row('Pico do backlog · UTF-16 pendente + em voo',number(t.peakBacklogChars)),
  row('Finalizações forçadas',number(t.forcedFinal)),
  row('Deltas recusados / UTF-16 liberado sem confirmação',`${number(t.droppedDeltas)} / ${number(t.discardedChars)}`),
  row('Final confirmado / falha de entrega / limite do backlog',`${yes(t.terminalDelivered)} / ${yes(t.deliveryFailed)} / ${yes(t.backlogLimitReached)}`),
  row('Eventos de stream inválidos no JS · sessão',number(v.discardedStreamEvents)),
  row('Deltas recebidos no JS',number(v.receivedDeltas)),row('Atualizações da resposta no DOM',number(v.visualUpdates)),
  row('Saída bruta nativa · bytes UTF-8',has?bytes(g.outputBytes):'Indisponível'),row('Último tamanho observado · UTF-16',number(v.outputUtf16)),
  row('Primeiro delta nativo → envio WebView',us(sendGap)),
  row('Primeiro delta nativo → ack DOM (limite superior)',us(gap)),
  row('Apresentação · primeiro texto até DOM final',duration(v.presentationSpanMs)),row('JS · pedido até DOM final',duration(v.clientTotalMs))
 ],'Android agrupa deltas antes da WebView: janela base 45 ms, até 350 ms para um delta isolado, primeiro lote imediato e até 4096 unidades UTF-16 por lote. Uma única entrega fica em voo até ACK do JS; a confirmação não prova pixels. Final vazio também conta como entrega. A média usa deltas aceitos/lotes com texto e é definitiva após escoamento. DOM progressivo usa RAF; render final também é contado. Pico do backlog não é RAM nem bytes. Fechamento de uma WebView morta descarta buffers explicitamente; cancelamento em tela viva escoa o texto aceito. Ack DOM é limite superior. BOOTTIME Android/native continua preservado. Sem mudança em sampling ou inferência.'),
 ...stabilityCards(obs,native.session||{},f),
 ...decisionCards(obs,f),
 section('context','Contexto',[
  row('Capacidade configurada',number(r.nCtx)),row('Entrada atual / última · tokens',has?number(g.inputTokens):'Indisponível'),
  row('Posição de escrita observada',has?number(g.occupied):'Indisponível'),
  row('Tokens reaproveitados',planned?number(k.reusedTokens):'Indisponível · não reconciliado'),
  row('Prompt total / realmente avaliado no prefill',planned?`${number(k.inputTokens)} / ${number(g.prefillTokens)}`:'Indisponível'),
  row('Reaproveitamento do prompt',planned&&k.inputTokens>0?`${(100*k.reusedTokens/k.inputTokens).toLocaleString('pt-BR',{maximumFractionDigits:1})}%`:'Indisponível'),
  row('Maior prefixo comum · igualdade de tokens',planned?number(k.commonPrefixTokens):'Indisponível'),
  row('Hit de comparação',planned?(k.fullTokenMatch?'Completo · último token reavaliado':k.reusedTokens>0?'Parcial':'Miss'):'Indisponível'),
  row('KV · posições antes / reconciliadas',planned?`${number(k.kvBefore)} / ${number(k.kvReconciled)}`:'Indisponível'),
  row('KV · após prefill / término',planned?`${k.kvAfterPrefill>0?number(k.kvAfterPrefill):'Não concluído'} / ${g.stage===5?number(k.kvAfter):'Em andamento'}`:'Indisponível'),
  row('Posições podadas · reconciliação / cleanup',planned?`${number(k.prunedTokens)} / ${number(k.cleanupPrunedTokens)}`:'Indisponível'),
  row('Prefill evitado · tokens',planned?number(k.reusedTokens):'Indisponível'),
  row('Comparação e reconciliação',planned?us(k.reconcileUs):'Indisponível'),
  row('Cache · prefixo confirmado válido',yes(k.valid)),
  row('Tokens confirmados no cache',number(k.confirmedTokens)),
  row('Reuse suportado nesta solicitação',planned?yes(k.supported):'Indisponível'),
  row('Conversa · slot opaco no processo',k.conversationSlot>0?`C${k.conversationSlot}`:'Indisponível'),
  row('Motivo da decisão',planned?prefixReason(k.reason):'Não reconciliado'),
  row('Último evento do cache',prefixReason(k.invalidation)),
  row('Prefixo confirmado após cancelamento',[5,9].includes(g.nativeStopCode)?number(k.confirmedAfterCancel):'Não se aplica'),
  row('Prefill novo concluído antes de cancelar',[5,9].includes(g.nativeStopCode)?number(k.evaluatedBeforeCancel):'Não se aplica'),
  row('Context shifts observados',has?number(g.shifts):'Indisponível'),
  row('Histórico removido · mensagens',has?number(g.removedMessages):'Indisponível'),
  row('Motivo da redução',has?(g.removedMessages>0?'Entrada + saída reservada excederam a capacidade':'Nenhuma redução nativa observada'):'Indisponível')
 ],'Tokens atuais do mesmo template são comparados um a um com o registro confirmado no mesmo modelo/conversa. Coincidência completa do prompt ainda reavalia seu último token para obter logits atuais: não significa 100% de KV reutilizado. Novo prefill conta só batches concluídos. Cancelamento no decode volta ao prompt confirmado; sufixos não apresentados não são presumidos como histórico. Estado inválido ou memória sem poda segura faz prefill completo. Slot opaco não revela ID/título. Posições são lógicas, não bytes/RAM. Snapshot mostra última solicitação nativa; respostas locais podem não chamar o LLM. Truncamento, sampling e orçamento existentes foram preservados.')
 ];
}

function stabilityCards(obs,session,f){
 const {section,row,number,duration,valid}=f,s=obs.stability||{},o=obs.owner||{};
 const yes=v=>typeof v==='boolean'?(v?'Sim':'Não'):'Indisponível';
 const phases={0:'Antes da entrada',1:'Template',2:'Tokenização',3:'Prefill',4:'Decode / transporte',5:'Finalização'};
 const resources=valid(s.resources)?['modelo','contexto','sampler','batch'].filter((_,i)=>(s.resources&(1<<i))!==0).join(' / ')||'Nenhum recurso de modelo':'Indisponível';
 return [section('stability','JNI, cancelamento e lifecycle',[
  row('Serial da solicitação nativa',number(s.requestSerial)),row('Ticket ativo (zero = ocioso)',number(s.activeTicket)),
  row('Cancelamento solicitado / reconhecido',`${yes(s.cancelRequested)} / ${yes(s.cancelAcknowledged)}`),
  row('Fase do reconhecimento',s.cancelAcknowledged?phases[s.cancelPhase]||'Desconhecida':'Indisponível'),
  row('Pedido → reconhecimento',valid(s.cancelLatencyUs)?duration(s.cancelLatencyUs/1000):'Indisponível'),
  row('Recursos ativos',resources),row('Backend nativo inicializado',yes(s.backendInitialized)),
  row('Modelos carregados / liberados · processo',`${number(s.modelsLoaded)} / ${number(s.modelsReleased)}`),
  row('Owner do modelo',o.scope==='process'?'Processo · sem Activity/WebView':'Indisponível'),
  row('Requests / manutenção',`${number(o.requestsActive)} / ${yes(o.maintenance)}`),
  row('Bridges LLM vivas / executores encerrados',`${number(session.liveLlmBridges)} / ${number(session.closedLlmExecutors)}`),
  row('Callbacks antigos descartados',number(session.discardedLlmCallbacks)),row('Cancelamentos sem ticket correspondente',number(s.staleCancelIgnored)),
  row('Sampler reset observado',yes(s.samplerReset)),row('Seed efetiva da geração',number(s.samplerSeed)),
  row('Maior sequência do mesmo token',number(s.maxTokenRun)),row('Coincidências com dois tokens atrás',number(s.lag2Matches)),
  row('Sondas de logits / NaNs / infinitos',`${number(s.logitProbes)} / ${number(s.nanLogits)} / ${number(s.infiniteLogits)}`),
  row('Extremos da última sonda · min / max',validSigned(s.logitMin)&&validSigned(s.logitMax)?`${s.logitMin.toFixed(3)} / ${s.logitMax.toFixed(3)}`:'Indisponível'),
  row('Custo das sondas de logits',valid(s.logitProbeUs)?duration(s.logitProbeUs/1000):'Indisponível'),
  row('Layouts dos buffers',typeof obs.runtime?.bufferLayouts==='string'?obs.runtime.bufferLayouts:'Indisponível')
 ],'Cancelamento usa ticket: pedido antigo não afeta o novo. Reconhecimento é observado entre nós do grafo CPU ou fronteiras seguras; não é tempo até todos os callbacks terminarem. Modelos são do processo; bridges e executores pertencem à tela. Repetição é somente agregada, sem filtros ou IDs exportados. Até duas sondas originais de logits, primeira amostragem/final EOG ou limite, além das sondas condicionais limitadas no card Decisão de token; infinitos podem ser legítimos, NaN merece investigação. Seed automática é lida, não fixada. Nenhum prompt/texto é retido no diagnóstico.')];
}
function validSigned(v){return typeof v==='number'&&Number.isFinite(v)}
function prefixReason(value){
 const labels={empty:'Cache vazio',match:'Prefixo confirmado compatível',tokens_changed:'Tokens divergentes · sufixo removido',conversation_changed:'Outra conversa',explicit_reset:'Contexto de conversa reiniciado',model_changed:'Modelo/contexto mudou',template_changed:'Template/opção mudou',missing_identity:'Sem identidade de conversa · reuse desativado',unsupported:'Estado recorrente/híbrido ou memória não suportada',memory_mismatch:'Posições de memória incompatíveis',prune_failed:'Poda não comprovada · fallback completo',native_error:'Erro nativo · cache invalidado',cancelled_prefill:'Cancelado no prefill · só batches concluídos',cancelled_decode:'Cancelado no decode · prompt preservado',history_trimmed:'Histórico truncado · prefixo revalidado',context_shift:'Context shift · registro invalidado',unloaded:'Modelo/contexto liberado',legacy_reset:'Fluxo legado limpou o contexto',full_match_replay:'Prompt idêntico · último token reavaliado',cancelled_before_prepare:'Cancelado antes de alterar o KV'};
 return labels[value]||'Indisponível';
}


function decisionCards(obs,f){
 const {section,row,number,duration,valid}=f,d=obs.decisionProbe||{},s=d.sampler||{},c=obs.debugControls||{};
 const yes=v=>typeof v==='boolean'?(v?'Sim':'Não'):'Indisponível';
 const technical=value=>typeof value==='string'?value.slice(0,500):'Indisponível';
 const scalar=value=>typeof value==='number'&&Number.isFinite(value)?String(Number(value.toPrecision(7))):'—';
 const candidates=(list,key)=>(Array.isArray(list)?list:[]).slice(0,3).map(v=>`${v.id}:${scalar(v[key])}`).join(' · ')||'—';
 return [section('decision','Decisão de token · sondas limitadas',[
  row('Sampler · ordem efetiva',technical(s.chain)),
  row('Temperatura / top-k / top-p / min-p',`${scalar(s.temperature)} / ${scalar(s.topK)} / ${scalar(s.topP)} / ${scalar(s.minP)}`),
  row('Repeat / frequência / presença / janela',`${scalar(s.repeatPenalty)} / ${scalar(s.frequencyPenalty)} / ${scalar(s.presencePenalty)} / ${scalar(s.penaltyWindow)}`),
  row('DRY / typical-p / XTC / mirostat',`${scalar(s.dryMultiplier)} / ${scalar(s.typicalP)} / ${scalar(s.xtcProbability)} / ${scalar(s.mirostat)}`),
  row('Seed DBG fixa solicitada',yes(d.fixedSeedDBG)),row('Sampler criado em modo seed DBG',yes(s.fixedSeedDBG)),
  row('FA off solicitada · exige recarregar modelo',yes(d.flashOffRequestedDBG)),
  row('CPU conservadora · próximo processo / efetiva',`${yes(c.cpuConservativePending)} / ${yes(d.cpuConservativeEffectiveDBG)}`),
  row('Biblioteca conservadora presente / fallback automático',`${yes(c.cpuConservativeAvailable)} / ${yes(d.cpuLoadFallbackDBG)}`),
  row('HWCAP / HWCAP2 · kernel',`${technical(d.hwcap)} / ${technical(d.hwcap2)}`),
  row('Primeiros IDs · quantidade / fingerprint',`${number(d.initialIdCount)} / ${technical(d.initialIdFingerprint)}`),
  row('Aceites no sampler / erros de avanço KV',`${number(d.acceptedGeneratedTokens)} / ${number(d.positionErrors)}`),
  row('Custo acumulado das sondas pesadas',valid(d.probeCostUs)?duration(d.probeCostUs/1000):'Indisponível'),
  ...(Array.isArray(d.probes)?d.probes:[]).slice(0,10).flatMap((p,i)=>[
   row(`Sonda ${i+1} · passo / posição / ID / motivo`,`${scalar(p.step)} / ${scalar(p.position)} / ${scalar(p.id)} / ${technical(p.reason)}`),
   row('Logit escolhido / rank bruto / min / max',`${scalar(p.rawChosen)} / ${scalar(p.rawRank)} / ${scalar(p.min)} / ${scalar(p.max)}`),
   row('Logits · finitos / NaN / Inf / fingerprint',`${scalar(p.finite)} / ${scalar(p.nan)} / ${scalar(p.inf)} / ${technical(p.rawFingerprint)}`),
   row('Top bruto · ID:logit',candidates(p.rawTop,'logit')),
   row('P escolhida / rank pós / massa / entropia',`${scalar(p.chosenP)} / ${scalar(p.postRank)} / ${scalar(p.postMass)} / ${scalar(p.postEntropyNats)}`),
   row('Top pós · ID:probabilidade',candidates(p.postTop,'p')),
   row('Entropia bruta / candidatos / NaN pós / Inf pós',`${scalar(p.rawEntropyNats)} / ${scalar(p.candidateCount)} / ${scalar(p.postNan)} / ${scalar(p.postInf)}`),
   row('Escolhido corresponde / último aceito antes',`${yes(p.selectedMatchesId)} / ${scalar(p.samplerLastBeforeAccept)}`),
   row('Recorrência · sequência / lag-2 consecutivo',`${scalar(p.run)} / ${scalar(p.lag2Streak)}`),
   row('KV · seq / min / max antes / max depois',`${scalar(p.seqId)} / ${scalar(p.kvMin)} / ${scalar(p.kvMaxBefore)} / ${scalar(p.kvMaxAfter)}`),
   row('Posição compatível / depois / decode código',`${yes(p.positionMatchesKV)} / ${scalar(p.positionAfter)} / ${scalar(p.decodeResult)}`),
   row('Piece · bytes / fingerprint / UTF-8',`${scalar(p.pieceBytes)} / ${technical(p.pieceFingerprint)} / ${scalar(p.pieceUtf8)}`),
   row('Buffer UTF-8 / bytes / Java / round-trip exato',`${scalar(p.accumulatedUtf8)} / ${scalar(p.accumulatedBytes)} / ${yes(p.javaProduced)} / ${yes(p.javaRoundTripExact)}`)
  ])
 ],'Até dez sondas: início, surgimento de padrão técnico por IDs, checkpoints e final/EOG. Só observam: nenhum novo sorteio, nenhuma ordenação dos candidatos, nenhum filtro. Probabilidade vem de candidatos existentes; entropia pós só quando a massa normaliza. UTF-8: 0 completo, 1 fragmento, 2 inválido; EOG não tem piece emitido. IDs/candidatos limitados podem revelar fragmentos a quem possui o tokenizer: confira antes de compartilhar. Sem texto, prompts ou histórico completo. Fingerprints não são prova de identidade exata nem de correção numérica; não são usados pelo cache. Seleção de CPU é aplicada só em outro processo; modo conservador ainda pode usar KleidiAI/repack compatíveis. FA efetiva está no card Configuração. Não há A/B de batch nesta etapa.')];
}
