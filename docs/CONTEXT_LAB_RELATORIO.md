# ETAPA 7 — CONTEXTO, FA, KV E REFERÊNCIA 2/6

## Base e segurança

Commit base: a72f9c7b84d2cb3e90e3d47bd37905a8081598af.
Checkpoint criado antes das alterações: checkpoint/haruna-before-context-lab-a72f9c7.
llama.cpp permanece 7894e8b92481a8bb8ffe94f73b656ffe0dd01e10.
Commit final, run, resultado do build e SHA do APK são acrescentados ao relatório técnico pelo CI. Inventário integral: CONTEXT_LAB_FILES.txt. Nenhum GGUF baixado, alterado ou executado no CI.

## Promoção normal 2/6

A única promoção normal é threads decode=2 e threadsBatch=6 para arquitetura GGUF general.architecture=qwen35 e contagem real de parâmetros entre 1,5 e 2,5 bilhões, com pelo menos seis CPUs permitidas pela afinidade do processo (fallback: online). Não depende do nome do arquivo. Qwen fora dessa faixa, Phi e outras famílias mantêm a seleção anterior. Com menos de seis CPUs permitidas, preserva-se o comportamento anterior em vez de forçar oversubscription.

A regra aplica-se na criação do contexto. Não altera o sampler, contexto 8192, batch/ubatch 512/512, F16/F16, FA Auto ou CPU automática normais. Laboratório continua permitindo threads independentes; 0 herda o padrão do modelo. Troca de modelo reinicializa apenas o estado de restauração do laboratório, evitando restaurar threads salvas de outro modelo. Não altera o lifecycle de load/unload.

Esta promoção se baseia nos testes físicos anteriores relatados pelo usuário. Não medimos ganho físico nesta execução e não prometemos TTFT de 12–13 s. O chat normal com esta build requer validação no Samsung SM-A155M.

## Auditoria do guard de Flash Attention

O guard surgiu no primeiro laboratório, commit e8bf3f8ad7eda883254200f665eabe111f224b9f, em hl_configure: hd_fixed_seed || hd_fa_off || hd_sampler_fixed. Ele separava o harness das opções herdadas do diagnóstico, sem distinguir opções que mudam o sampler de opções de criação do contexto.

hd_fixed_seed e hd_sampler_fixed interferem no RNG/sampler: continuam bloqueados. hd_fa_off só define ctx_params.flash_attn_type antes de llama_init_from_model; não altera template, seed, logits escolhidos pelo sampler nem política híbrida. As APIs oficiais desta revisão suportam FA Auto/Enabled/Disabled e contexto novo. Por isso o laboratório agora aceita FA por requisição, recriando o contexto e não reaproveitando estado antigo. A opção herdada de processo OFF continua exigindo OFF também no laboratório; caso contrário o teste é recusado e pede restauração. Não apagamos indiscriminadamente a proteção.

O resultado diferencia requested (pedido), configured (ctx_params) e effective (observer do contexto após prefill). Para ON/OFF explícitos, efetivo divergente ou não confirmado produz erro, não uma execução bem-sucedida rotulada incorretamente. Auto não promete ON. FA OFF pode ser mais lento e ter diferenças numéricas; isso é objeto do experimento, não uma conclusão de qualidade/determinismo bit a bit entre caminhos. Mesma seed não garante igualdade entre kernels diferentes. Não existe dependência com o guard de reuse híbrido, que permanece intacto.

## Contexto, batch e ubatch

Controles DEBUG autorizados pelo proprietário existente do benchmark, sem nova API de produção:

- nCtx: 1024, 2048, 4096 ou 8192; padrão normal 8192.
- nBatch: 32–1024; padrão normal 512.
- nUbatch: 32–512, independente; padrão normal 512.
- Requisitos: ubatch <= batch <= contexto. O runtime ainda valida as exigências específicas do modelo e o orçamento do prompt/saída.

Mudança efetiva solicita contexto novo no mesmo proprietário nativo serializado, com o ticket de cancelamento existente. Libera batch e contexto antigos antes de alocar os novos, preserva os pesos, reinicializa a contabilidade/ledger e não mantém dois KV completos. A reconciliação híbrida mantém sua proteção anterior. Requisições iguais não recriam desnecessariamente o contexto. Na próxima geração normal restaura automaticamente o contexto padrão antes da inferência; a configuração experimental não é persistida como padrão.

A ligação usa llama_context_params.n_ctx/n_batch/n_ubatch e os getters oficiais llama_n_ctx/n_batch/n_ubatch. O laço já existente de prefill usa o batch aplicado, em vez da constante 512, e o limite de overflow usa a capacidade real. Essas duas adaptações são necessárias para o controle não ser meramente visual. Não alteramos o algoritmo de truncamento, tokenização, template ou reutilização.

Falha de criação ou confirmação retorna erro e libera o contexto parcial. A recuperação de erro/carregamento Kotlin existente permanece. Não implementamos novo recovery system. O caminho antigo de benchmark do SDK cria seu contexto sem importar as configurações do laboratório.

## KV suportado e restrições

Foram auditados llama-context.cpp, llama-kv-cache.h e llama-memory-hybrid.cpp desta revisão. O cache de atenção aceita ggml_type K e V separados, incluindo F16 e Q8_0. Em llama_memory_hybrid, mem_attn recebe type_k/type_v e mem_recr recebe type_r/type_s distintos. Portanto não há razão para confundir quantização do cache de atenção com reutilização KV-only de estado recorrente.

Expostos apenas F16 e Q8_0 separados. Não anunciamos todos os tipos compilados como seguros para todos os modelos. V Q8_0 exige FA ON explícita; Auto/OFF são bloqueados para evitar habilitação implícita de FA. Modelos puramente recorrentes sem cache de atenção confirmável não recebem Q8. O construtor oficial valida alinhamento/dimensões e pode recusar um GGUF específico. Isso vira erro, sem alterar o modelo ou promover fallback silencioso.

Foi acrescentado um pequeno observer somente leitura no core: consulta o tipo real do tensor através dos getters já existentes de llama_kv_cache e, para híbridos, get_mem_attn(). Implementação de memória desconhecida retorna indisponível; pedidos Q8 sem confirmação são recusados. Não há mudança de kernels, matemática, versão upstream, R/S recorrentes ou Flash Attention internals.

Qwen3.5 híbrido continua sem prefix/KV-only reuse. Nenhum guard foi removido ou enfraquecido. Aceitar construção de um contexto novo com atenção Q8 não constitui validação física de qualidade ou estabilidade: requer teste no Samsung. F16/F16 permanece normal.

## Backend e GPU

CPU normal continua automática. Conservadora permanece um experimento do próximo processo, com solicitado/efetivo separados e sem hot-swap. Não se repetiu teste conservador. GPU/offload indisponível nesta build CPU; GPU layers efetivo continua medido, esperado 0, sem slider falso. Nenhum OpenCL/Vulkan/HTP ou dependência foi adicionado.

## Requested / configured / effective e A/B

Controles editados são pedidos; a UI explica recriação na execução. Snapshots A/B exibem os pedidos e o runtime observado ao salvar, sem chamar esse snapshot de aplicação do braço. Resultados exibem os getters reais, FA configurada/efetiva e tipos de tensor reais. contextExperiment registra requested, configured, state e recreationUs. Valores ausentes são N/D; contextos falhos não são READY.

A/B inclui nCtx/nBatch/nUbatch/FA/typeK/typeV nos snapshots, diferenças e configuração exportada, junto dos campos já existentes: systemPromptVariant, threads independentes, seed, sampler e modelo. Mudança de backend de processo entre salvar/executar é bloqueada. A/B de system prompt continua exigindo TODOS os outros campos idênticos. O experimento factual é byte a byte preservado e não foi promovido ao chat.

Repetições padrão 3, referência de seed 424242, fixture sky-v1, ordem A1 B1 A2 B2..., prompts, limites e cálculos existentes de TTFT/prefill/decode/medianas permanecem. Mudanças de contexto são uma condição experimental declarada, não um benchmark silenciosamente equivalente ao anterior. A recriação está dentro do tempo da requisição (TTFT nativo e callback); recreationUs/milliseconds separado permite identificar esse custo. Compare condições frias/mornas equivalentes, consultando esse campo. Não subtraímos o custo para fabricar uma melhora.

## JSON e privacidade

Schema haruna-lab-v1 preservado com campos aditivos em configuration/runtime/contextExperiment e nativeTotalMs/decodeMs/contextRecreationMs. O solicitado nativo retém somente os seis parâmetros técnicos novos; não copia referências, mensagens ou caminhos. Identificador systemPromptVariant continua sem conteúdo do system prompt. Exportação mantém somente escalares técnicos, sem respostas, prompt, documentos ou histórico pessoal. Respostas completas continuam temporárias na RAM para inspeção humana. Perfis locais antigos sem campos novos são mesclados aos padrões ao selecionar o perfil. O teste reproduziu a seleção de um perfil antigo após um experimento com contexto 2048/FA OFF: os campos ausentes devem voltar a 8192/512/512/Auto/F16, sem herdar silenciosamente o experimento anterior. Esse caso de compatibilidade dos controles novos foi corrigido dentro do escopo.

## Validação e limites

Automatizado: política de seleção de threads por metadados/CPU; controlador de contexto com mocks e ASan/UBSan (recriação, uma única alocação ativa, restauração, falha/recuperação, batch/ubatch independentes, tipos/FA inválidos); browser real com bridge simulado para A/B e novos campos; regressão do experimento de system prompt; UI responsiva 360/768; exportação; guards de escopo; checks anteriores de streaming/RAG/prefixo/voz e compilação Kotlin/Android/native.

Os resultados efetivamente executados e o build são registrados pelo CI, sem simular inferência. Limitação: testes com mocks comprovam validações/fluxos, não execução numérica de GGUF. Não foram executados benchmarks, download de modelos, microfone, áudio, inferência física nem comparação de qualidade nesta tarefa.

Requer validação física no Samsung SM-A155M: normal Qwen2B 2/6, Phi preservado, FA Auto/ON/OFF efetivo, dimensões e Q8 aceitos pelo modelo, qualidade factual, memória/temperatura/estabilidade, cancelar durante recriação/prefill/decode, retornar ao chat e confirmar defaults restaurados. As chamadas oficiais de criação de contexto não oferecem cancelamento granular desta alocação; o ticket continua válido e o cancelamento é observado no retorno/antes do prefill. Testar isso no aparelho.

Nenhum problema fora do escopo foi corrigido. O caso de degeneração numérica anterior permanece sem conclusão causal e sem máscara. Recorrentes puros/outros layouts de memória podem não disponibilizar tipos efetivos; são tratados como indisponíveis. Não há garantia universal de que Q8, FA OFF ou contexto menor sejam melhores.

## Roteiro físico

1. Chat normal Qwen3.5 2B: copiar DBG e confirmar 2/6, 8192, 512/512, F16/F16, FA Auto e CPU automática. Não esperar TTFT fixo.
2. Laboratório: salvar baseline A com 2/6, seed424242, 3 repetições, prompt atual; copiar/exportar JSON.
3. Alterar apenas FA para OFF em B; conferir solicitado/configurado/efetivo e recreationUs. Avaliar respostas e não apenas taxas.
4. Restaurar baseline; variar batch e ubatch separadamente, depois contexto, depois K/V (V Q8 exige FA ON). Confirmar valores reais e erros sem crash.
5. System prompt A=current/B=factual com TODOS os demais campos idênticos; conferir respostas temporárias e exportação sem conteúdo.
6. Retornar ao chat normal: verificar restauração de contexto e F16/F16, personalidade original, CPU automática; testar Phi sem promoção 2/6.

ETAPA 7 — CONTROLES DE CONTEXTO/FA/KV IMPLEMENTADOS — AGUARDANDO VALIDAÇÃO NO SAMSUNG SM-A155M
