# ETAPA_1_RUNTIME_INSTRUMENTATION

Baseline observacional sobre `add31e5`, llama.cpp `7894e8b92481a8bb8ffe94f73b656ffe0dd01e10`.
Checkpoint: `checkpoint/haruna-before-runtime-metrics-add31e5`. Nenhuma otimização de inferência nesta etapa.

## Integração e arquivos

Modificados: `LlmBackend.kt`, `LlamaCppBackend.kt`, `HarunaAndroidBridge.kt`,
`diagnostics/DiagnosticBridge.kt`, `diagnostics/DiagnosticSession.kt`,
`diagnostics/AndroidMetricsCollector.kt`, `app.js`, `android-bridge.js`,
`diagnostics/metrics.js`, `diagnostics/report.js`, `diagnostics/panel.js`,
`patches/llama-android/haruna_chat.h`, `scripts/patch_android_loader.py`.

Novos: `patches/llama-android/haruna_metrics.h`, `scripts/patch_android_metrics.py`,
`diagnostics/inference.js`, `diagnostics/runtime-report.js`, este documento.

O loader existente aplica a extensão antes do Gradle. A revisão efetiva é lida de
`git rev-parse HEAD` do submódulo e incorporada ao cabeçalho de build. O patch também
adiciona dois getters somente leitura ao core: FA efetiva e camadas transformer
atribuídas a dispositivos GPU. Não muda parâmetros, pesos, template ou decisões de geração.

## Métricas e origem

| Grupo | Origem / semântica |
|---|---|
| Modelo | `general.architecture`, `llama_model_desc`, `llama_model_ftype`, `llama_model_n_ctx_train`; nome e bytes da biblioteca privada existente. File type é enum do runtime, não inferido do nome. |
| Runtime | Commit real do submódulo compilado; ABI de compilação; `dladdr` do setter de threads do backend CPU registrado; HWCAP/HWCAP2 para DOTPROD/FP16/I8MM; `sysconf` e `sched_getaffinity` na thread de inferência. |
| Configuração | `llama_n_ctx/n_batch/n_ubatch/n_seq_max/n_threads/n_threads_batch` do contexto criado; tipos K/V passados à criação da memória de atenção; FA solicitada e estado resolvido do core. |
| Dispositivos | Dispositivos dos buffers efetivamente alocados via `llama_get_memory_breakdown`; getter conta atribuição GPU das camadas transformer, excluindo projeção de saída. Não é profiling de kernels. |
| Preparação JS | `performance.now`, imediatamente antes do enriquecimento até a montagem de mensagens; não inclui seleção/leitura inicial de arquivos nem todos os handlers anteriores. |
| Template/tokenização | Tempos monotônicos separados; acumulam tentativas quando o limite remove histórico. |
| Prefill | Tempo do helper de decode inicial e tokens em batches concluídos com sucesso; input selecionado contado separadamente. |
| TTFT nativo | Entrada em `processChatMessages` até produção do primeiro delta UTF-8 não vazio. Primeiro token amostrado também separado. Inclui observadores executados nesse caminho. |
| Decode | Soma do tempo de cada chamada que faz sampling/decode/conversão, incluindo passo EOG, excluindo prefill e espera entre chamadas. Tok/s de trabalho nativo, não throughput ponta a ponta. Saída não conta EOG. |
| Bridge | Entrada em generate, primeiro callback, primeiro envio a evaluateJavascript e eventos token enviados; `elapsedRealtimeNanos`. |
| DOM | Contadores incrementados após as atribuições existentes e render final; primeira resposta não-placeholder, duração e tamanhos UTF-16. Não mede pixels. |
| Ack DOM | No máximo dois retornos curtos pela ponte DBG: primeiro texto e DOM final. Recebimento Android é limite superior para o instante DOM; inclui retorno IPC. Comparação com native usa CLOCK_BOOTTIME, igual à origem de elapsedRealtimeNanos. |
| Memória | Mantém PSS/heaps/RAM disponível/picos; adiciona VmRSS de `/proc/self/status` no mesmo ciclo de até 10 s. |
| Buffers LLM | `llama_get_memory_breakdown`: modelo, contexto/cache e computação; amostras após prepare e prefill. Não são RSS exclusivo e não são somados ao PSS/RSS. |
| Contexto | Posição observada, remoção de mensagens no limite nativo, shifts, limpeza efetiva de KV; zero reaproveitado somente quando essa limpeza foi observada. |
| Finalização | EOG, orçamento, erro de decode, erro de preparação observados no C++; cancelamento/erro/conclusão do Flow separados em Kotlin. |

## Limites e privacidade

- Mantidos threads, ctx 8192, batch/ubatch 512, KV, FA, sampling, modelo, template,
  reset, `@FastNative`, lifecycle e streaming por fragmento. `no_perf` não foi alterado;
  os tempos separados usam observadores monotônicos próprios, sem ligar profiling global.
- O getter DBG lê cópias de configuração e atomics. Não acessa ponteiros mutáveis de modelo/contexto
  em paralelo à inferência. Metadados/buffers são coletados pela thread serializada.
- Não há logs novos por token, conteúdo em métricas, persistência de diagnóstico, histórico
  ilimitado ou chamada LLM/RAG adicional. IDs de transporte transitórios não entram no relatório.
- O relatório/clipboard usa allowlist explícita; nenhum objeto bruto é exportado.
- HWCAP mostra disponibilidade, não prova a utilização de cada extensão por cada kernel.
- FA pode estar pendente antes de o core resolver suporte. K/V refletem tipos da memória
  de atenção; estados recorrentes híbridos podem usar outros tipos.
- Pixels, tempo de compositor, RAM atribuída a STT/TTS/RAG, separação adicional KV versus
  estado recorrente e perfil de operações não estão disponíveis. Não são estimados.
- Memória é amostrada com DBG aberto; o pico PSS observado não captura necessariamente
  o pico de toda geração. VmHWM é o pico RSS do kernel. Renderer WebView separado não está incluído.
- Cópias de contexto/buffers são das fronteiras de preparação/prefill, não continuamente atualizadas.
  Contadores podem ser lidos entre dois tokens ou no meio de uma chamada. Última geração pode
  permanecer após trocar modelo; configuração atual e serial da geração são apresentados separados.
- Parar continua sem abort nativo novo. Erro de decode ainda pode encerrar o Flow como sucesso:
  motivo C++ e resultado Kotlin aparecem separados para evidenciar esse comportamento.
- Um travamento completo pode impedir abrir/copiar o DBG; esta etapa não tenta contornar isso.
- Instrumentação acrescenta custo O(1) por fragmento, relógios e contadores, mais coleta pequena
  nas fronteiras. Impacto esperado baixo, não medido no dispositivo. Não alegar overhead zero.
- DBG mantém atualização de 5 s e memória limitada a 10 s. Fechado: contadores continuam;
  sem polling/DOM do painel. Aberto: serialização pequena e coleta limitada à cadência existente.

## Build e validação

Executar `python3 scripts/patch_android_loader.py` sobre o submódulo fixado antes do Gradle.
Sem downloads de GGUF, testes de aparelho ou benchmarks nesta entrega.
O resultado e o link do APK ficam na entrega da execução; compilar não confirma desempenho.

## Teste manual no telefone

Manter o mesmo modo Rápido/Pensar em B/C/D e registrar qual foi usado. Não desinstalar
o app para comparar: conservar modelos e dados. Aguardar atualização do DBG antes de copiar.

**A — Carregado, sem gerar:** abrir Configurações → DBG → Copiar diagnóstico.
Copiar Modelo, Runtime, Configuração e Memória (commit/ABI/variante/features, CPUs,
threads, contexto/batches, K/V, FA, camadas GPU, tamanho do modelo, PSS/RSS/heaps/disponível).

**B — 0.5B, conversa nova, primeira resposta:** enviar pergunta comum que utilize o LLM
(evitar apenas saudação/nome, que podem ter resposta local). Ao finalizar, copiar tudo.
Registrar serial, input, prefill tokens/ms/tok/s, template/tokenização, TTFT nativo,
primeiro envio/DOM/ack, output, decode ms/tok/s, duração, parada, deltas/eventos/updates,
gap de apresentação, ocupação/remoção/shifts, RAG consultado/chunks e memória.

**C — 1.5B, conversa nova, primeira resposta:** mesma pergunta e mesmo modo de B.
Copiar os mesmos números, junto com nome/quantização/configuração e memória.

**D — 1.5B após cerca de cinco trocas:** copiar novamente os mesmos campos.
Comparar input/prefill/TTFT/decode, stream/DOM e PSS/RSS/disponível/picos.

Se 1.5B travar, não insistir. Copiar o que estiver acessível durante o problema ou
assim que a interface recuperar, informar se foi antes do primeiro texto ou durante
a resposta e se Parar respondeu. Não inventar diagnóstico se o painel não abrir.
