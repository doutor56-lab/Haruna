# HARUNA — ETAPA 7 — Reorganização do DBG e controles existentes

Base: 3fd5a79f8ed0b8185bd53042a1d2450c40b26742.
Checkpoint preservado: checkpoint/haruna-before-dbg-ui-3fd5a79.
Branch funcional mantida: feature/haruna-stage6-offline-voice.

## Resultado e escopo

Somente a interface DBG/Laboratório e uma leitura escalar Kotlin foram modificadas. Não há otimização da inferência. Nenhum padrão é promovido. A interface normal, app.js, modelos, voz, memória, RAG, Safety Core, chat, configuração normal, llama.cpp/GGML/JNI nativo, cancelamento, lifecycle e cache permanecem idênticos à base. Não foram adicionadas dependências nem modificadas flags de build ou versão do app.

O DBG apresenta Diagnóstico (observação) e Laboratório, com áreas de configuração, Benchmark, Experimento A/B e Resultados. Cards recolhíveis separam sampler, seed/limite, contexto sintético, threads independentes, controles do processo, respostas, inspector e ações secundárias. Controles existentes preservados. Seed e repetições ficam visíveis; 3 continua sendo o padrão. Configurações A/B têm resumos curtos, detalhes completos e diferenças. A execução mostra braço, repetição, total, seed enviada, conclusão/falhas e interrupção. Resultados priorizam TTFT, prefill e decode, usando as medianas já existentes. A diferença percentual do prefill é apenas apresentação: (B−A)/A aplicado às medianas existentes. Não há vencedor automático.

## Auditoria das capacidades reais

| Controle | Implementação existente | Aplicação / limite |
|---|---|---|
| Sampler, maxTokens, seed, thinking, histórico, RAG e cache do fixture | lab.js → InferenceLab.kt → labConfig / haruna_lab.h | Próxima requisição do laboratório; nenhuma lógica alterada. Cache continua submetido à proteção híbrida. |
| Threads / threadsBatch | hl_configure → llama_set_n_threads | Independentes, 0 mantém origem, mesmos limites 0–16; próximo benchmark. Não são forçados iguais. |
| FA Padrão/Auto ou OFF | configureExperiment → configureDiagnostic → configureDiagnosticOptions → hd_fa_off aplicado ao criar contexto | Requer recarregar o modelo. Solicitação e contexto/estado efetivo são distintos. Não há recarga automática. |
| CPU atual/automática ou conservadora | preferência cpuConservative, consumida na construção do singleton e carregamento da lib armv8.0_1 | Requer novo processo. Não há hot-swap. A preferência persiste até restauração explícita. Biblioteca indisponível desabilita a opção conservadora. Fallback nativo é mostrado. |
| Seed DBG herdada | fixedSeedDBG via configureExperiment | Preservada em seção avançada; o laboratório exige desligá-la antes de usar sua própria seed. Não é o mesmo controle da seed por requisição. |

### Limitação importante: FA OFF no benchmark

O runtime já consegue solicitar FA OFF e aplicá-la na criação de contexto. Porém patches/llama-android/haruna_lab.h contém a proteção existente `if(hd_fixed_seed||hd_fa_off||hd_sampler_fixed) throw ...`. Assim, mesmo após recarga e FA efetivamente inativa, o benchmark canônico NÃO aceita FA OFF nesta versão.

Essa proteção NÃO foi removida. A interface expõe o controle herdado como suporte parcial, separa solicitação/contexto/efetivo e impede um benchmark canônico rotulado OFF. Não há suporte novo, simulação de FA, alteração de JNI nem mudança de sampler. Para o benchmark canônico é necessário restaurar Padrão/Auto e, se o contexto ainda foi criado OFF, recarregar o modelo. O controle global herdado pode afetar inferência enquanto ativo, sempre por ação explícita do usuário, sem alteração de padrão de produção.

CPU conservadora pode ser usada pelo laboratório depois do novo processo, quando solicitado e efetivo coincidirem. Não é possível alternar CPUs entre braços de uma fila A/B no mesmo processo. Compare lotes/exportações separados após reinício manual. O nome conservador corresponde ao caminho existente armv8.0_1, não prova equivalência ao B_CONSERVATIVE da matriz 4.6 nem ausência de KleidiAI/REPACK. Não foi desabilitada nenhuma otimização.

A recarga deve realmente recriar o contexto. Selecionar novamente um modelo já ativo pode reutilizá-lo, conforme a implementação existente. Não foi criado botão novo de unload/reload. Quando aplicável, os caminhos existentes de descarregar/carregar ou trocar modelo e retornar precisam ser confirmados pelo estado efetivo; o UI não presume que a recarga aconteceu.

### Solicitado e efetivo

A nova função DEBUG labRuntimeState lê somente os campos existentes de runtimeMetrics: flashRequested/flashEffective, cpuVariant, threads, threadsBatch, fixedSeedDBG, flashOffRequestedDBG, cpuConservativeEffectiveDBG, cpuLoadFallbackDBG, cpuConservativePending e cpuConservativeAvailable. Sem PSS, novos timers, conteúdo privado ou mutação. Não é um JNI de inferência novo.

A seleção no dropdown é edição não enviada. Só Solicitar alteração chama configureExperiment com os mesmos três booleanos já usados antes. O ACK confirma a solicitação, nunca a recarga ou mudança efetiva. Campos desconhecidos continuam Não confirmado. A UI não regride um estado recém-confirmado por uma cópia reconhecidamente cacheada do snapshot. A coleta periódica existente permanece em 5 s; não há novo polling.

A/B guarda em RAM a observação de processo ao salvar, separada de bank.A/bank.B. Esses estados não são parâmetros nativos por braço e não são acrescentados ao JSON do benchmark. Mudança conhecida de estado invalida o rótulo salvo até salvar novamente. Edição não enviada, mudança de CPU pendente ou FA incompatível é avisada antes de executar; a checagem também impede a próxima execução se o estado mudar durante a fila. Nenhuma configuração é aplicada automaticamente.

## Benchmarks e comparabilidade

- Fórmulas: lab-core.js idêntico byte a byte à base; TTFT/prefill/decode e agregação não mudaram.
- InferenceLab.kt, relógios/coletores e geração nativa: idênticos.
- Prompt/fixture, seed, histórico sintético e RAG congelado: mesmos códigos.
- Repetições: mesmo intervalo 1–5 e padrão 3; A1→B1→A2→B2→A3→B3 preservado.
- Seed aleatória A/B: mesma resolução única existente; não foi adicionado RNG.
- Não há warm-up novo nem requisição extra de inferência.
- O JSON preserva corpo, schema, significado e exclusão de respostas/documentos/prompts. Nenhum campo de interface é injetado na configuração experimental.
- Resumos de processo ao salvar são observações, não provas de que um braço já executou. Os valores nativos dos resultados/diagnóstico continuam sendo autoridade.
- Apresentação e proteções de rotulagem foram acrescentadas fora das fórmulas. O custo de renderização DBG pode variar; não se alega equivalência absoluta de tempos físicos ou ganho. As condições e definições do protocolo permanecem comparáveis.

## Capacidades não expostas como funcionais

FA OFF não pode executar no benchmark canônico por sua proteção existente. CPU não pode mudar sem novo processo nem alternar automaticamente entre braços. n_ctx, batch/ubatch, tipos de KV, GPU/offload e novos backends continuam sem controles funcionais novos. Cache híbrido Qwen3.5 não foi habilitado. Estado efetivo ausente não é simulado. Recarga/unload/restart permanecem manuais pelos mecanismos já existentes; nenhum botão mata processo ou reconstrói contexto.

## Validação

Testes focados no navegador real com pontes simuladas em 360 e 768 px: abrir/fechar DBG, diagnóstico, controles, A/B, seis chamadas alternadas com 3 repetições, threads 2/2 versus 2/4, seed fixa, progresso B repetição 2, medianas e percentuais, exportação sem conteúdo, bloqueios FA/CPU/edição pendente, benchmark individual, erro e Parar, estado indisponível e ausência de overflow.

Teste anterior do laboratório preservado, apenas adaptando seletores às novas seções recolhíveis. Guard de escopo compara o commit-base: somente arquivos permitidos; a única alteração Kotlin é a leitura escalar; prepare/RAG, resolução de seed, criação das filas e corpo de exportação são preservados. Testes anteriores de voz/chat/streaming seguem usados como regressão.

Não houve inferência GGUF física, troca real de CPU, validação física de FA, microfone ou áudio. As transições desses estados no teste UI são fornecidas por fakes, não implementadas como capacidades novas. A compilação e os testes automáticos não provam estabilidade absoluta no aparelho.

## Problemas encontrados fora do escopo

O bloqueio nativo de FA OFF é uma limitação existente auditada, não corrigida. A necessidade de novo processo e persistência da CPU também já existiam. Degeneração ARM, comportamento de modelos, assinatura de atualização e demais questões anteriores não foram corrigidos. Nenhum novo bug funcional externo foi confirmado durante esta tarefa. Não se concluiu qual backend é mais rápido ou mais correto.

## Arquivos

Lista exata: docs/DBG_UI_FILES.txt. Workflow de build é publicado separadamente em branch auxiliar, sem modificar flags nativas.

## Teste manual

1. Abrir Configurações → DBG. Conferir Diagnóstico e Laboratório.
2. Seed 424242, 3 repetições. Salvar A com threads 2/2 e B com 2/4. Conferir diferenças e estados solicitados/efetivos.
3. Executar A/B, acompanhar braço/repetição, comparar métricas e respostas e exportar o mesmo JSON.
4. Solicitar CPU conservadora. Conferir solicitado conservador e efetivo anterior; não executar rotulado conservador antes do novo processo. Forçar parada/reabrir manualmente e confirmar variante/efetivo. Fazer lote separado; restaurar solicitação se houver fallback.
5. Solicitar FA OFF. Conferir que o estado efetivo não muda só por selecionar/aplicar; após recarga pode mudar, mas benchmark canônico continua bloqueado por suporte parcial. Restaurar Auto e recarregar quando indicado.
6. Testar Parar, próxima geração, perfis, inspector, pipeline/voz, exportação e retorno à página anterior. Confirmar que o chat normal e seus padrões não mudaram.
