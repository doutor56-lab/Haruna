# Ditado e conversa por voz local

Base: `3727b47db707134c31b22906ec755bdb64d816a6`, na mesma branch `recovery/haruna-82d3c47`.
Checkpoint: `checkpoint/haruna-before-local-stt-20261026-3727b47`.

## Como usar

1. Instale o reconhecimento em Configurações → Escrita e conversa por voz, por download solicitado ou importação do pacote oficial `sherpa-onnx-whisper-tiny.tar.bz2`.
2. **🎙️ no compositor:** concede permissão de microfone no Android, captura uma fala e insere o resultado no rascunho, preservando o texto já escrito. Revise e toque no Enviar normal. O ditado não envia mensagens automaticamente. Concluir encerra a captura e transcreve; Cancelar descarta a captura/transcrição pendente.
3. **📞 no cabeçalho:** abre a conversa por voz local. Requer reconhecimento instalado, GGUF carregado e voz TTS instalada com speaker selecionado. Envie/limpe rascunhos e anexos antes de iniciar, para não enviá-los por acidente.
4. Toque em Iniciar conversa: cada fala é transcrita e enviada ao chat atual; a resposta é salva pelo fluxo comum e lida pelo Supertonic. Após a reprodução, o microfone volta a ouvir. Este é um modo local por turnos, sem chamada telefônica ou comunicação com outra pessoa.
5. Falar agora interrompe o turno anterior e solicita nova captura; Pausar conversa interrompe a sequência; Retomar reativa a captura; Encerrar fecha o modo. A captura pausa durante transcrição, geração e reprodução, evitando que a Haruna reconheça a própria saída.

Trocar de conversa, enviar manualmente, abrir anexos/navegar para outra área ou colocar o app em segundo plano encerra a interação de voz. Perder audio focus durante a resposta pausa a conversa. Nenhuma captura ou chamada é retomada automaticamente após reiniciar o aplicativo.

## Modelo e dependências

Reutiliza o **sherpa-onnx v2.0.0** e o Apache Commons Compress já instalados para o TTS. Não há nova dependência de build ou alteração do Gradle.

Modelo: Whisper Tiny **multilíngue**, com encoder/decoder INT8, CPU, duas threads, idioma `pt`, tarefa `transcribe`. Não usa `tiny.en`, SpeechRecognizer do Android, serviços Google ou reconhecimento em nuvem.

Fonte oficial:
https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-tiny.tar.bz2

O pacote oficial foi inspecionado durante o desenvolvimento:
- Compactado: **116.204.861 bytes**.
- SHA-256 calculado a partir do download oficial: `c46116994e539aa165266d96b325252728429c12535eb9d8b6a2b10f129e66b1`. O release antigo não publica um digest; este valor foi registrado a partir do artefato, e não apresentado como digest publicado pelo mantenedor.
- Arquivos mantidos: `tiny-encoder.int8.onnx` (12.937.772 bytes), `tiny-decoder.int8.onnx` (89.855.401 bytes), `tiny-tokens.txt` (816.730 bytes).
- Aproximadamente **103,6 MB instalados**. As versões float32 e amostras WAV do pacote são descartadas.
- Reserva conservadora durante instalação: **450 MiB**.

A instalação segue a lógica validada do importador TTS em um componente STT independente: progresso real, tamanho/hash fixados, extração por staging, rejeição de links/caminhos inseguros, validação dos arquivos e manifesto publicado por rename. Download só começa por ação explícita. Importação manual aceita o pacote oficial indicado, sem reempacotamento. Temporários são limpos em sucesso/falha/cancelamento e na próxima inicialização após um encerramento abrupto. A origem selecionada pelo usuário não é apagada. Downloads não continuam em segundo plano nem retomam parcialmente.

Armazenamento privado: `filesDir/stt/whisper-tiny-int8/`, separado de `filesDir/tts/` e de `filesDir/models/`. Remover reconhecimento não remove Supertonic, GGUF, histórico, memórias ou Segundo Cérebro. O manifesto e os tamanhos permitem reconhecer a instalação após reinício.

APIs consultadas na versão exata:
- https://github.com/k2-fsa/sherpa-onnx/blob/v2.0.0/sherpa-onnx/kotlin-api/OfflineRecognizer.kt
- https://github.com/k2-fsa/sherpa-onnx/blob/v2.0.0/sherpa-onnx/kotlin-api/OfflineStream.kt
- https://github.com/k2-fsa/sherpa-onnx/blob/v2.0.0/sherpa-onnx/kotlin-api/FeatureConfig.kt

## Arquitetura e privacidade

- `RecognitionBridge`: interface independente `HarunaRecognition`, seletor e permissão pelo Android, status/eventos identificados por pedido.
- `SttManager`: serializa instalação, captura e reconhecimento; cancela resultados antigos; publica somente a transcrição final e o nível do microfone.
- `SttModelManager`: gerencia exclusivamente o modelo STT.
- `SttAudioRecorder`: AudioRecord a 16 kHz, mono PCM16; áudio convertido em memória para float. A pausa de aproximadamente 1,4 segundo encerra um trecho após identificar atividade de voz; limite de 20 segundos por fala e 10 segundos sem identificar fala.
- `WhisperSttEngine`/`SttEngine`: adaptador do OfflineRecognizer oficial. Stream e reconhecedor são liberados antes de devolver o texto.
- `voice-chat.js`: controla ditado e chamada por estados, vincula resultados ao chat/pedido corretos e respeita cancelamento/contexto/visibilidade.
- `app.js`: oferece uma interface pequena para a chamada utilizar o mesmo `sendMessage` do teclado, sem criar outro pipeline de LLM/RAG. A resposta fornecida ao TTS é a resposta real daquele turno, não uma leitura da última bolha do DOM.

Só a permissão `RECORD_AUDIO` foi adicionada. Ela é pedida em tempo de execução quando o usuário inicia uma captura. Não há permissão de telefone, gravação em segundo plano ou serviço persistente. O microfone é liberado antes da inferência. Áudio bruto não é salvo no armazenamento nem enviado ao JavaScript ou a servidores. Na chamada, transcrições e respostas ficam no histórico local comum; no ditado, só viram histórico se o usuário enviar.

O áudio tem limite de cerca de 1,28 MB para o buffer float principal, além da cópia do trecho e buffers internos. Buffers são limpos após uso. Antes de começar a ouvir, a fila do TTS termina a chamada nativa atual, libera os pesos e só então permite a captura. Após transcrever, o Whisper é liberado antes de enviar texto ao LLM, e o Supertonic carrega novamente sob demanda. O GGUF permanece carregado.

Cancelar invalida o pedido imediatamente e para o AudioRecord. A chamada nativa de reconhecimento já iniciada não oferece interrupção segura; termina internamente, libera os pesos e tem seu resultado descartado. Um novo pedido aguarda esse trabalho anterior, evitando dois reconhecedores simultâneos. IDs e o chat ativo impedem que uma transcrição tardia seja enviada a outra conversa. Encerrar cancela somente a geração do LLM que pertence àquele turno de voz.

## Arquivos

Novos: `RecognitionBridge.kt`, `SttManager.kt`, `SttModelManager.kt`, `SttAudioRecorder.kt`, `WhisperSttEngine.kt` no pacote `com.proxyslabs.haruna.speech`; `voice-chat.js`; este documento.

Alterados: `AndroidManifest.xml` (microfone opcional e permissão); `MainActivity.kt` (bridge, seletores, permissão e ciclo de vida); `SpeechBridge.kt`/`TtsManager.kt` (pausa/liberação para captura e notificação de audio focus); `app.js` (interface para turnos e cancelamento); `index.html` (módulo independente); `premium.css` (controles de voz com os estilos existentes).

Não se alteraram o backend GGUF, sua biblioteca, o runtime de recuperação, a indexação/busca RAG, o armazenamento de conhecimento, anexos ou o menu de pressionar e segurar. O ditado e a chamada compartilham o caminho existente de envio, histórico e RAG.

## Verificação e limites

O pacote oficial foi baixado para inspeção de nomes/tamanhos e registro de hash. APIs e os módulos Kotlin de speech foram compilados contra as classes do AAR oficial, APIs Android e Commons Compress, com um stub mínimo para a Activity. Isso não substitui a compilação do APK completo. JavaScript e manifesto passam por verificações de sintaxe. Não foram criados/executados testes, benchmarks ou suítes extensas.

Validação no Android permanece necessária: permissão negada/concedida, ditado com rascunho/anexo, captura curta e longa, pausas, cancelamento durante reconhecimento, chamada de vários turnos, Falar agora, perda de audio focus, saída do app, troca de chat e consumo simultâneo com o GGUF. Whisper Tiny privilegia tamanho; precisão pode cair com ruído, nomes e fala distante. O detector de pausas usa energia adaptativa e não é um VAD neural. Não há transcrição parcial em tempo real, escuta simultânea à própria fala, cancelamento interno da inferência, reconhecimento contínuo em segundo plano ou garantia de latência de chamada telefônica. Use falas curtas e ambiente silencioso; fones podem melhorar a experiência.
