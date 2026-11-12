# Haruna Overdrive — Android

Base preservada: `9d36cbae23b980b933acb95bf50f8657a08d935a`, branch `integration/haruna-multiplatform-20261111`. Checkpoint local/publicado: `checkpoint/pre-overdrive-20261112`. Implementação isolada em `feature/android-overdrive`.

## Comparação com PocketPal

Referência pública MIT: https://github.com/a-ghorbani/pocketpal-ai, commit `6f46cfe9fece64e37e57589af57c83806294ed58`, package 1.23.0, `llama.rn` 0.13.0-rc.9.

Arquivos consultados: `src/api/completionEngines.ts`, `src/utils/completionSettingsVersions.ts`, `src/store/ModelStore.ts`, `src/utils/thinkingCapabilityDetection.ts`, `src/utils/chat.ts` e configurações de benchmark. PocketPal passa mensagens estruturadas ao contexto nativo de llama.rn, usa GGUF/Jinja, permite samplers/configurações por modelo, preserva contexto e respeita limites independentes de batch/microbatch. Seus padrões não são uma prova de desempenho ideal em outro aparelho; GPU e FA dependem da plataforma.

A Haruna já possuía o núcleo `llama.cpp` fixado em `4d71b42fd87db24b8b7c808c151b713aa4459cfd`, formatador Jinja oficial `common_chat_templates_apply`, política de CPU ARM com KleidiAI/repack, ledger de prefixo por tokens exatos, cache híbrido com estado completo, tickets de cancelamento e streaming com ACK. Substituir a aplicação por React Native/llama.rn não seria uma correção necessária para usar essas APIs e colocaria voz/imagens/dados em risco. Foi estendida a integração existente, sem dois motores textuais paralelos nem atualização especulativa do núcleo. Nenhum código TypeScript/UI do PocketPal foi incorporado; sua licença MIT e autoria estão incluídas nos assets como referência.

## Causas observadas e mudanças reais

- Antes, somente Qwen35 híbrido recebia histórico persistente completo. Outros modelos recebiam quatro pares, com mensagens cortadas em 1600 caracteres e orçamento de 3200 caracteres. Isso excluía contexto e deslocava os prefixos, limitando o cache do SmolLM3. Agora todos os GGUF carregados recebem pares completos e estáveis (até 62 pares / 160 mil caracteres como limites de transporte). O nativo conta tokens pelo tokenizer real e remove pares antigos somente quando é necessário caber no contexto e na saída reservada. Não há eliminação de mensagens do histórico persistido.
- O tratamento especial de memória híbrida Qwen permanece intacto. Outros modelos continuam usando apenas o caminho de memória que o runtime declara compatível. Alterações/edições, troca de conversa e mudança de contexto continuam invalidando/reconciliando o estado por tokens e owner, sem KV-only reuse híbrido.
- O sampler normal anteriormente tinha temperatura global 0,3 e nenhum controle normal por modelo. Agora existe um JSON confiável de configuração normal separado do JSON DEBUG/lab no JNI. Sampler e threads são aplicados pelo mesmo owner serializado. Preferências têm chave SHA-256 do caminho privado do modelo e persistem em SharedPreferences. Restaurar remove somente a preferência daquele modelo.
- Penalidades agora recebem também os tokens efetivos do prompt (incluindo tokens reutilizados), como tokens não gerados no `common_sampler_accept`; grammar continua reservada para tokens gerados. O benchmark lab permanece isolado dessa mudança.
- SmolLM3 é identificado preferencialmente pelo `general.name` do GGUF (nome do arquivo apenas como fallback). Usa temperatura 0,6/top-p 0,95 conforme o model card oficial. Top-K 40/min-P 0,05 e repetição 1 preservam os valores anteriores até testes físicos. Outros modelos mantêm temperatura padrão 0,3 e podem salvar sua própria configuração. Não se afirma que um perfil seja universalmente ideal.
- A saída normal deixa de ser forçada pelo JavaScript a 256/512 tokens: o padrão do modelo é 1024, configurável entre 16 e 4096, com reserva mínima de entrada validada. Classificador de intenção e benchmarks continuam enviando seus limites explícitos. Isso é um limite de segurança ajustável; EOS/cancelamento/limite continuam distintos nas métricas.
- Contexto 1024/2048/4096/8192, batch 32..1024 e microbatch 32..512 independentes, com microbatch ≤ batch ≤ contexto. Reutiliza a recriação de contexto já auditada; solicitado/configurado/efetivo não são confundidos. FA auto/on/off; K/V normais permanecem f16/f16. Threads 0 preservam a política existente (incluindo Qwen 2B 2/6 nos aparelhos compatíveis). mmap continua solicitado por padrão; não se afirma residência física de cada tensor.
- Streaming WebView preservado: primeiro lote imediato, buffer limitado, ACK, RAF, checkpoints e cancelamento por ticket. Não se renderiza toda a conversa a cada token. Nenhum scheduler ou serviço de RAM paralelo foi criado.

## SmolLM3: fontes verificadas

https://huggingface.co/HuggingFaceTB/SmolLM3-3B/blob/main/README.md
https://huggingface.co/HuggingFaceTB/SmolLM3-3B/blob/main/chat_template.jinja

O template oficial distingue `/think` e `/no_think` por `enable_thinking`. A detecção usa a API oficial `common_chat_templates_support_enable_thinking`; falha de sondagem permanece desconhecida e nunca impede carregar o GGUF. A integração passa o booleano ao Jinja do GGUF; não injeta outro template, não substitui identidade e não reescreve mensagens. Templates GGUF diferentes ainda podem apresentar limitações próprias. As mesmas fontes não comprovam desempenho/qualidade com determinada conversão Q4.

## Interface e instalação

Nome de launcher: **Haruna Overdrive**. Application ID: `com.proxyslabs.haruna.overdrive`; versão 1.1.0-overdrive, ARM64. Instala ao lado da Haruna anterior. A outra aplicação e seus diretórios privados não são tocados. Dados e modelos não são copiados automaticamente entre sandboxes; o usuário pode importar seus arquivos originais no novo aplicativo.

Configurações → Modelos de IA → Linguagem → Inferência avançada. Controles recolhidos, com validação, salvamento por modelo e restauração. Thinking permanece no botão existente. A seção mostra TTFT nativo, prefill/decode, tokens, cache, contexto/batch/threads efetivos, backend, FA, K/V e buffers de contexto. Métricas ausentes permanecem N/D. Atualização somente com a seção visível; usa os snapshots existentes. Não inclui prompts, respostas ou documentos na exportação técnica.

## Preservação e limites

Identidade, personalidade, RAG, memória, voz, geradores MNN/Nezumi/stable-diffusion.cpp, importadores, modelos e histórico mantidos. Bibliotecas não foram trocadas. CPU ARM64 continua como backend normal: não há evidência de estabilidade Vulkan neste aparelho para habilitá-lo automaticamente. Os controles experimentais de offload existentes não foram removidos; build CPU não anuncia aceleração GPU inexistente.

Não há acesso ao Teclast/Samsung nesta execução. Nenhum número de TTFT, ganho de velocidade, qualidade factual, consumo físico ou equivalência ao PocketPal foi inventado. O APK integrado precisa ser medido no dispositivo com o mesmo SmolLM3 Q4, prompt, histórico, modo de raciocínio e parâmetros para quantificar qualquer diferença. Na 1.1, o prefixo estático do SmolLM3 pode ser preparado durante o carregamento; esse custo não desaparece e não conta como aceleração do cálculo frio. Veja [SMOLLM3_CPU_STARTUP.md](SMOLLM3_CPU_STARTUP.md) para mecanismo, métricas e limites.

## Verificações

- Sintaxe do JNI completo com headers reais do llama.cpp fixado (stubs somente das APIs Android/log e JNI do host); não equivale a inferência.
- Testes de ledger KV e estado híbrido completo, ownership, prefixo exato, edições, cancelamento/rollback e restauração: passaram.
- Kotlin puro de preferências: perfis, validação estrita, threads independentes, limites de contexto/saída: passou. Testes JUnit equivalentes adicionados ao build.
- Streaming JS/ACK, histórico completo, classificador de imagem, integridade da UI e orbe: passaram.
- Navegador com ponte simulada em 360×800 e 800×1280: seção, controles, persistência/reload, restauração, métricas e ausência de overflow passaram. Não é teste de inferência.
- Build Android automatizado executa `:app:testDebugUnitTest :app:assembleDebug`, confirma package/label/ARM64 e publica APK/hash. O resultado final do workflow é informado na entrega.
