# Overdrive 1.2: transcrição e início da leitura

Base `c2b4e17`, checkpoint `checkpoint/overdrive-before-speech-c2b4e17`, branch `feature/android-overdrive`. Versão `1.2.0-overdrive`, versionCode 15, mesmo package `com.proxyslabs.haruna.overdrive`. Sem migração, exclusão de arquivos ou alteração de preferências/modelos selecionados.

## Trabalho removido da espera

- STT: o worker do microfone captura enquanto outro worker, único e serializado, prepara o reconhecedor. A transcrição espera os dois terminarem. Não há inferência na thread principal nem múltiplas transcrições simultâneas.
- sherpa-onnx: o `OfflineRecognizer` pode ser reutilizado; cada fala recebe um `OfflineStream` novo, liberado ao terminar. Não são reaproveitados texto ou stream da fala anterior.
- whisper.cpp: o modelo/contexto permanece em uma sessão nativa identificada por handle opaco. `no_context=true` continua ativo. Handles têm ownership com `shared_ptr`; unload remove o registro e solicita cancelamento, mas não destrói um contexto que o decoder ainda esteja usando. O abort callback oficial observa um flag por sessão. Reset do cancelamento ocorre na preparação, antes da verificação do ticket, nunca incondicionalmente ao entrar no decode.
- Tiny/Base podem ficar até 30 segundos aquecidos quando há ao menos 1 GiB disponível, sem sinal de pouca memória e sem motor de imagem/visão ativo. Small não fica retido. Troca, instalação, remoção, erro, fechamento e pressão de memória liberam sessões em uma fronteira segura. Parar uma captura ativa cancela/descarta o resultado; parar um microfone já ocioso durante a passagem para TTS não joga fora um cache pequeno válido.
- A admissão de carregamento verifica RAM disponível e sinal de low-memory: margem estimada `max(512 MiB, 2 × archiveBytes)`. É uma estimativa conservadora, não uma garantia contra OOM. Instalar continua independente dessa verificação de execução.
- A carga/descarregamento GGUF já existente drena os caches de voz ociosos nos seus workers; o mesmo descarregamento abre espaço para imagem/visão. Um registro pequeno de callbacks conecta essa liberação, sem monitor ou serviço novo de RAM. Sessões em uso não são liberadas por esse caminho.
- TTS: durante a troca para o microfone, o áudio sempre para. Para Tiny/Base, a voz pode permanecer aquecida se houver ao menos 1,5 GiB livre; TTS revalida a condição no próprio worker. Com menos margem ou modelo grande, mantém a liberação anterior. O mecanismo existente de expiração de TTS em 30 segundos permanece.
- Primeiro trecho de áudio: fila JS aceita uma primeira frase a partir de 24 caracteres e limita o primeiro bloco a 120; demais blocos mantêm 48/280. A divisão nativa de leitura usa até 120 caracteres no primeiro bloco e mantém 240 nos seguintes. Palavras, pares UTF-16, ordem, filtro de thinking e o conteúdo completo são preservados. Não muda a velocidade de reprodução escolhida pelo usuário.

A captura continua usando o Silero VAD existente, incluindo os 450 ms de silêncio. **Whisper continua transcrevendo trechos completos; não há resultados parciais simulados.** Carregar durante a captura sobrepõe trabalho, não elimina o custo frio. Na API offline sherpa atual não há abort cooperativo exposto: após cancelar, a operação nativa em andamento pode precisar terminar, sem entregar texto antigo ou liberar memória em uso.

## Escrita do LLM e preservação

A versão consolida os pools CPU persistentes e o prefixo estático preparado no carregamento da 1.1, descritos em `SMOLLM3_CPU_STARTUP.md`. Além dos hooks de liberação ociosa antes de trocar motores, não adiciona outra rodada de parâmetros, não muda sampler, system prompt, max output, templates, thinking ou política do Qwen híbrido. O ganho físico da escrita permanece sem medição no Samsung. Streaming do chat, GGUF, geração de imagens, RAG, documentos, histórico e preferências permanecem intactos.

O build mantém o comando Gradle anteriormente validado. Uma tentativa de selecionar ABI pela propriedade interna `android.injected.build.abi` compilou o aplicativo/testes, mas alterou a saída esperada pela coleta do APK. A propriedade foi retirada; o APK continua ARM64 pelo filtro existente. Sem dependências novas e sem Vulkan/OpenCL.

DBG registra engine realmente usado, tempo de preparação e `sessionReused`, separados de decode/RTF. Não exporta áudio ou transcrições. Sessões e seu estado são voláteis; não se cria cache de gravações em disco.

## Verificações

`tests/stt/run_host.sh` compila os managers e wrappers Kotlin de produção contra substitutos Android/sherpa/áudio restritos a testes. Executa sobreposição de carga/captura, reutilização sem novo load, stop ocioso, troca de modelo, Small sem retenção, pressão de memória, erros de carga/decode, cancelamento com descarte do resultado, close durante carga e liberação de streams. Também verifica TTS aquecido entre leituras, liberação obrigatória e fallback por RAM, e conteúdo/limites UTF-16 dos trechos.

O teste C++ inclui o JNI de produção, substituindo somente Whisper e transporte JNI: modelo reutilizado em dois decodes, reset/cancelamento, unload concorrente com decode, handles antigos, falha de load e liberações exatas. Passou também com ASan/UBSan (`detect_leaks=0`: LeakSanitizer não funciona sob o ptrace deste ambiente; as liberações são verificadas por contadores). O JNI passou na análise de sintaxe contra `whisper.h` da revisão compilada `2eeeba56e9edd762b4b38467bab96c2517163158`; o build Android valida a API nativa real.

Fila de fala JS, guard de thinking, streaming/ACK e integridade da UI passaram. Esses testes **não reconhecem fala real nem medem velocidade Android**. Não há telefone/tablet conectado. O resultado do build é informado na entrega.

Para reproduzir os testes host: fornecer JDK, compilador C++17, Kotlin e `JSON_JAR` (org.json já usado nos testes do aplicativo), então `bash tests/stt/run_host.sh`. Não baixa modelos.

Uma validação física suficiente: duas falas curtas com o mesmo Tiny/Base, dentro de 30 s, seguidas de uma leitura. Conferir no DBG `sessionReused`, preparação, decode/RTF e o início do áudio. Cache pode ser liberado por RAM; isso não remove o modelo instalado. Para escrita, comparar a mesma pergunta e observar TTFT/prefill/decode, contabilizando separadamente a preparação no carregamento.

## Instalação: limitação já conhecida

A build anterior gerava chaves debug efêmeras no GitHub Actions; a incompatibilidade entre assinaturas 1.0 e 1.1 já foi comprovada. Esta tarefa não tem a chave privada anterior. **Não desinstalar a instalação existente nem limpar dados para contornar assinatura.** O APK de teste é para instalação nova; uma atualização compatível que preserve o sandbox exige a chave privada correspondente ao APK instalado. Não foi criado outro package nem se tentou contornar a verificação Android. Compilação aprovada não comprova compatibilidade de atualização, desempenho físico ou reconhecimento correto no aparelho.

## Primeira compilação e correção da entrega

Run `43238640700`, código `28717f9`: `:app:testDebugUnitTest :app:assembleDebug` passou em 16 min 49 s. O workflow falhou depois, ao procurar `app-debug.apk` na etapa de verificação/publicação após a seleção de ABI injetada. Nenhum APK foi publicado nessa execução. A seleção de ABI adicional foi removida, sem alterar o código do aplicativo. O verificador de isolamento ELF foi atualizado para os cinco métodos JNI da sessão; continuará rejeitando símbolos/dependências de outros motores.
