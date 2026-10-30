# Correção autorizada da Etapa 6 — STT e referência de voz

Base funcional: `04a9f7edced6a6d94f921c7eed221f631699e86a`.
Checkpoint imutável: `checkpoint/haruna-stage6-before-stt-fix-04a9f7e`.
A antiga Etapa 5 não foi portada. A autorização adicional do usuário confirmou o visual de chamada, miniplayer e chamada em segundo plano depois da correção STT. Isso não inicia outra etapa.

## Download: causa comprovada e limites da investigação

O erro recebido no aparelho é `UnknownHostException` ao resolver github.com. O manifesto já continha INTERNET; a URL era HTTPS oficial, o downloader usava HttpURLConnection com redirects habilitados. Não há evidência de permissão ausente nem de URL inexistente. Nesta rede, HEAD das nove URLs respondeu HTTP 200 com Content-Length igual aos arquivos oficiais. NÃO é possível determinar remotamente se a causa no aparelho era conectividade, DNS, VPN, bloqueio do GitHub ou falha transitória. Não foi inventada uma causa Android nem aplicado bypass de DNS/TLS.

Correção: downloader STT próprio pequeno com timeout, User-Agent, Accept-Encoding identity e até seis redirects HTTPS explícitos, incluindo 307/308; fechamento em erro/cancelamento. Erros DNS/conexão/timeout/TLS/espaço são traduzidos para português, preservando a exceção original em Log.w. Sem repetição infinita, mirror silencioso ou download automático. Há também fontes oficiais Hugging Face para os modelos whisper.cpp; ONNX continua usando a fonte sherpa oficial.

## Engines e formatos

Originalmente existia somente sherpa-onnx 2.0.0, OfflineRecognizer Whisper ONNX INT8. Não havia whisper.cpp nem JNI STT correspondente. Esse caminho foi preservado.

Adicionada whisper.cpp 1.8.3, commit `2eeeba56e9edd762b4b38467bab96c2517163158`, fonte oficial com SHA-256 do tar fixado no CMake. Pipeline real implementado: arquivo privado verificado → JNI independente → whisper_init_from_file_with_params → whisper_full CPU/português → segmentos UTF-8 → SttResultPolicy → rascunho/chamada existentes. A transcrição não utiliza APIs externas. A biblioteca é carregada somente ao usar essa engine. O indicador carregado só é publicado por callback JNI depois de o contexto Whisper ser validado, não antes da tentativa de load.

Suporte efetivo delimitado:

- sherpa-onnx: pacotes oficiais .tar.bz2 de Tiny/Base/Small multilíngues, componentes encoder/decoder ONNX INT8 + tokens, como anteriormente.
- whisper.cpp: seis arquivos oficiais `ggml-{tiny,base,small}.bin` F16 e `ggml-{tiny,base,small}-q5_1.bin`, identificados pelo cabeçalho e SHA-256 integral publicado no repositório de modelos. A versão integrada lê o formato GGML Whisper, não GGUF LLM. A importação nesta entrega deliberadamente exige um desses hashes oficiais; modelos customizados, outras quantizações, .en, .pt, GGUF e ONNX arbitrário NÃO são anunciados como compatíveis.

Nenhuma inferência real Android foi comprovada apenas pela presença desse código ou build. A validação funcional de áudio/transcrição é indicada separadamente.

## Importação, modelos e persistência

O seletor passa a dizer “Importar modelo do dispositivo”. O importador examina até 48 bytes antes de copiar: assinatura BZh encaminha ao instalador ONNX existente; cabeçalho GGML com dimensões multilíngues Tiny/Base/Small encaminha ao novo instalador. GGUF/arquivos desconhecidos são recusados antes de cópia grande. Tamanho e espaço são verificados; o arquivo GGML é copiado uma única vez para staging, recebe SHA-256 incremental e só então é registrado por rename privado. Hash/tamanho diferentes não chegam ao loader nativo. Duplicatas verificadas reutilizam a instalação. Nunca inclui pesos no APK.

Biblioteca privada existente `files/stt/` e SharedPreferences `haruna_recognition/selected_model` reaproveitados. IDs das instalações ONNX antigas permanecem válidos; Tiny legado é reconhecido no mesmo diretório. Novos IDs distinguem família/engine/quantização. Lista/seleção/troca/remoção passam pela fila STT já existente, bloqueadas durante captura/transcrição/instalação. Os recognizers são curtos: uma engine/modelo por transcrição, liberado antes do LLM/TTS. A escolha persistida não é apresentada como pesos residentes.

Catálogo e fontes exatas: `STT_CORRECAO_SOURCES.json`, `STT_DOWNLOAD_HEAD_CHECK.json` e `STAGE6_MODEL_SOURCES.json`. Tamanhos em bytes reais: ONNX Tiny 116204861, Base 207557382, Small 639387718; GGML F16 Tiny 77691713, Base 147951465, Small 487601967; GGML Q5_1 Tiny 32152673, Base 59707625, Small 190085487. ONNX Base/Small não têm digest oficial publicado: não confundir fingerprint local com autenticação independente. GGML possui os seis hashes oficiais registrados.

## Isolamento nativo

`libharuna_whisper_stt.so` contém whisper/ggml próprios estáticos, sem backend dinâmico, sem GPU, sem KleidiAI e sem repack nesse runtime STT novo. Símbolos ocultos e version-script exportam apenas o JNI STT; --exclude-libs,ALL e -Bsymbolic impedem interposição com llama.cpp/sherpa. O CI verifica exports e DT_NEEDED. Isso NÃO muda flags/commit/backends/parâmetros do LLM. llama.cpp continua `7894e8b92481a8bb8ffe94f73b656ffe0dd01e10`. Licença MIT incluída. Download de fonte é apenas do build, nunca necessário para transcrever no aparelho.

## Referência visual e funções adicionais autorizadas

A chamada usa o logo existente, ícones SVG de traço, esfera radial roxa, anéis discretos, estados ouvindo/pensando/falando/pausado/erro, texto reconhecido e controles adequados à fase. CSS simples e amplitude real disponível; sem 3D/vídeo/partículas. Tema claro acompanha o tema existente. Nenhum usuário/nome pessoal da imagem foi hardcoded. Cabeçalho principal continua Haruna; catálogos GGUF, footer e resto da UI anterior permanecem.

Miniplayer é interno ao app: voltar ao chat/teclado minimiza a mesma sessão; abrir retorna à mesma chamada; encerrar para microfone, fila TTS e geração pertencente à chamada. Não é janela sobre outros aplicativos, não exige permissão de overlay. Indicador de amplitude no compositor e atalhos de voz são limitados ao chat.

Configuração de voz reutiliza STT instalado e speakers reais do Supertonic, velocidade existente, novo volume AudioTrack e toggles persistidos de fala durante geração/encerramento por pausa. Não substitui Supertonic pelo Breeze citado no mockup. Pausa de áudio é real em AudioTrack; retomar mantém buffers. Pular fala cancela áudio restante e mantém geração textual; parar fala termina áudio e deixa a conversa pausada quando a resposta terminar. Não duplica o LLM nem gera áudio de chats comuns automaticamente.

Segundo plano: serviço foreground `microphone|mediaPlayback`, iniciado somente a partir da chamada visível após permissões de microfone/notificação. Notificação persistente com Voltar/Encerrar, wake lock limitado, sem rede/analytics/gravação/boot restart/START_STICKY. Atividade e WebView continuam proprietárias da conversa; o serviço mantém a sessão em background, não inventa persistência de execução após morte do processo. onStop preserva voz somente com serviço ativo. Ditado e instalações mantêm política anterior de parada no background. Encerrar/notificação/remoção da tarefa/onDestroy param a sessão. O timer pertence à instância do serviço e é removido no onDestroy, evitando que o prazo de uma chamada encerrada interrompa uma chamada posterior. Limite de segurança de uma hora; iniciar outra chamada requer ação do usuário. Animações suspendem quando a página fica oculta; o áudio e o modelo têm prioridade.

## Validação e limitações

Testes JavaScript de segmentação/streaming e browser real com bridges simuladas a 360/768 px passaram localmente, incluindo fala antes do término, níveis de amplitude, pausa/retomada, miniplayer, configuração e eventos de serviço/background. Isso NÃO equivale a microfone, notificação Android, ONNX/GGML, alto-falante ou execução física em background.

Testes Kotlin de registro/formatos/erros/fila e build Android são relatados no resultado real do CI, não presumidos. O CI também verifica preservação dos arquivos LLM/RAG/memórias/streaming/diagnósticos anteriores e isolamento da nova biblioteca nativa. Não executa benchmark nem baixa GGUF. Não há resultado físico simulado.

Requer validação no dispositivo: baixar/importar/reconhecer Tiny/Base/Small em ambas engines; frase “Olá Haruna, que horas são?”; arquivo inválido, corrompido, espaço insuficiente, cancelar/repetir; selecionar/fechar/reabrir e alternar Tiny→Base→Small→Tiny; modo avião após instalação; pausa/volume/ordem/cancelamento de TTS; notificação e chamada com tela bloqueada/background/voltar/encerrar; troca de foco de áudio; consumo de RAM/bateria/limites do fabricante.

Limitações: modelos Small/LLM/TTS podem pressionar RAM; não há garantia contra LMK/OOM do sistema. Cancelar descarta resultado de uma inferência sherpa/whisper em curso, mas o binding não interrompe no meio de toda operação; recursos são liberados quando ela termina. Chamada permanece por turnos, não implementa barge-in automático full-duplex. Detecção de pausa é gate energético existente, não VAD neural. Limite por fala continua 20 s. Background depende das políticas Android/WebView/fabricante e precisa ser validado; não continua após force-stop/morte do processo. Instalação e troca não carregam simultaneamente os modelos STT.

Problemas fora do escopo NÃO corrigidos: causa física do DNS no aparelho ainda indeterminada; degeneração numérica ARM anterior; gerenciamento LLM pesado/risco de OOM pré-Etapa5; restrições de interrupção de inferência ONNX; compatibilidade da assinatura de atualização do APK com a instalação do usuário não foi testada. Não orientar desinstalação/limpeza de dados para forçar instalação.

## Roteiro curto

1. Instalar APK de correção sem apagar dados. Conferir modelos ONNX antigos e escolha preservados.
2. Abrir microfone sem STT: escolher Tiny/Base/Small, ou importar um pacote ONNX/arquivo oficial GGML F16 ou Q5_1. Testar com internet e sem internet; DNS deve produzir orientação amigável se indisponível.
3. Reconhecer “Olá Haruna, que horas são?” em ditado; revisar antes de enviar. Alternar modelos, reiniciar, repetir em modo avião.
4. Instalar/selecionar Supertonic como antes. Abrir chamada, permitir microfone/notificações. Observar ouvindo→pensando→falando e fala incremental.
5. Pausar/continuar/pular/parar fala; minimizar, reabrir e encerrar. Testar Configurar voz e tema claro.
6. Durante chamada, ir a outro app/bloquear tela/voltar; encerrar pela notificação. Confirmar microfone parado e ausência de nova captura. O serviço não deve reaparecer sozinho.

## Arquivos desta entrega

- `app/build.gradle.kts`
- `app/src/main/AndroidManifest.xml`
- `app/src/main/assets/haruna/index.html`
- `app/src/main/assets/haruna/voice-chat.js`
- `app/src/main/assets/haruna/voice/call-reference.css`
- `app/src/main/assets/haruna/voice/call-view.js`
- `app/src/main/assets/licenses/whisper.cpp-MIT.txt`
- `app/src/main/cpp/stt/CMakeLists.txt`
- `app/src/main/cpp/stt/exports.map`
- `app/src/main/cpp/stt/whisper_jni.cpp`
- `app/src/main/java/com/proxyslabs/haruna/MainActivity.kt`
- `app/src/main/java/com/proxyslabs/haruna/speech/RecognitionBridge.kt`
- `app/src/main/java/com/proxyslabs/haruna/speech/SpeechBridge.kt`
- `app/src/main/java/com/proxyslabs/haruna/speech/SttAudioRecorder.kt`
- `app/src/main/java/com/proxyslabs/haruna/speech/SttDownload.kt`
- `app/src/main/java/com/proxyslabs/haruna/speech/SttErrors.kt`
- `app/src/main/java/com/proxyslabs/haruna/speech/SttManager.kt`
- `app/src/main/java/com/proxyslabs/haruna/speech/SttModelManager.kt`
- `app/src/main/java/com/proxyslabs/haruna/speech/TtsAudioPlayer.kt`
- `app/src/main/java/com/proxyslabs/haruna/speech/TtsManager.kt`
- `app/src/main/java/com/proxyslabs/haruna/speech/VoiceCallBridge.kt`
- `app/src/main/java/com/proxyslabs/haruna/speech/VoiceCallService.kt`
- `app/src/main/java/com/proxyslabs/haruna/speech/WhisperCppEngine.kt`
- `app/src/main/java/com/proxyslabs/haruna/speech/WhisperFileHeader.kt`
- `app/src/main/java/com/proxyslabs/haruna/speech/WhisperModels.kt`
- `app/src/main/res/drawable/ic_voice_notification.xml`
- `docs/CORRECAO_ETAPA_6_RELATORIO.md`
- `docs/STAGE6_CORRECTION_FILES.txt`
- `docs/STT_CORRECAO_SOURCES.json`
- `docs/STT_DOWNLOAD_HEAD_CHECK.json`
- `scripts/check_stage6_correction_scope.py`
- `scripts/check_stt_native.py`
- `scripts/check_voice.kt`
- `scripts/check_voice.py`
- `scripts/check_voice_browser.mjs`

CORREÇÃO STT DA ETAPA 6 IMPLEMENTADA — AGUARDANDO VALIDAÇÃO NO DISPOSITIVO
