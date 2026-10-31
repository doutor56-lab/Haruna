# ETAPA 7 — Experimento de precisão factual no system prompt

Base: 1d323b817a61457d208007aa1a17633d9ab1051b.
Checkpoint: checkpoint/haruna-before-system-ab-1d323b8.

O prompt atual é HarunaIdentity.systemPrompt(modelName), que concatena RULES, HarunaBehaviorProfile.RULES e identificação do GGUF. Esses dois arquivos permanecem intactos. Não foi copiado um prompt fixo nem hardcoded o arquivo Qwen: outros modelos continuam usando sua identificação real.

A variante current devolve exatamente a string original. factual_precision_experimental preserva essa string inteira e acrescenta apenas uma quebra de linha e a frase exata solicitada. LabSystemPrompt é uma função sem estado. LlamaCppBackend só permite o sufixo quando BuildConfig.DEBUG, requestId lab-* e opções labConfig/variante concordam; o benchmark constrói essas opções em InferenceLab. Chats normais não passam essa autorização e Release sempre usa a string original. Não há preferência global de identidade nem persistência de prompt experimental.

No DBG: selecione System Prompt = Haruna atual e salve A. Sem mudar os demais campos, selecione Precisão factual — experimental e salve B. Configure manualmente a referência 2/6 e seed 424242 antes de salvar ambos; nenhum padrão global nem sampler foi alterado. Ao variar system prompt entre braços, o A/B exige igualdade de todos os demais parâmetros. O controle vale para o mecanismo de benchmark existente, sem condição específica para a pergunta do céu. Não foram acrescentados prompts/datasets/testes de conhecimento.

Resumos A/B, progresso e resultado identificam a variante. Exportação registra systemPromptVariant e systemPromptExperiment; não inclui o texto do system prompt. Os campos existentes mantêm significado e respostas completas continuam disponíveis temporariamente nas abas A/B, com os limites já existentes do laboratório. Não há algoritmo de avaliação factual nem vencedor automático.

Não foram alterados llama.cpp/GGML, sampler interno, seed policy, threads/threadsBatch, n_ctx, batch/ubatch, K/V, FA, CPU, modelo, Jinja, tokenização, streaming, <think>, lifecycle, cache ou proteção híbrida Qwen3.5. A única alteração no caminho Kotlin do backend é a seleção autorizada do conteúdo do system para o benchmark; o mecanismo de inferência permanece igual. Nenhum ajuste de performance foi aplicado.

Validação automática: função Kotlin verifica current intacto, append exato, variante desconhecida sem efeito e autorização falsa sem efeito (caminho Release/normal). Teste browser com fake verifica A/B current/factual em ordem alternada, seed 424242, threads 2/6 iguais, bloqueio se o sampler difere e exportação por identificadores sem prompt. Guard compara os demais arquivos à base e permite apenas o bloco autorizado do backend. Testes anteriores continuam utilizados.

Não foi executada inferência física Qwen/Phi, nem avaliação de qualidade factual. Melhora factual é uma hipótese a validar no Samsung. FA OFF continua indisponível no benchmark pelo guard existente. Não foram corrigidos bugs fora do escopo.

Arquivos: docs/SYSTEM_PROMPT_FILES.txt. Workflow auxiliar separado da branch funcional. Build/testes e artefatos serão registrados pelo CI e no relatório final da entrega.
