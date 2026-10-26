# Voz local da Haruna

Implementação sobre `recovery/haruna-82d3c47`, base `fbe9cab08db9139e8a2600de81cd173900319ecf`.
Checkpoint recuperável: `checkpoint/haruna-before-local-tts-20261026-fbe9cab`.

## Arquitetura e arquivos

A aplicação é uma WebView de assets locais, com bridge Kotlin para o LLM e importadores Android. O menu de mensagem é `openMessageMenu` em `app.js`. O módulo de voz foi acrescentado sem modificar o bridge do LLM, o backend GGUF, a biblioteca de modelos, o runtime de recuperação, anexos ou o armazenamento do Segundo Cérebro.

Arquivos existentes alterados:
- `app/build.gradle.kts`: dependências de voz.
- `app/src/main/java/com/proxyslabs/haruna/MainActivity.kt`: bridge de voz separado, seletor SAF separado e encerramento do áudio ao sair do aplicativo.
- `app/src/main/assets/haruna/app.js`: somente a ação Ouvir no menu de mensagens da assistente, com importação dinâmica.
- `app/src/main/assets/haruna/index.html`: inicialização independente do módulo de voz.
- `app/src/main/assets/haruna/premium.css`: estilos locais dos controles de voz.

Arquivos novos:
- `speech/SpeechBridge.kt`: interface `HarunaSpeech`, separada de `HarunaAndroid`.
- `speech/TtsManager.kt`: serializa instalação/inferência, preferências, estado, cancelamento e expiração dos pesos.
- `speech/SupertonicTtsEngine.kt`: interface `TtsEngine` e adaptador de OfflineTts oficial.
- `speech/TtsModelManager.kt`: download/importação, integridade, extração e remoção exclusivamente da voz.
- `speech/TtsAudioPlayer.kt`: AudioTrack mono PCM float e audio focus.
- `speech/TtsTextNormalizer.kt`: limpeza para fala e dicionário configurável.
- `assets/haruna/speech-ui.js`: configurações, primeiro uso e controle Parar.
- Este documento.

Todos os arquivos Kotlin novos ficam em `app/src/main/java/com/proxyslabs/haruna/speech/`.

## Dependências e fontes verificadas

- [sherpa-onnx Android AAR v2.0.0](https://github.com/k2-fsa/sherpa-onnx/releases/tag/v2.0.0), artefato oficial `sherpa-onnx-2.0.0.aar`. O build baixa o AAR de 49.236.482 bytes e verifica SHA-256 `f0f8716982d27cb4ce695e3934018b1342d9d3d6fdb6ef1f1658fe8bad50b4fc`. Os pesos não são incluídos no APK. O primeiro build precisa de internet para obter as dependências.
- Apache Commons Compress 1.27.1 e suas dependências transitivas para BZip2/TAR.
- [API Kotlin oficial fixada em v2.0.0](https://github.com/k2-fsa/sherpa-onnx/blob/v2.0.0/sherpa-onnx/kotlin-api/Tts.kt).
- [Exemplo oficial de Supertonic 3](https://github.com/k2-fsa/sherpa-onnx/blob/v2.0.0/kotlin-api-examples/test_supertonic_tts.kt).
- [Pacote oficial de modelos](https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models).

A configuração usa `OfflineTtsSupertonicModelConfig`, CPU, duas threads, `GenerationConfig.sid`, `speed=1.0` por padrão, cinco passos e `extra["lang"]="pt"`. Os sete componentes do pacote são fornecidos diretamente ao pipeline oficial. Não há pipeline ONNX próprio.

## Instalação e armazenamento

URL fixa verificada: https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/sherpa-onnx-supertonic-3-tts-int8-2026-05-11.tar.bz2

Pacote de 128.774.318 bytes (128,8 MB decimais). SHA-256 publicado: `82fa96f91c4ef8abaae3a14a3f4153facf88bed821d1f7331cec2700f432c427`.

Importar abre um seletor Android próprio e copia o arquivo autorizado. O download só começa após uma ação explícita. Ambos informam progresso por bytes; quando o provedor não oferece tamanho, a importação mostra bytes em vez de inventar percentual. Extração tem estado próprio sem percentual fictício.

O mesmo tamanho e hash são exigidos na importação manual: esta versão aceita o pacote oficial especificado, não variantes reempacotadas. Após a verificação, extrai para staging privado, rejeita links/caminhos inseguros, limita o tamanho expandido, valida os componentes, o JSON e o cabeçalho de `voice.bin`, e publica a instalação por rename. Preserva o LICENSE do pacote. Não carrega o motor durante a instalação.

Arquivos finais: `context.filesDir/tts/supertonic-3-int8/`, com os sete componentes, LICENSE e `installed.json`. Ocupação aproximada: 145,3 MB. Reserva conservadora solicitada durante a instalação: 650 MiB. O pacote copiado e o staging são apagados ao concluir, cancelar ou falhar. Restos de um encerramento abrupto são limpos na próxima inicialização. O arquivo original selecionado pelo usuário não é apagado.

A instalação é reconhecida após reinício pelo manifesto e tamanhos dos componentes. Os pesos permanecem independentes de `filesDir/models` (GGUF) e do IndexedDB do RAG. Remover voz apaga somente a instalação TTS e seus temporários. Speaker, velocidade e dicionário são preferências locais; remover a voz limpa a seleção do speaker.

## Speakers e pronúncia

O `voice.bin` oficial tem dimensões `[10,50,256,10,8,16]`. Na implementação foram comparadas byte a byte as duas fatias float32 de cada speaker com os JSON oficiais de `Supertone/supertonic-3/voice_styles`: F1–F5 correspondem aos sids 0–4; M1–M5 aos sids 5–9. O [gerador sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx/blob/v2.0.0/scripts/supertonic/generate_voices_bin.py) concatena os arquivos em ordem alfabética. A [documentação oficial do Supertonic](https://github.com/supertone-oss-archive/supertonic/blob/main/web/README.md) identifica F1–F5 como femininas e M1–M5 como masculinas. Os rótulos aplicam-se somente ao pacote com hash fixado acima.

Nenhum speaker é escolhido automaticamente. Configurações → Voz da Haruna permite selecionar, comparar com Testar voz e persistir a escolha. Velocidade: 0,7–1,4×. A pronúncia de Haruna começa vazia (texto original); o usuário pode experimentar uma alternativa. O dicionário interno JSON também aceita futuros nomes via `HarunaSpeech.configure({pronunciations:...})` serializado como string. Nenhuma substituição modifica mensagens armazenadas ou exibidas.

## Mensagens, reprodução e Parar

Somente mensagens da assistente sem erro têm Ouvir no menu existente de pressionar e segurar. O texto e identificador da mensagem selecionada são entregues ao bridge local. Não há áudio automático.

O primeiro uso oferece baixar, importar ou cancelar. Depois de instalar, o usuário escolhe e testa um speaker nas configurações e toca Ouvir novamente na mensagem. Há um controle de reprodução com Parar junto ao compositor.

A normalização remove marcações de raciocínio, links e formatação; blocos de código são anunciados como trechos de código. O texto visual é preservado. O texto preparado é dividido em frases/limites de até 240 caracteres. O modelo é carregado apenas para Ouvir/Testar. A reprodução usa AudioTrack com buffer de aproximadamente 200 ms; o trabalhador de síntese pode preparar somente um próximo trecho enquanto o trabalhador de áudio reproduz o atual. Há no máximo dois trechos de áudio em memória, além dos buffers internos do motor. Não se geram WAVs nem cache de conversa.

Parar invalida a sequência e pausa/esvazia/libera o AudioTrack imediatamente. Uma nova mensagem invalida a anterior antes de iniciar. O binding Supertonic não oferece interrupção segura dentro de uma chamada de inferência já iniciada: ela pode terminar internamente, mas seu resultado é descartado. Nunca se libera o motor enquanto o código nativo o utiliza. Após 30 segundos sem uso, o motor é liberado na mesma fila de síntese. O GGUF não é descarregado.

Perder audio focus interrompe a fala. Ao colocar o aplicativo em segundo plano, áudio e instalação são cancelados. Não há serviço de download em background ou retomada parcial: um download interrompido pode ser reiniciado. Não há STT, permissão de microfone nem botão de reconhecimento; o pacote `speech` e a interface `TtsEngine` deixam um limite claro para futura integração STT separada.

## Verificação e limites

AAR e pacote oficiais foram obtidos e seus hashes conferidos durante o desenvolvimento. A API da versão exata foi inspecionada. Os módulos Kotlin de voz foram compilados isoladamente com Kotlin 2.3.0, classes do AAR oficial, APIs Android e Commons Compress; para o ponto de entrada da Activity foi usado um stub mínimo. Isto não equivale à compilação do APK completo. A sintaxe dos JavaScript foi verificada. Não foram criados/executados testes, benchmarks ou suítes de QA.

A compilação completa Android/NDK e validação física permanecem pendentes. Verificar manualmente importação, download/cancelamento, speakers femininos, pronúncia, Parar durante síntese e reprodução, troca de mensagem, audio focus e persistência após reiniciar. Também validar o consumo real junto ao GGUF: tamanho em disco não representa RAM, e ONNX Runtime usa memória adicional para sessões, tensores e áudio. Não há medição de RAM/latência nem garantia de ausência de pausas em aparelhos lentos.
