# ETAPA 7 — Laboratório de Inferência — primeira entrega

Base: 3b105e14b85c52e8ccce40a33baad2d38b414001. Checkpoint: checkpoint/haruna-before-stage7-3b105e1.

Nenhuma otimização normal aplicada. Haruna padrão permanece normal, presets são somente candidatos de benchmark. O laboratório está dentro do DBG existente e só aparece quando a ponte nativa confirma BuildConfig.DEBUG. Release rejeita a API do laboratório e ignora labConfig nas gerações. Não existe nova aba ou alteração visual do chat/configurações normais. Voz, identidade, Safety Core, memória, fontes GGUF, modelos e diagnósticos 4.5/4.6 preservados.

## Implementação

Benchmark canônico em português, isolado das conversas, usando o mesmo backend e template GGUF/Jinja nativo. Não salva mensagens no histórico normal. Seed manual ou aleatória (UINT32_MAX); A/B resolve uma seed aleatória única e exige mesmo seed, limite e histórico. Perfil A/B alternado, 1–5 repetições, saídas mantidas temporariamente e exportação JSON exclusivamente técnica. Histórico técnico limitado a 30 resultados e 12 perfis locais. Saídas e inspector JS são descartados ao fechar. O último prompt canônico nativo permanece somente em memória até a próxima requisição/processo; nunca é incluído na exportação. Histórico sintético ON/OFF, RAG ON/OFF, cache normal ON/OFF. RAG usa o mecanismo existente, consulta explícita padronizada, contexto congelado para o lote A/B, sem exportar trechos ou respostas. Consultas podem atualizar contadores de uso do acervo, como uma consulta normal existente.

Sampler por requisição: temperatura, topK/topP/minP, presença/frequência/repetição, seed. Threads decode/batch ajustáveis só no laboratório (0 mantém o padrão; limite 16). Max output 16–1024, limite já suportado pelo backend. Thinking permanece explicitamente OFF nos presets. Trocar perfil no laboratório não aplica ao chat. O próximo pedido normal restaura sampler/threads de origem; configurações experimentais não são reaplicadas ao iniciar o processo, evitando loop de autoload experimental. Erros não são convertidos em sucesso. Cancelamento usa os tickets existentes.

Perfis: Haruna padrão preserva 0.3 / topK40 / topP.95 / minP.05 / penalidades0 / repetição1. Qwen texto sem thinking: 1.0 /20/1.0/0/presença2/repetição1 (experimental). Phi Mini Instruct: exemplo determinístico temperatura0 (experimental, não recomendação universal). Fontes: https://huggingface.co/Qwen/Qwen3.5-2B#best-practices e https://huggingface.co/microsoft/Phi-4-mini-instruct. Resultados originais não garantem melhor desempenho/qualidade em Android Q4/português.

## FATO MEDIDO e disponível

Instrumentação anterior reutilizada: modelo/arquitetura/tipo GGUF, configuração realmente criada, ABI/features CPU, variante efetiva, buffers, contexto, tokens, prefill e decode separados, TTFT nativo, transporte/DOM, PSS/RSS/heap e pico observado. Laboratório adiciona cronômetro monotônico da aceitação até primeiro delta/total, snapshot antes/depois com idade, status térmico Android antes/depois, parâmetros solicitados e sampler observado, saída temporária e motivo nativo de parada. A taxa decode mede trabalho nativo; não é throughput ponta a ponta. Não afirmar pixels apresentados só por callback DOM. RAG contabiliza tempo real da preparação da busca, não inventa tokens. Prompt Inspector mostra a renderização canônica Jinja antes da inserção automática de BOS/EOS; não registra prompt de conversas privadas. Exportação exclui prompt, resposta, referências e conteúdo dos documentos. Contagem exata por origem: N/D (não somar tokenizações isoladas como se fossem tokens do template final).

## Limites explícitos / ainda não implementado

- Baseline físico Qwen3.5 Q4: PENDENTE. Phi-4 Mini Q4: PENDENTE. Nenhum GGUF foi baixado nem inferência física simulada no CI.
- n_ctx, batch/ubatch, tipos KV, Flash Attention, seleção backend/GPU: somente leitura; controles/reload seguro ainda não implementados no laboratório. Não há backend GPU novo. Solicitado não é tratado como efetivo.
- Não foi implementada otimização de cache híbrido. O código existente recusa arquiteturas híbridas/recorrentes; Qwen3.5 recebe fallback seguro. Não basta remover a proteção. Equivalência híbrida não foi executada, logo experimental híbrido continua indisponível.
- Prompt privado corrente não é capturado. Inspector é limitado ao fixture canônico e referências explicitamente solicitadas no benchmark. Tokens por origem individual são N/D.
- Tempos de memória/RAG normais permanecem nos observadores anteriores; fases ainda inseparáveis não são desdobradas por estimativa. Voz mantém a implementação existente. Observador DEBUG correlaciona recepção de transcribing/result/playing, duração STT, preparação do TTS e TTFT LLM somente quando a requisição é comprovadamente posterior ao resultado STT. Não mede final físico da fala nem DAC; tempos incluem transporte e são rotulados. Nenhum texto de fala é retido.
- PSS antes/depois reutiliza o coletor com limite de uma coleta a cada 10 segundos e idade explícita; valores podem se repetir por cache. Não é amostragem contínua: pode perder pico intermediário. Status térmico não é temperatura da CPU.
- Perfis têm sliders sincronizados e campos numéricos; gráficos de distribuição não implementados.
- Benchmark RAG congela a busca para o lote, permitindo comparar inferência com o mesmo conteúdo. O tempo da busca é registrado separadamente; TTFT nativo não o inclui.
- Não há validação automática da qualidade: A/B mostra saídas e variação; nenhuma configuração é promovida automaticamente.

## HIPÓTESES e OTIMIZAÇÕES PROPOSTAS

Possíveis gargalos a medir: prefill repetido do Qwen híbrido, volume real do prompt, truncamento por maxTokens, pesquisa RAG, contenção térmica/CPU. Nenhuma causa foi declarada confirmada no aparelho. Ordem futura: prompt, cache, híbrido, sampler, orçamento, RAG, threads, batch/ubatch, FA/KV e só depois backend. Não atualizar llama.cpp nem desativar KleidiAI/REPACK do LLM neste pacote.

Fontes/score individuais do RAG: N/D no esquema retornado pelo enriquecedor; nenhuma busca adicional é feita só para diagnóstico.

## Teste manual

Carregar Qwen3.5 2B Q4, abrir Configurações→DBG→Laboratório. Usar Haruna padrão, 3 repetições e seed424242, histórico/RAG/cache OFF para baseline frio. Exportar JSON e avaliar as respostas. Salvar A; selecionar Qwen experimental com mesmo seed e limite, salvar B e executar A/B. Repetir com Phi Mini e preset determinístico. Testar limite256/512/768/1024, cache ON/OFF, histórico sintético ON/OFF, RAG ON/OFF, cancelamento e próxima geração normal. Registrar thermal status e RAM/idade das amostras. Verificar que chats, voz e memória permanecem normais. Não comparar modelos/quantizações diferentes como teste causal.

Bugs fora do escopo não corrigidos: divergência ARM anterior; DNS do dispositivo; limites dos bindings de voz e assinatura de atualização não validada fisicamente. Nenhuma correção especulativa aplicada.

Esta primeira entrega fornece um núcleo executável e expõe explicitamente as lacunas acima; não representa implementação integral de todos os controles solicitados.


Arquivos:
- app/build.gradle.kts
- app/src/main/java/com/proxyslabs/haruna/diagnostics/DiagnosticBridge.kt
- app/src/main/java/com/proxyslabs/haruna/diagnostics/InferenceLab.kt
- app/src/main/java/com/proxyslabs/haruna/LlamaCppBackend.kt
- app/src/main/assets/haruna/diagnostics/panel.js
- app/src/main/assets/haruna/diagnostics/lab.js
- app/src/main/assets/haruna/diagnostics/lab-core.js
- patches/llama-android/haruna_chat.h
- patches/llama-android/haruna_lab.h
- scripts/patch_android_loader.py
- scripts/patch_android_lab.py
- scripts/check_lab.mjs
- scripts/check_stage7_scope.py
- docs/ETAPA_7_RELATORIO.md
- docs/STAGE7_FILES.txt


Arquivos adicionais da instrumentação/teste final:
- scripts/check_lab_browser.mjs
- app/src/main/assets/haruna/diagnostics/voice-observer.js
- app/src/main/assets/haruna/diagnostics/inference.js

ETAPA 7 — LABORATÓRIO DE PERFORMANCE IMPLEMENTADO — AGUARDANDO BENCHMARK NO DISPOSITIVO
