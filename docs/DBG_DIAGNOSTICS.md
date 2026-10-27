# DBG · Diagnóstico da Haruna

Base: `54a7ed067547b44cd791088db9bd971e29400c67`, mesma branch `ui-polish-icons`.

Checkpoint preservado: `checkpoint/haruna-before-dbg-20261027-54a7ed0`.

## Fluxo e isolamento

O módulo adiciona um botão discreto ao final de `#settingsView`, depois dos módulos de voz e antes da navegação inferior, sem modificar a navegação. O botão rola com a página. Um `dialog` modal com altura limitada contém seis cards verticais recolhíveis, rodapé para cópia e fechamento. Fechar restaura foco e posição de rolagem das Configurações.

CSS é limitado a classes `haruna-dbg-*`. O painel usa as cores, fonte e ícones locais existentes e acompanha os temas. Nenhuma biblioteca, permissão ou dependência foi adicionada.

## Arquivos novos

- `app/src/main/java/com/proxyslabs/haruna/diagnostics/DiagnosticSession.kt`: contadores e tempos monotônicos em RAM, sem conteúdo.
- `app/src/main/java/com/proxyslabs/haruna/diagnostics/AndroidMetricsCollector.kt`: memória, dispositivo e uptime do processo.
- `app/src/main/java/com/proxyslabs/haruna/diagnostics/DiagnosticBridge.kt`: única operação pública `requestSnapshot(ticket)`, somente leitura, executada em worker próprio sob demanda.
- `app/src/main/assets/haruna/diagnostics/metrics.js`: agregados de buscas reais e contagens dos metadados.
- `app/src/main/assets/haruna/diagnostics/report.js`: lista explícita de campos para os cards e o relatório de texto.
- `app/src/main/assets/haruna/diagnostics/panel.js`: botão, janela, atualização e cópia.
- `app/src/main/assets/haruna/diagnostics/panel.css`: estilos exclusivos do DBG.
- Este documento.

## Arquivos existentes modificados

- `MainActivity.kt`: registra/remove a ponte DBG e encerra somente o worker do DBG.
- `HarunaAndroidBridge.kt`: registra início, primeira saída não vazia e conclusão/falha de solicitações já recebidas. O mesmo backend, executor, payload e callbacks são usados; texto não é enviado ao coletor.
- `speech/SupertonicTtsEngine.kt`: sinaliza carga/liberação já realizadas e mede segmentos sintetizados com sucesso, mantendo configuração e chamadas de inferência.
- `speech/WhisperSttEngine.kt`: sinaliza criação/liberação já realizadas e mede a tentativa da transcrição até liberar o recognizer. O fluxo de captura/decodificação permanece igual.
- `knowledge-store.js`: envolve a busca existente com um relógio e um evento protegido contendo somente duração, quantidade de resultados e flag de falha. Ranking, consultas, filtros, `touch`, resultados e exceções continuam iguais.
- `app.js`: emite somente um evento protegido quando a solicitação do chat termina; o evento não leva mensagens ou IDs.
- `index.html`: carrega CSS e módulo isolados do DBG.

Sem alterações em `LlamaCppBackend.kt`, interface `LlmBackend.kt`, `LocalLibrary.kt`, `recovery-runtime.js`, `llm-engine.js`, `android-bridge.js`, carregamento GGUF, prompts, parâmetros de geração, importação, exclusão, esquema de banco, anexos, gerenciadores STT/TTS, normalizador, áudio, onboarding ou estilos anteriores.

## Fontes reais das métricas

| Dado | Fonte e significado |
| --- | --- |
| RAM do processo | `Debug.getMemoryInfo(Debug.MemoryInfo).totalPss × 1024`; PSS do processo Android atual. Compartilhamento de páginas é proporcional. |
| PSS Java, nativo e outras áreas | `dalvikPss`, `nativePss` e `otherPss` da mesma amostra; classificações de áreas, não modelos. |
| Heap Java/Kotlin alocado | `Runtime.totalMemory() - Runtime.freeMemory()`. Não é o mesmo que PSS nem tamanho do heap JS. |
| Heap nativo alocado | `Debug.getNativeHeapAllocatedSize()`. Não é atribuído ao LLM; não cobre necessariamente todos os mapeamentos nativos. |
| RAM total/disponível do sistema | `ActivityManager.getMemoryInfo`, campos `totalMem` e `availMem`. |
| Pico PSS observado | Máximo apenas das amostras obtidas pelo DBG aberto. Não é pico completo da sessão. |
| Pico RSS do processo | `VmHWM` de `/proc/self/status`, se legível. Pico mantido pelo kernel durante o processo, métrica diferente de PSS. |
| Uptime do processo | `elapsedRealtime() - Process.getStartElapsedRealtime()`, incluindo tempo fora de primeiro plano. |
| LLM atual | `backend.status()`; nome reduzido a basename, estado e flag de carregamento. |
| Arquivo GGUF | `File.length()` da cópia ativa já conhecida pela Activity, sem exportar o caminho. Só é lido quando o modelo consta como carregado. |
| Backend | Nome da classe real `LlamaCppBackend`; não identifica CPU/GPU efetiva. |
| Primeira saída / duração | Relógio monotônico na ponte: recepção da solicitação até primeira saída não vazia ou callback final. Inclui fila, preparo de prompt e eventual recarga; não é timing interno isolado da inferência. |
| Respostas da sessão | Quantidade de callbacks de conclusão do backend no processo, sem cancelamentos/falhas/modo básico. Não conta histórico persistido nem garante que a tela salvou a resposta. |
| Documentos/chunks | `knowledge.list()` existente; chunks são os números registrados nos metadados, sem conferir o IndexedDB. Campos inválidos ficam indisponíveis. |
| Caracteres de origem | Soma do campo `chars` dos documentos, comprimento em unidades UTF-16 do JavaScript; não é tamanho em disco nem RAM. |
| Busca | Duração e número de resultados de `knowledge.search()` já chamado pelo fluxo normal. Inclui chamadas vazias e falhas observadas; média por chamada, não por resposta; a janela é o carregamento atual da página WebView. |
| Última solicitação do chat | Agrega chamadas observadas entre `haruna-chat-submit` e o evento final. Informa consultas/resultados, não prova de uso efetivo dos trechos pelo LLM. |
| Estado STT/TTS e instalação | Leitura dos `getStatus()` existentes, selecionando apenas estado, instalação e bytes; a leitura não carrega os motores. |
| Motores de voz em memória | Flags dos pontos reais de criação/liberação nos adapters. Instalação em disco não é confundida com carregamento. |
| STT: última/média | Criação do recognizer, transcrição e liberação, quando o recognizer chegou a ser criado. Não inclui a gravação do microfone; inclui tentativas que chegaram ao finally e liberaram o recognizer. |
| TTS: última/média | Um segmento sintetizado com sucesso; exclui fila, carga do motor e reprodução. Não é duração total de uma mensagem. |
| Dispositivo | Versão/build do próprio pacote, fabricante, modelo, Android/API, `os.arch` do processo e `Process.is64Bit()`. Sem serial ou identificadores únicos. |

## Estimativas e indisponibilidade

**Não são apresentados números estimados.** Arredondamento de unidades e médias usam medições reais. Memória não deve ser somada entre PSS, heaps e tamanho de arquivos.

Permanecem indisponíveis: RAM atribuída a cada subsistema, contexto usado/limite, contagem exata de tokens, tokens/s, threads efetivas do LLM, CPU/GPU selecionada, temperatura de CPU e tamanho real do IndexedDB. A separação de RAM não é inventada usando diferença de amostras ou tamanho dos pesos.

A RAM mostrada é do processo principal; renderizadores WebView em processos separados não são agregados. Não se estima memória do Segundo Cérebro pelo tamanho de textos e não se chama `search()` ou `getText()` pelo DBG.

## Frequência, recursos e privacidade

- Fechado: sem polling, amostragem de RAM, leitura de metadados ou trabalho periódico do painel. Permanecem pequenos contadores/eventos por operação real. Dados ficam só em RAM no processo.
- Aberto: uma solicitação de snapshot a cada **5 segundos**, suspensa quando a página fica oculta. Só há uma coleta nativa pendente.
- PSS/heaps/RAM/proc são amostrados no máximo a cada **10 segundos**, em worker do DBG; o painel exibe a idade da amostra. Estado nativo pode ser reutilizado por até 5 segundos.
- Metadados são lidos ao abrir ou depois de uma notificação de mudança. Não se abre ou varre o IndexedDB pelo diagnóstico.
- Worker não inicia antes da primeira coleta e expira após 30 segundos ocioso. Fechar a Activity encerra apenas esse worker. Nenhum motor é descarregado pelo DBG.
- Não se mantém série histórica: agregados escalares, máximo de quatro registros transitórios de solicitações nativas, uma amostra de RAM e um snapshot pequeno.
- Cópia usa lista explícita de campos dos cards. Não inclui mensagens, documentos, queries, chunks, áudio, prompts, erros brutos, IDs de conversa, paths, dicionário de pronúncia, chaves ou tokens. Basename do GGUF e modelo do aparelho são incluídos por serem campos solicitados.

Impacto esperado: baixo quando fechado (incrementos/relógios nos pontos observados); quando aberto, uma coleta moderada de memória a cada 10 s e atualização leve a cada 5 s. Não foi realizado benchmark nem quantificado esse custo em aparelho.

## Validação e pendências

Conferidas sintaxe dos módulos JavaScript, lista de campos do relatório com marcador privado de verificação e equivalência do corpo original de busca após remover somente a instrumentação. Não foram adicionados testes ao projeto nem executados benchmarks/suítes extensas.

Não foi executado build Android completo ou teste no dispositivo nesta implementação. A conferência manual deve cobrir: botão no final das Configurações; abrir/rolar/recolher/fechar e restaurar posição/foco; nomes GGUF longos; temas claro/escuro; métricas após gerar, interromper, consultar RAG, ditar e ouvir; descarregamento real do TTS após ocioso; fundo/retomada; cópia e campos indisponíveis. Debug APIs/PSS e leitura de `/proc` podem variar entre dispositivos; falhas são tratadas como indisponibilidade.
