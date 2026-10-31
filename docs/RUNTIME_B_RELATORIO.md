# HARUNA — ÚNICO EXPERIMENTO DE RUNTIME LLAMA.CPP

## Segurança e identificação

Base Haruna A: 2231fc7480ec0d6c4ca4434f8f76feb06c64e385.
Branch A preservada: feature/haruna-stage6-offline-voice.
Checkpoint novo anterior às alterações: checkpoint/haruna-before-runtime-b-2231fc7, apontando para a mesma base.
Branch B: experiment/llama-runtime-b. Não se promove a experiência para a branch funcional.

Controle A já compilado: https://github.com/doutor56-lab/Haruna/actions/runs/41162741917/artifacts/13027454557
APK A: Haruna-stage7-context-lab.apk.
SHA-256 A: 9895962cacc3baa66fcfec01e386f9faab0f24abca80cbbcee03130231806b8a.

B instala no pacote separado com.proxyslabs.haruna.runtimeb, rótulo Android Haruna B, versão 0.7-debug-lab-runtime-b. Namespace Kotlin/JNI continua com.proxyslabs.haruna; não renomeamos classes ou métodos nativos. Interface interna preservada. A instalação não atualiza, desinstala, migra ou limpa a Haruna A. Seus modelos, conversas e preferências continuam no sandbox A.

Cada APK contém UM libllama/runtime LLM. As variantes CPU do mesmo runtime continuam sendo bibliotecas auxiliares da seleção automática existente, não dois motores selecionáveis. Não existe seletor de runtime. Whisper e sherpa de voz continuam exatamente como na base.

## Diagnóstico curto do controle

llama.cpp A: 7894e8b92481a8bb8ffe94f73b656ffe0dd01e10, commit upstream de 24/10/2026. Portanto a base já é recente; não é correto culpar uma versão antiga sem medição.

Integração: LlamaCppBackend -> AiChat/InferenceEngine -> llama.android/lib -> C++/llama.cpp. A fonte Android é compilada com NDK 29.0.13113456, CMake 3.31.6, C++17, Release e ABI ARM64. São mantidos GGML_NATIVE=OFF, GGML_BACKEND_DL=ON, GGML_CPU_ALL_VARIANTS=ON, GGML_LLAMAFILE=OFF, KleidiAI ON e OpenMP ON. REPACK segue a configuração anterior; nenhum flag é alterado neste experimento. KleidiAI permanece v1.32.0 na configuração upstream das duas revisões.

O registry carrega variantes do diretório nativo e escolhe a CPU automaticamente. No Samsung foi observado armv8.2_2, DOTPROD/FP16 disponíveis e I8MM indisponível. A presença de kernels compilados não prova uso de todos. O fallback genérico/conservador existente não é forçado. CPU/GPU layers=0 e ausência de backend GPU permanecem. Nenhuma inferência no CI reproduziu essas medições físicas; são referência informada pelo usuário.

## Revisão B escolhida, não latest

llama.cpp B: 4d71b42fd87db24b8b7c808c151b713aa4459cfd, commit upstream de 26/10/2026:
"ggml-cpu : rewrite concat as one row kernel for all types (#31179)".
Fonte: https://github.com/ggml-org/llama.cpp/commit/4d71b42fd87db24b8b7c808c151b713aa4459cfd

Justificativa: o commit reescreve o CONCAT da CPU para copiar linhas densas com memcpy, distribuir linhas entre threads e tratar fontes transpostas em tiles de 32, melhorando localidade. O código antigo dividia principalmente por i2, frequentemente igual a 1. O próprio commit adiciona teste/perf específico para o layout "delta-net conv input": estado de convolução seguido de QKV transposto do ubatch.

Isso é diretamente relevante ao Qwen3.5: src/models/qwen35.cpp chama build_conv_state; src/models/delta-net-base.cpp transpõe qkv_mixed e executa ggml_concat(ctx0, conv_states, qkv_mixed, 0). Esse grafo é idêntico nas duas revisões, mas a implementação CPU da operação muda. A melhoria não exige I8MM, SVE, GPU, Qualcomm ou HTP. O Samsung pode executá-la com o caminho CPU existente. Esse vínculo é uma hipótese técnica melhor que escolher a tag mais nova por data.

Não afirmamos que CONCAT seja a maior parte dos 11–15 s. Matmuls e demais operações podem continuar dominantes. A hipótese só pode ser aceita/rejeitada pelo teste físico. TalkToMe serve como referência de viabilidade, sem copiar código, assets ou presumir uso de GPU/HTP.

A revisão selecionada está 54 commits após o controle, não consiste exclusivamente no CONCAT. Inclui alterações upstream de modelos não usados, guardas de parser/gramática, implementação iterativa de estruturas do vocabulário e correções de memória. O assembly de samplers em common/sampling.cpp, o grafo Qwen3.5/delta-net e os arquivos da integração/build Android e KleidiAI são idênticos entre A e B. Existem mudanças upstream no interpretador Jinja/common/chat; não alteramos o template do GGUF nem o prompt da Haruna. Conferir a entrada efetiva no teste é obrigatório. Um ganho provaria diferença entre essas revisões completas, não causalidade exclusiva de um kernel.

## Integração mínima e arquivos

- third_party/llama.cpp: gitlink atualizado para a única revisão B fixada.
- app/build.gradle.kts: somente applicationId e versionName do APK isolado.
- app/src/main/AndroidManifest.xml: somente rótulo Android Haruna B.
- scripts/check_runtime_b_scope.py: guard de escopo, fonte fixada e equivalência dos arquivos relevantes de build/grafo/sampler.
- docs/RUNTIME_B_RELATORIO.md: este relatório.
- Workflow separado .github/workflows/runtime-b.yml na branch de build, fixando fonte, revisão e a mesma toolchain.

Os patches existentes de diagnóstico, JNI, cancelamento, prefixo, contexto, FA/KV, streaming e bindings foram aplicados sem modificações. Não foram necessárias adaptações de API. Nenhuma alteração própria em kernels. Nenhuma nova dependência de aplicativo.

HarunaIdentity e variante factual continuam byte a byte iguais à base. O experimento factual não foi promovido. Proteção contra reuse híbrido/recorrente intacta. Não mudamos o backend automático, parâmetros normais, n_ctx, K/V, samplers, memória, RAG, histórico, voz, arquivos, downloads, modelos ou UI interna.

## Condições iguais do único teste

Usar no Laboratório dos DOIS APKs, não misturar um resultado do chat com um resultado do laboratório:

Modelo: exatamente o mesmo arquivo Qwen3.5 2B Q4_K_M, mesmo nome de arquivo e bytes, importado manualmente em B pelo gerenciador existente. Não há download, conversão, requantização ou cópia automática entre sandboxes. Não manter ambos os aplicativos com modelo residente; encerrar A antes de carregar B.

Restaurar Haruna padrão no laboratório em A e B e ajustar os mesmos campos:

System Prompt: Haruna atual (current).
Threads decode/batch: 2/6.
Contexto: 8192.
Batch/ubatch: 512/512.
K/V: F16/F16.
FA: OFF explícita, confirmar configurada disabled e efetiva inativa/0 nos dois.
CPU: atual/automática, confirmar a variante efetiva no resultado.
Seed: 424242.
Temperature: 0,3; topK:40; topP:0,95; minP:0,05; presence:0; frequency:0; repeat:1.
Max output:256.
Thinking: OFF; histórico sintético:OFF; RAG:OFF; cache:OFF.
Repetições:3.
Prompt canônico existente: "Explique em português, em três frases completas, por que o céu parece azul."

Esses são os valores do protocolo controlado, não novos padrões globais. Não se altera o harness, suas fórmulas, aquecimento/ordem, timers ou número padrão de repetições. O pedido FA OFF é do laboratório nos dois APKs; não forçamos OFF nos defaults normais. Não testar V=Q8_0 aqui.

## UM roteiro físico comparativo

1. Manter o APK A instalado. Instalar B separadamente e importar manualmente o MESMO GGUF local. Se possível conferir SHA-256 do arquivo original usado; nenhum hash de modelo foi inventado/medido pelo CI.
2. Com aparelho frio/condições térmicas semelhantes, A: carregar modelo, aplicar os campos acima, executar um lote de três repetições e exportar JSON sem respostas. Inspecionar as respostas temporárias e copiar o DBG. Não modificar configurações entre repetições.
3. Encerrar completamente A para liberar seu modelo, deixar o aparelho voltar à condição térmica semelhante; B: carregar o mesmo modelo e executar o mesmo lote de três repetições. Exportar JSON e conferir respostas/DBG. Não trocar outras variáveis.
4. Validar antes de comparar: mesmo arquivo, nome, parâmetros e systemPromptVariant; mesmo total de tokens de entrada e template formatado do fixture no inspector; backend/FA/KV efetivos corretos; ausência de erros NaN/Inf/contexto; estabilidade e respostas coerentes. Se entrada/FA/backend forem diferentes ou houver erro, o ensaio não é equivalente e não prova ganho.
5. Comparar medianas de TTFT callback e nativo, prefill ms/tok/s, decode, RAM e thermal; registrar recreationUs, pois a recriação inicial de contexto FA OFF tem custo nos dois APKs. Não subtrair seletivamente esse custo. Conferir stop reason e respostas humanas, não apenas velocidade.

Uma mudança aproximada de 11–15 s para 10–13 s NÃO deve ser declarada solução. Sem ganho substancial ou se houver regressão de qualidade/estabilidade, encerrar este experimento e manter A. Não iniciar outros runtimes, flags, threads, contextos ou KV automaticamente.

O teste da geração canônica também valida carregamento e pipeline de conversa; uma breve conversa normal em B pode confirmar funcionalidade, mas não deve ser misturada às métricas do laboratório, pois o chat preserva FA Auto como na base.

## Validação e riscos

Build Android e testes focados são registrados pelo CI, junto de commit final, APK e SHA-256. Não executar inferência com modelos no CI. Não há TTFT B, baseline novo ou conclusão física nesta entrega.

Riscos conhecidos: revisão upstream pode introduzir regressão numérica ou comportamento distinto mesmo com samplers iguais; nova implementação não implica melhoria substancial; o arquivo GGUF específico e a semântica real do template exigem validação física. Não habilitamos reuse de estado híbrido. Pacote B tem sandbox e permissões próprios e precisa da importação manual do modelo; não verá memórias/conversas/configurações de A, por projeto. Isso mantém o controle protegido e o benchmark isolado de dados pessoais.

Não foram corrigidos bugs externos ao escopo. Não houve mudança em STT/TTS, dados ou padrões da Haruna A. O controle pode ser retomado simplesmente abrindo A/encerrando B; o checkpoint e o APK A acima preservam também o código e instalador exatos. Nenhuma promoção automática será feita.

EXPERIMENTO ÚNICO DE RUNTIME PREPARADO — AGUARDANDO COMPARAÇÃO FÍSICA A × B NO SAMSUNG SM-A155M
