# Overdrive 1.1: CPU e primeiro turno do SmolLM3

Base: `357b2d09e4f42d80e045a94eaec0308662576613`, branch `feature/android-overdrive`. Checkpoint: `checkpoint/overdrive-1.0.0-357b2d0`. Runtime continua `4d71b42fd87db24b8b7c808c151b713aa4459cfd`; não há downgrade ou troca de GGUF. Package `com.proxyslabs.haruna.overdrive`, launcher Haruna Overdrive, versionCode 14, separado da Haruna original. O package é o mesmo da Overdrive 1.0, mas o artefato CI tem assinatura diferente e não pode substituí-la como atualização; veja abaixo.

## Evidência física recebida

Samsung SM-A155M, Android 16, SmolLM3-Q4_K_M 3B, Pensar desligado, pergunta “me fala sobre o bico do papagaio”. Modelo já carregado. Haruna 1.0.0:

| Medida | Valor informado pelo diagnóstico |
| --- | --- |
| Entrada / realmente avaliada | 565 / 565 tokens |
| Prefill | 35,69 s; 15,83 tokens/s |
| Primeiro token nativo / texto no DOM | 36,00 / 36,15 s |
| Saída / decode | 227 tokens / 58,11 s; 3,91 tokens/s |
| Threads / FA / backend | 4/4; ativa; CPU ARMv8.2 |
| Cache após turno | válido, 793 tokens; nenhum erro KV/NaN |

O usuário informou aproximadamente 6 s no PocketPal. Sem diagnóstico equivalente daquele aplicativo, isso não prova igualdade de prompt, parâmetros ou backend selecionado. O repositório público confirma que CPU é o padrão Android; não se pressupôs aceleração GPU. A diferença entre o primeiro delta nativo e a interface é pequena: não há evidência para reescrever streaming ou WebView.

## Mudanças

1. Pools CPU oficiais GGML persistentes, separados para decode/batch quando necessário, reutilizados entre grafos. O wrapper direto não os anexava; a referência llama.rn `v0.13.0-rc.9`, usada pelo PocketPal, chama `common_init_from_params`, que cria pools persistentes. A build LLM usa pthreads, sem OpenMP, preservando REPACK/KleidiAI e as variantes ARM existentes. Isso visa o custo nativo por geração e por token; nenhum ganho físico foi presumido.
2. Liberação sincronizada dos pools antes de destruir/recriar o contexto ou alterar threads. Um pequeno helper aplicado ao `llama-context.cpp` limpa também o ponteiro do backend CPU antes de liberar os pools. Apenas `llama_detach_threadpool` não limpa essa referência. Nenhum kernel foi reescrito.
3. Política automática específica do SmolLM3: 80% dos CPUs permitidos, arredondado para baixo (6/6 quando há 8), ou todos quando há até 4. É o critério da referência, não uma conclusão de benchmark no Samsung. Valores explícitos salvos continuam valendo. Qwen 2B permanece 2/6; os demais modelos mantêm sua política anterior. FA padrão SmolLM3 passa a OFF, conforme recomendação Android da referência; preferências explicitamente salvas não são sobrescritas. Sampler, KV, contexto e batch não foram alterados por esta correção.
4. Durante o carregamento do SmolLM3, processa até 512 tokens do prefixo estático da identidade, excluindo uma margem do final. Snapshot completo oficial `LLAMA_STATE_SEQ_FLAGS_NONE`, volátil, até 64 MiB, somente com margem de RAM. Não inclui perfil pessoal, RAG ou histórico. Não se aplica a modelos híbridos/recorrentes. Não é um cache KV forçado para Qwen.
5. Primeiro pedido restaura o snapshot somente com modelo, contexto, template, thinking e threads compatíveis e igualdade exata dos tokens. Alterações no prefixo seguem a reconciliação normal. Um prefixo válido maior da conversa tem prioridade sobre o snapshot estático. Descarregar/recriar o contexto libera o snapshot.
6. “Preparando” permanece até terminar esse trabalho. O botão Enviar e Enter aguardam, sem consumir o rascunho. Erros reais de preparação não viram sucesso; os recursos são liberados e a falha é propagada. Falta de orçamento do snapshot apenas mantém o caminho normal de prefill.

**Preparar o prefixo transfere trabalho para o carregamento. Não acelera fisicamente esse cálculo nem demonstra TTFT frio menor.** O custo aparece separadamente como `runtime.startup.preparationUs`, `chargedTo=model_loading`, tokens/bytes e restore por pedido. Repetições canônicas sem configuração normal não restauram esse snapshot; o teste verifica que todos os tokens são avaliados mesmo com o snapshot disponível. Pesos podem estar aquecidos após carregar: isso deve ser informado em qualquer comparação de cold start.

DBG e Inferência avançada mostram pools anexados, threads efetivos, preparação no carregamento, tokens do prefixo e restore. Não exportam conteúdo do snapshot, prompts, respostas ou perfil pessoal. Fórmulas e métricas nativas de TTFT/decode continuam iguais.

## Verificação e limites

- Teste de inferência real no host com GGUF **aleatório**, arquitetura SmolLM3 de quatro camadas, incluindo RoPE e NoPE. Não é um modelo capaz de responder nem um benchmark Android. Processamento integral versus restore/exato apresentou erro quadrático normalizado de logits menor que `1e-8`, com todos os valores finitos.
- Exercita prefill parcial, continuidade do prefixo maior, edição, reset, benchmark integral com snapshot disponível, troca de pools seguida de decode, descarregamento/recarregamento e ausência de orçamento. Usa o JNI de produção, com apenas transporte JNI/Android log substituídos no host.
- Reprodução: `bash tests/native/run_startup.sh` em Linux com JDK, CMake >=3.28, compilador C++17 e dependências numpy/gguf-py. Não baixa GGUF de usuário ou executa nuvem.
- Compilação Kotlin do backend contra a interface gerada; validação de preferências; testes de prefixo/estado híbrido, contexto/threads, streaming, histórico, classificador de imagens, privacidade do laboratório e UI em 360x800/800x1280.
- `scripts/check_incremental_scope.py` é histórico e fixa uma base anterior à integração de imagem/voz/documentos; seu allowlist de árvore completa não se aplica à branch Overdrive. Não foi reescrito para esconder isso. Preservação desta correção é comparada com a base 357b2d0: identidade, personalidade, variante factual, streaming, proteções híbridas, RAG, voz, imagens, armazenamento e Windows não foram modificados.

Não há aparelho Android conectado. **Depois da alteração, TTFT, velocidade de escrita, qualidade, estabilidade térmica e consumo de memória no Samsung ainda requerem validação física.** Não há demonstração de equivalência de velocidade ao PocketPal nem de meta <=5 s. Comparar uma resposta à mesma pergunta, no mesmo GGUF, Pensar OFF, primeiro após “Carregado” e depois na mesma conversa. O diagnóstico deve incluir preparação no carregamento, entrada/avaliados/reutilizados, prefill, native TTFT, decode e threads/FA efetivos. Não é necessário repetir uma matriz de parâmetros.

O resultado do build Android e o link do APK são informados na entrega do workflow. Uma compilação aprovada não comprova aceleração no aparelho.

## Resultado do build e compatibilidade de instalação

- Código compilado: `344354e646b7f09986bef10f02800d7a9a429fe0`.
- Actions: https://github.com/doutor56-lab/Haruna/actions/runs/43209575813 — sucesso, `:app:testDebugUnitTest :app:assembleDebug`, 19 min 47 s de Gradle.
- Nome/package/ARM64 confirmados pelo `aapt` no workflow.
- Artefato: https://github.com/doutor56-lab/Haruna/actions/runs/43209575813/artifacts/13941558032
- Arquivo no ZIP: `Haruna-Overdrive-ARM64.apk`; SHA-256 conferido com `SHA256SUMS.txt`: `80de3afad0eacefdfd7d2c97df1be980a26f84027207672d1b23a7c4053f3b5e`.
- ZIP SHA-256 informado pelo GitHub: `e24d41bea9ae9a17e9ba6b087a90a8940bedaa017ab46efeadd757e1624fbdd8`.

**Impedimento confirmado para atualizar a instalação anterior:** comparação dos certificados públicos extraídos dos blocos de assinatura dos dois APKs mostrou chaves de debug diferentes. A build existente usa assinatura debug gerada no runner e não configura uma chave persistente. Certificado 1.0: `f2639655e2618538f597a093412be94e1a61cb544b1ee967c26fef3c17414075`; certificado 1.1: `f4720d206be6e72210ec662f5f57b0db7ad1add0613aef5e6dd1287410ac1146` (SHA-256 dos certificados, não dos APKs).

O APK novo é destinado a instalação nova; Android recusará atualização sobre aquele APK 1.0. **Não desinstalar nem limpar dados da Overdrive existente para contornar isso.** Para atualizar preservando o sandbox é necessária a chave privada usada no APK anterior. O certificado público não permite recuperá-la. Não foi criado outro applicationId, não se tentou contornar a verificação Android e não foi iniciada outra compilação. O baseline e seus dados permanecem intocados; a compatibilidade de atualização está pendente da chave anterior. O sucesso da compilação não é uma entrega de atualização compatível nem prova de ganho físico.
