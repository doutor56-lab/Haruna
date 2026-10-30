# ETAPA 5 — Sistema multimodelo estável

## Proveniência

- Commit inicial: `3d7c343bce61c381761078e8aac2d73c6cb08e27`.
- Branch funcional: `ui-polish-icons`.
- Checkpoint imutável: `checkpoint/haruna-before-multimodel-3d7c343`.
- llama.cpp: `7894e8b92481a8bb8ffe94f73b656ffe0dd01e10`, preservado. Nenhuma atualização, patch de kernel ou adoção de B_CONSERVATIVE.
- Commit final, run, hashes e artifact: preenchidos no relatório do artifact pelo workflow após a compilação real.

## Arquitetura anterior

A Activity já importava para armazenamento privado, deduplicava GGUF, mantinha um executor de instalação e restaurava o último arquivo/principal. O backend tinha ownership por processo, trava de lifecycle, tickets de cancelamento nativo, streaming com backpressure e cleanup no dispatcher do llama.android.

Faltavam um journal durável de tentativa, a distinção persistente entre selecionado/último sucesso/RAM atual, um gate de admissão compartilhado por troca e geração, nomes amigáveis independentes do arquivo e uma confirmação pública de unload/READY coerente com o backend. O JS também publicava `active` ao terminar uma geração, mesmo se outra operação já tivesse começado.

## Arquitetura implementada

`MainActivity / configurações → LlamaCppBackend → ModelSession → manutenção serializada existente → engine.cleanUp/unload → engine.loadModel → confirmação nativa → confirmação durável READY → status/bridge → UI`.

`ModelSession` é um controlador pequeno sem Android, JNI, conversas ou dependências de inferência. Ele controla admissão e recuperação; não substitui o engine. O processo continua proprietário do engine único; Activity/WebView apenas se vinculam e desvinculam.

### Estados

- `UNLOADED`: nenhuma confirmação de residência.
- `LOADING`: tentativa iniciada e registrada em disco.
- `SWITCHING`: substituição de um modelo antes confirmado.
- `UNLOADING`: liberação/remoção exclusiva.
- `READY`: carregamento confirmado pelo engine e persistência confirmada.
- `ERROR`: tentativa, confirmação ou persistência falhou.

O estado de geração continua sendo observado pelo backend existente. `modelLoaded` só é verdadeiro quando ModelSession está READY, o engine confirma residência, o caminho corresponde e não há manutenção. Uma escolha persistida nunca representa RAM residente.

## Troca, concorrência e liberação

A mesma admissão protege início de load/unload/remove e reserva de geração. Uma segunda troca concorrente é recusada; não se limita a desabilitar botões. Antes de carregar B, a manutenção existente sinaliza cancelamento nativo, aguarda os jobs anteriores e executa `engine.cleanUp()`. A troca exige retorno `Initialized` e ausência de modelo carregado antes de criar B.

O unload existente libera sampler, contexto/KV, modelo e buffers nativos associados. O engine/dispatcher/registro de backends continuam pertencendo ao processo; não são recriados por troca nem destruídos no onDestroy da Activity. Não há GC artificial nem dois modelos mantidos para troca rápida.

O cleanup de uma tentativa falha ocorre com a admissão ainda fechada, inclusive se carregar funcionou mas salvar READY falhou. Assim, um cleanup antigo não pode descarregar um modelo novo admitido no intervalo. Erros de unload impedem avanço para load. Falhas não são apresentadas como sucesso.

O reset de conversa e os tickets/serials de cancelamento anteriores são preservados. A geração não faz mais recarga implícita fora do journal quando o engine está em erro fatal: solicita recarregar nas configurações. Cancelamentos recuperáveis continuam usando os mecanismos das etapas anteriores.

## Persistência e recuperação

`SharedPreferences("haruna_runtime")`, chave nova `model_session_v1`, armazena um JSON único com selecionado, último sucesso, tentativa pendente, caminho bloqueado, erro técnico limitado e política de autoload. O journal usa `commit()` síncrono e verificado antes de entrar no carregamento e para confirmar READY.

Preferências anteriores `last_model_path` e `primary_model_path` são lidas/migradas sem apagar configurações. A definição explícita de principal permanece independente e persistente; importar outro GGUF não sobrescreve o principal já existente.

Se o processo morrer com tentativa pendente, a próxima abertura mostra recuperação e não tenta autoload. O marcador não é consumido apenas por abrir o app; reiniciar repetidamente continua seguro. Falha conhecida também bloqueia autoload. Uma escolha manual válida resolve o bloqueio. Unload explícito suspende autoload sem esquecer a escolha.

Se o arquivo selecionado não existir, não há fallback silencioso para outro modelo. O usuário pode importar/escolher um arquivo válido nas configurações. Nenhum GGUF, chat, documento ou configuração geral é apagado pela recuperação.

## Nome amigável e perfis

`GgufMetadata` lê apenas um prefixo limitado de metadados (até 256 campos/16 MiB), sem tensores/pesos/tokenizer em RAM. A consulta termina antes de arrays de strings do vocabulário; não percorre tokenizador para descobrir um rótulo na interface. Observa `general.name`, `general.basename`, `general.architecture` e `general.file_type`. Cache leve considera caminho, tamanho, modificação e nome personalizado. Se campos relevantes estiverem depois desses limites, a informação pode ficar indisponível e o alias manual continua disponível.

`ModelProfiles` centraliza famílias e defaults. Qwen3.5 pode ser identificado por arquitetura `qwen35/qwen35moe` ou metadados de nome; Phi-4 Mini usa nome/basename do GGUF, não presume que toda arquitetura `phi3` seja Phi-4. Outros modelos continuam permitidos. Quantização vem do file_type conhecido; tipos desconhecidos permanecem identificados por número.

Na ausência de metadados, há um nome genérico/arquivo abreviado e a ação **Nome** permite alias persistente de até 40 caracteres. Um alias é um rótulo do usuário, não prova da arquitetura ou origem dos pesos.

O chat mostra `Haruna — Qwen3.5` / `Haruna — Phi-4` somente a partir do modelo realmente confirmado. Durante troca/erro/unload, não reaproveita o nome ativo antigo. Os detalhes técnicos permanecem no card existente de modelos nas configurações.

Perfis têm pontos centralizados para maxTokens/thinking, inicialmente sem override. As chamadas continuam usando os defaults/valores atuais. Contexto, threads, batch, KV, FA, sampler e template não são configuráveis por modelo nesta entrega porque o binding atual não oferece essas opções como contrato público seguro; não foi inventada uma API nativa nem aplicado override silencioso. Essa ampliação continua possível na camada de perfil/backend sem condicionais espalhadas.

## Histórico, memória, voz e diagnósticos

A troca não escreve nem apaga histórico. O chat continua enviando os roles/mensagens existentes ao engine, usando o template do GGUF. Cleanup/reload descarta o KV do modelo anterior e a revisão de conversa avança. Não há reutilização entre modelos diferentes.

Não foram alterados system prompt/personalidade, memória, curadoria, RAG/fast path, anexos, STT/TTS, código de streaming/backpressure, recovery-runtime.js ou patches nativos.

A infraestrutura 4.5/4.6, os fixtures, runners, scripts, evidências e checkpoints continuam preservados. O build normal usa diagnóstico OFF; nenhum teste de degeneração foi retomado nesta etapa.

## Métricas

Tempo de carregamento usa relógio monotônico e inclui manutenção/liberação, load e confirmação persistida de READY. Fica nas configurações e em uma linha adicional do DBG existente.

TTFT, prefill, decode, tokens gerados, tok/s, duração, memória e razões de parada continuam sendo os da instrumentação existente. Não há segundo sistema nem telemetria. As métricas de última geração podem ser anteriores à troca até ocorrer uma nova geração; não representam um benchmark automático do modelo recém-carregado.

## Arquivos

Alterados:

- `app/src/main/java/com/proxyslabs/haruna/LlmBackend.kt`
- `app/src/main/java/com/proxyslabs/haruna/LlamaCppBackend.kt`
- `app/src/main/java/com/proxyslabs/haruna/LocalLibrary.kt`
- `app/src/main/java/com/proxyslabs/haruna/MainActivity.kt`
- `app/src/main/java/com/proxyslabs/haruna/HarunaAndroidBridge.kt`
- `app/src/main/assets/haruna/android-bridge.js`
- `app/src/main/assets/haruna/llm-engine.js`
- `app/src/main/assets/haruna/app.js` (status e admissão antes do envio)
- `app/src/main/assets/haruna/model-library.js`
- `app/src/main/assets/haruna/index.html` (controles no card existente)
- `app/src/main/assets/haruna/diagnostics/runtime-report.js` (uma métrica)

Novos:

- `models/ModelSession.kt`, `GgufMetadata.kt`, `ModelPreferences.kt` sob o pacote Kotlin da Haruna.
- `app/src/main/assets/haruna/models/presentation.js` e `panel.css`.
- `scripts/check_multimodel.kt`, `.py`, `.mjs`, `check_multimodel_source.py`.
- Este relatório. Workflow de build em branch auxiliar, com checkout explícito do commit do código.

Sem nova dependência de runtime ou biblioteca de inferência.

## Validação e limites

**VALIDADO EM TESTE AUTOMÁTICO:** resultados reais são acrescentados após o workflow. O controlador Kotlin usa backend/store fake para validar estados, falhas, concorrência com latches, persistência, recuperação de tentativa incompleta, unload, troca A/B, isolamento de contexto, erro de escrita e nomes/metadados sintéticos. Não executa GGUF real. O teste de ownership do histórico cobre a separação entre controlador e dados do chamador; persistência física do histórico na UI precisa do roteiro no aparelho.

O teste JS executa a apresentação e o controller real com bridge fake, incluindo conclusão antiga durante SWITCHING e unload recusado. Checks existentes cobrem streaming, fast path RAG e prefixo/KV; guards de integração verificam a ordem de cleanup/load e a preservação dos subsistemas e diagnósticos protegidos.

**VALIDADO EM DISPOSITIVO REAL:** nenhum teste de dispositivo executado nesta etapa. O bom funcionamento de Qwen3.5/Phi-4 informado pelo usuário é evidência anterior, não resultado deste CI.

Limitações: o Android pode matar um processo por OOM/pressão de memória sem lançar exceção Java. O journal impede repetição automática de uma carga interrompida antes de READY; não garante que modelos ~7B caibam, nem detecta antecipadamente todo kill posterior. Não há estimativa de RAM inventada, fallback silencioso de modelo ou descarga automática do LLM para voz. A compatibilidade final depende do GGUF/template e do hardware. Metadados ausentes/malformados têm fallback de nome/alias, sem alterar o arquivo.

## Roteiro de dispositivo

1. Abrir sem modelo: nenhum estado ativo falso.
2. Importar/carregar Qwen3.5; conferir nome ativo apenas após READY e detalhes nas configurações.
3. Conversar e trocar para Phi-4 durante uma geração; conferir cancelamento, streaming parcial, histórico e resposta seguinte.
4. Phi-4 → Qwen3.5 → Phi-4; copiar DBG antes/depois para observar recursos liberados. Não concluir liberação de RAM por um único valor de RSS.
5. Clicar repetidamente em Usar durante carga: somente uma operação nativa deve permanecer admitida.
6. Definir principal, mudar seleção, fechar/reabrir; confirmar escolha e carga reais.
7. Descarregar explicitamente e reiniciar: escolha lembrada, pesos não presumidos residentes nem autoload forçado.
8. Falha de GGUF inválido: erro visível e possibilidade de escolher outro.
9. Interromper o processo durante carga em teste controlado: próxima abertura em recuperação, sem apagar dados; escolher manualmente um válido.
10. Background/foreground e recriação da Activity: sem segunda instância de engine, chat/memória/voz preservados.
11. Revalidar anexos, TXT/RAG, voz e DBG no aparelho. Comparar PSS/RSS/nativo durante trocas sem inferir causalidade ARM.

ETAPA 5 IMPLEMENTADA — AGUARDANDO VALIDAÇÃO MULTIMODELO NO DISPOSITIVO
