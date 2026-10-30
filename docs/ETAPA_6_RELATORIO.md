# ETAPA 6 — Voz offline e ajustes autorizados

## Base e escopo

- Base explícita: checkpoint `checkpoint/haruna-before-multimodel-3d7c343`, commit `3d7c343bce61c381761078e8aac2d73c6cb08e27`.
- Branch da implementação: `feature/haruna-stage6-offline-voice`.
- A Etapa 5 e sua branch `ui-polish-icons` foram preservadas, sem uso como base visual/arquitetural.
- llama.cpp permanece em `7894e8b92481a8bb8ffe94f73b656ffe0dd01e10`. AAR sherpa-onnx permanece na versão 2.0.0 já existente. Sem novo runtime, backend ou dependência de IA.
- Commit final, run, artifacts e hashes são acrescentados no relatório técnico do CI após o build real.

A implementação reaproveita AudioRecord, WhisperSttEngine, Supertonic, AudioTrack, bridges e modo chamada existentes. Não transporta ModelSession, journals, cards LLM ou alterações de largura da Etapa 5.

## STT local

Biblioteca simples de **Whisper Tiny, Base e Small multilíngues, ONNX INT8 exportado para sherpa-onnx**. Não é compatibilidade universal com qualquer arquivo chamado Whisper. Pesos PyTorch `.pt`, whisper.cpp/GGUF/`.bin`, Vosk, modelos `.en`, outros modelos ONNX e variantes sem o par INT8 esperado não são formatos desta entrega.

O pacote `.tar.bz2` precisa conter um único conjunto `tiny/base/small-encoder.int8.onnx`, decoder correspondente e `*-tokens.txt`. A importação seleciona os componentes INT8; não guarda as versões F32 adicionais do arquivo oficial. Pacotes só F32/quantizações diferentes não foram habilitados nesta etapa. O formato foi conferido no exportador e teste oficial sherpa-onnx v2.0.0.

A validação observa componentes, caminhos, links, duplicatas, tamanhos, conclusão da extração e vocabulário multilíngue padrão. O exportador oficial pode guardar apenas 50.257 ranks base64 do `multilingual.tiktoken`, sem linhas especiais de idioma; esse caso é aceito e a variante inglesa de 50.256 ranks é rejeitada. Exportações com marcadores explícitos PT/SOT também são reconhecidas. A validação estrutural não prova que um ONNX arbitrariamente renomeado é executável: a carga real do reconhecedor continua sendo a validação do runtime.

As configurações permitem importar, listar, selecionar, trocar e remover cada modelo. Instalações incompletas com um ID conhecido também podem ser removidas explicitamente. A seleção é persistida em `haruna_recognition/selected_model`. A instalação antiga `files/stt/whisper-tiny-int8/installed.json` é reconhecida no lugar, sem copiar/apagar/migrar pesos. Base e Small ficam em diretórios irmãos privados. Remover STT não toca em GGUF, TTS, chats ou documentos.

Selecionado e carregado são separados: o reconhecedor só é criado para transcrever e é liberado antes de devolver o resultado ao chat. Seleção/instalação/remoção não ocorrem durante captura/transcrição. Português, transcrição, 16 kHz/80 mels, CPU e duas threads preservam a configuração existente, apropriada a essas três variantes.

Os três downloads oficiais foram verificados no release `asr-models`: Tiny 116.204.861 bytes, Base 207.557.382, Small 639.387.718. Não começam automaticamente. O release não fornece digest publicado para esses assets. Tiny mantém o SHA-256 previamente registrado no projeto; Base/Small usam HTTPS oficial, tamanho verificado, descompressão/validação estrutural e fingerprints locais registrados, **sem alegar comparação com um SHA-256 oficial inexistente**. Pacote temporário/staging são removidos; modelos já instalados não são sobrescritos silenciosamente.

## TTS durante streaming

Somente a chamada explicitamente iniciada usa leitura automática em streaming. Chat normal e opção existente de ouvir mensagem permanecem sob demanda.

Um observer estreito no caminho de voz recebe os mesmos deltas que já seguem para a bolha. A implementação original de streaming/RAF/backpressure e a montagem do contexto não são reescritas. O texto para fala usa o ThinkParser existente em uma instância independente e uma fila de frases: mínimo preferencial de 48 caracteres, máximo de 280, pontuação/pausas naturais, proteção básica para abreviações, flush final e sem repetir o texto já enfileirado. O normalizador de pronúncia e o chunking de síntese de 240 caracteres do Supertonic continuam existentes.

Com modo Pensar ativo, a fala espera o fechamento de `<think>`/`</think>`; se não houver delimitador, espera a resposta final visível. Isso permite início antecipado quando seguro, sem transformar raciocínio oculto em áudio. Não há promessa de começar cedo em todos os templates/modelos ou em respostas muito curtas.

A bridge TTS acrescenta `beginStream`, `appendStream`, `endStream`. A fila nativa guarda apenas texto: até 64 trechos/16.384 caracteres. Consumidor dorme enquanto aguarda dados; produtor nunca espera a reprodução. Saturação/erro interrompe a voz e permite que o LLM termine de escrever no chat. A síntese reaproveita o motor existente, com no máximo o segmento PCM atual e um antecipado, sem WAV nem cache de áudio da conversa. O motor só carrega ao chegar o primeiro trecho falável.

Parar cancela a fila, acorda o consumidor e libera/flush o AudioTrack. Tickets rejeitam trechos antigos; o player confere a identidade da track para não escrever PCM antigo em uma track nova. A síntese ONNX já iniciada não é preemptível por esse binding: áudio/pedidos restantes param, mas o cálculo em andamento termina antes da liberação segura. O período de descarregamento TTS por inatividade e a liberação antes de STT foram preservados. Não há descarga automática do GGUF.

## Chamada e esfera

O botão de chamada existente abre o diálogo dedicado, escuro/roxo, com uma esfera simples. Sem vídeo, WebGL, partículas ou animação 3D. O tema global continua pré-Etapa 5; apenas a esfera da chamada sobrepõe a regra do tema que aplicava o favicon naquele elemento.

- Ouvindo: escala recebe RMS real do microfone, já medido pelo gravador.
- Pensando/transcrevendo: CSS respira entre 100% e 106%, lentamente.
- Falando: escala recebe RMS de amostras PCM efetivamente submetidas ao AudioTrack.
- Pausado: estática. Erro: reduzida/atenuada com mensagem.
- Eventos de nível são pequenos e limitados a aproximadamente 160 ms. Não refazem cards de configurações nem carregam modelos para animar.

O nível TTS é amplitude de PCM submetido, não medição física do alto-falante nem sincronização exata com o DAC. O buffer de reprodução pode adiantar visualmente esse nível. A animação respeita redução de movimento.

Visibilidade/pagehide e o sinal nativo `app_background` fecham a chamada e cancelam seus timers; `MainActivity.onStop` muda apenas a chamada de voz para enviar esse motivo. Não se depende exclusivamente de `document.hidden` no WebView. O controle Falar agora já permite interromper e retomar captura: preparação para barge-in, **não detecção automática/full duplex**. O microfone continua pausado enquanto o LLM/TTS respondem.

## Ajustes visuais autorizados

Cabeçalho permanece literalmente **Haruna**, com `IA local • privada • offline`. O componente de estado existente consulta o backend atual para mostrar `Qwen3.5 local ativo`, `Phi-4 local ativo` ou `Qwen 0.5B local ativo`, com o chip Rápido/Pensar já existente. Carregamento/erro não são anunciados como ativos. O nome técnico duplicado na extremidade dessa linha fica oculto. Nenhum modelo vira identidade da aplicação.

O rodapé discreto, centralizado, somente no fim das configurações, contém:

Haruna © 2026  
João Victor — Proxys Labs  
Desenvolvido com Inteligência Artificial.

Um observer pequeno de inserção mantém o rodapé após os cards opcionais existentes. Não cria card gigante nem altera navegação. CSS novo é restrito à chamada, controles STT novos, estado autorizado e rodapé; não usa `overflow-x: hidden` para mascarar largura.

## Catálogo GGUF

Três opções: Qwen 0.5B, Qwen3.5 2B e Phi-4 Mini 3.8B, todas Q4_K_M. Repositórios/arquivos foram conferidos na API Hugging Face; as URLs apontam para revisões fixadas. Tamanhos: 491.400.032, 1.280.835.840 e 2.491.874.688 bytes. Repositórios, revisões, arquivos e metadados LFS estão em `STAGE6_MODEL_SOURCES.json`.

Não houve download de pesos para testar. O bom funcionamento das famílias no aparelho é informação anterior do usuário; não valida automaticamente estes arquivos específicos neste APK. O gerenciamento/importação/carregamento GGUF, seleção de principal e parâmetros de inferência permanecem exatamente os do checkpoint. Os hashes LFS são metadados de proveniência, não um novo mecanismo de verificação inserido no downloader existente.

## Instalação e artifacts

Versão Android 0.6, versionCode 6. Instalador separado: **Haruna-v0.6-debug.apk** em artifact próprio contendo apenas esse APK. O GitHub Actions entrega artifacts em ZIP: esse ZIP terá somente o instalador, sem relatório/JSON/logs misturados.

Artifact técnico separado inclui relatório, metadata, SHA-256, fontes dos modelos, logs e screenshots dos testes. Não inclui modelos, áudio nem conversas. Não se apagam informações úteis para simplificar a instalação.

## Arquivos modificados

- `app/build.gradle.kts`: somente versão 0.6/código 6.
- `app/src/main/assets/haruna/app.js`: observer opcional de voz e rótulo autorizado do estado.
- `app/src/main/assets/haruna/catalog-ui.js`: três opções/URLs verificadas e nomes amigáveis.
- `app/src/main/assets/haruna/index.html`: carregamento de CSS/rodapé da etapa.
- `app/src/main/assets/haruna/speech-ui.js`: ignora eventos pequenos de medição.
- `app/src/main/assets/haruna/voice-chat.js`: biblioteca STT, fila da chamada, esfera e encerramento.
- `app/src/main/java/com/proxyslabs/haruna/MainActivity.kt`: somente motivo de suspensão da voz em onStop.
- `speech/RecognitionBridge.kt`: comandos de seleção/download/remoção STT identificados.
- `speech/SpeechBridge.kt`: comandos de fila e sinal de segundo plano.
- `speech/SttDiagnostics.kt`: nome real da variante selecionada.
- `speech/SttManager.kt`: seleção serializada e uso da variante escolhida.
- `speech/SttModelManager.kt`: biblioteca dos três pacotes, preservando Tiny antigo.
- `speech/TtsAudioPlayer.kt`: RMS limitado e identidade da track ao escrever.
- `speech/TtsManager.kt`: consumo da fila, cancelamento e medição limitada.
- `speech/WhisperSttEngine.kt`: caminhos do modelo selecionado, mantendo pipeline oficial.

Novos:

- `speech/WhisperModels.kt`, `speech/SpeechTextQueue.kt`.
- `app/src/main/assets/haruna/voice/stream.js`, `model-names.js`, `stage6-ui.js`, `stage6.css`.
- `scripts/check_voice.mjs`, `check_voice.kt`, `check_voice.py`, `check_voice_browser.mjs`, `check_stage6_scope.py`.
- `docs/STAGE6_MODEL_SOURCES.json` e este relatório.
- Workflow de compilação em branch auxiliar, com checkout explícito do commit da feature.

Caminhos `speech/...` acima ficam sob `app/src/main/java/com/proxyslabs/haruna/`.

## Testes e validação física

**AUTOMÁTICO, sem modelos reais:** fila/segmentação/ordem/cancelamento/pensamento e estado por JavaScript; fila nativa pura e formatos/vocabulário por Kotlin; fluxo do app real no Chromium com bridges simuladas, offline após carregar assets, em 360/768 px. Testa chamada, início TTS antes de fim LLM, amplitude simulada, pausa/retomada/erro/encerramento/background, ligação dos comandos STT importar/selecionar/remover, cabeçalho/estado/catálogo/rodapé, tema claro e limites dos componentes novos. Os testes de browser não são testes de microfone, síntese ou reconhecimento real.

Também há guards contra alterações nos subsistemas protegidos e checks existentes de streaming, prefixo/KV e fast path RAG. Resultados e build reais serão acrescentados pelo workflow. Playwright é dependência temporária de teste, não da aplicação.

**DISPOSITIVO REAL:** nenhum teste físico executado nesta etapa. Ainda testar:

1. Tiny antigo reconhecido sem reinstalação; importar Base e Small, selecionar, reiniciar, remover cada um e validar português em modo avião.
2. Rejeitar `.en`, formatos errados, pacote incompleto; cancelar instalação e recuperar espaço sem perder outro modelo.
3. Resposta longa em chamada: ouvir antes do fim quando há frase pronta, sem duplicação, na ordem; texto integral continua correto no chat.
4. Parar voz durante síntese/reprodução/LLM; começar novo turno; testar foco de áudio e pressão de RAM com GGUF carregado.
5. Esfera com microfone real e PCM real, pausa, erro, encerramento, background/foreground e redução de movimento.
6. Ditado continua preenchendo somente rascunho; Ouvir por pressionar mensagem continua funcionando.
7. Configurações, tema claro/escuro, chats/histórico, RAG/TXT/anexos, GGUF e diagnósticos continuam utilizáveis.
8. Confirmar instalador separado e versão 0.6. A compatibilidade da assinatura debug com a instalação existente depende da chave usada; não desinstalar/limpar dados para contornar erro de assinatura.

## Questões fora do escopo não corrigidas

- O gerenciamento GGUF é o do checkpoint. Não foi portado o journal/recovery de crash-loop da Etapa 5, por instrução explícita. Modelos grandes ainda podem causar encerramento por pressão de memória; não foi implementada seleção/fallback automático.
- `llm-engine.js` mantém seus estados transitórios otimistas do checkpoint (por exemplo, atribuição de `active` ao concluir uma chamada). Não foi refeito esse controlador; somente o rótulo visual expressamente solicitado consulta o estado nativo atual. Potenciais discrepâncias de controles em concorrência fora do fluxo de voz não foram investigadas/corrigidas nesta etapa.
- O gravador existente permanece limitado a 20 s e usa limiar de energia/pausa, não VAD neural. Transcrição e síntese ONNX em andamento não têm cancelamento cooperativo fino nesse binding. Não foi adicionada gravação contínua/background nem atualização do runtime para mudar isso.
- A investigação de divergência ARM das Etapas 4.5/4.6 não foi retomada. Scripts, checkpoints e infraestrutura permanecem preservados.

Não se declara estabilidade absoluta por compilação ou mocks. Nenhum prompt, áudio ou conversa foi enviado a serviço de IA/cloud; nenhuma telemetria foi adicionada.

ETAPA 6 IMPLEMENTADA — AGUARDANDO VALIDAÇÃO DE VOZ OFFLINE NO DISPOSITIVO
