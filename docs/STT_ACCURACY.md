# Etapa 5 — reconhecimento de fala

## Pipeline encontrado

`voice-chat.js` → `HarunaRecognition.start` → permissão Android e pausa/liberação do TTS existente → `SttManager` → `SttAudioRecorder` → `WhisperSttEngine` → evento nativo identificado por request → ditado no rascunho ou turno automático da chamada → envio normal do chat. O Qwen não participa da transcrição; não existe fallback para nuvem/Android SpeechRecognizer.

Engine preservada: sherpa-onnx 2.0.0 OfflineRecognizer. Modelo instalado preservado: Whisper Tiny multilíngue INT8, arquivos `tiny-encoder.int8.onnx`, `tiny-decoder.int8.onnx`, `tiny-tokens.txt`, em `filesDir/stt/whisper-tiny-int8/`. Nenhum download/troca de modelo nesta etapa.

## Problemas comprováveis no código e mudanças

O detector acumulava cinco frames de energia em qualquer momento, sem exigir continuidade: estalos separados podiam ativar a inferência. Agora exige 100 ms consecutivos acima do limiar adaptativo; isso ainda é uma heurística de energia, não um VAD neural. O buffer enviado continha todo o silêncio desde o início, até dez segundos. Agora preserva 320 ms antes do início detectado e 650 ms após a última atividade, removendo silêncio inicial excedente. A pausa de fim passou de 1,4 para 1,6 s, reduzindo cortes em pausas curtas. Limites de 20 s totais e 10 s sem fala permanecem. Uma frase longa ainda pode atingir o limite.

Capture real: AudioRecord, VOICE_RECOGNITION, PCM16 mono a 16.000 Hz, frames de 320 amostras/20 ms. O formato efetivamente aceito é verificado antes de gravar; incompatibilidade retorna erro em vez de entregar áudio com taxa errada. Conversão única PCM16/32768 para float [-1,1), sem AGC/normalização extra/resampling. O efeito de processamento do fabricante em VOICE_RECOGNITION depende do dispositivo.

Idioma já era `pt`, correto para português no Whisper (não existe token distinto `pt-BR`). Continua fixado, sem detecção automática/tradução. Configuração separada preserva possibilidade futura de outros idiomas. Greedy search ficou explícito. O padding final implícito de 1.000 frames na API Kotlin passou a 300, valor recomendado oficialmente para Whisper multilíngue no cabeçalho C++ da mesma versão. Isso é configuração, não comprovação de melhora de precisão no aparelho.

`SttResultPolicy` descarta vazio, só pontuação, controles/tokens especiais, texto desproporcional e repetição extrema (8 palavras iguais ou 5 repetições de uma frase curta). Não altera palavras reconhecidas nem produz percentual de confiança. A filtragem é conservadora, pode rejeitar uma repetição intencional e não detecta frases plausíveis semanticamente erradas. Ausência/saída inválida resulta em `no_speech`, sem envio ao LLM.

Na chamada automática, `app.js` marca origem `voice-call`/não revisada e não executa gravação livre de memórias nem captura da Memória Essencial. O texto continua na conversa e no contexto normal, sem privilégio de persistência. No ditado, o usuário revisa e envia pelo botão normal; aplicam-se as mesmas regras de validação do teclado. Não há novo sistema de aprendizado nesta etapa.

## Estado, memória e cancelamento

Buffer novo e stream novo por gravação; nenhum áudio anterior é reutilizado. Streams/recognizer continuam sendo liberados no fim de cada transcrição para evitar coexistência dos pesos STT, GGUF e TTS durante a resposta. Essa decisão existente privilegia RAM e mantém custo de carga por turno; não houve cache novo de pesos. Buffers em memória são zerados/liberados, sem arquivos de áudio persistentes.

O cancelamento existente invalida o request, para a captura e descarta resultados tardios. A inferência nativa já iniciada não é interrompível com segurança pela API atual; termina e libera os recursos, sem entregar o resultado cancelado. Trabalho serial impede dois reconhecedores simultâneos. A parada por limite/manual pode cortar uma palavra em andamento; não foi criado outro pipeline para esconder isso.

## Vocabulário e limites da API

A implementação Whisper consultada suporta apenas greedy search e não expõe initial prompt/bias de vocabulário. O método genérico `createStream(hotwords)` da biblioteca não comprova suporte a hotwords no Whisper: não foi utilizado. Por isso **nenhuma substituição Aruna→Haruna nem termos artificiais foram adicionados**. Haruna, Astraion, Elyndra e BioAgro continuam candidatos para uma futura engine/API com bias nativo ou correção explicitamente confirmada pelo usuário. Um dicionário sem uso real seria enganoso. O normalizador TTS permanece independente.

O resultado Kotlin não traz score de confiança Whisper/logprob/no_speech probability confiável. Esses valores permanecem indisponíveis. Tiny pode alucinar em ruído, música ou fala distante e errar nomes. Não há evidência de áudio do dispositivo para atribuir todos os erros a uma única causa; melhorias são correções do pipeline identificadas por inspeção, não medição de acurácia. Trocar para outro modelo exigiria avaliação manual e não foi feito automaticamente.

## DBG e custo

Novos escalares locais: engine, modelo, idioma, taxa realmente capturada, duração do trecho enviado, duração só do decode, RTF decode/áudio, último resultado, tentativas/transcrições da sessão. Sem conteúdo, áudio, IDs, caminhos ou confiança inventada. O tempo antigo de STT continua separado e inclui criação/liberação. Painel segue atualização de 5 s/10 s, sem polling novo quando fechado.

Memória adicional: alguns escalares; nenhuma cópia de áudio extra além do buffer limitado e recorte já existentes. Validação de saída opera em texto curto, sem inferência adicional. Nenhuma dependência/manifest/permissão nova.

Novos: `SttDiagnostics.kt`, `SttResultPolicy.kt`, este documento. Alterados: `SttAudioRecorder.kt`, `WhisperSttEngine.kt`, `SttManager.kt`, `DiagnosticBridge.kt`, `diagnostics/report.js`, `app.js`. Busca, roteamento, chunks, ranking e armazenamento RAG não foram alterados.

Verificação: sintaxe JS e inspeção pontual das chamadas/configuração; compilação no pacote final. Teste manual necessário: início/fim das palavras, pausas, ambiente ruidoso, nomes, fala curta/longa, cancelar/recomeçar, ditado revisável e chamada com GGUF/TTS. Sem teste de microfone, acurácia, latência ou RAM em dispositivo nesta execução.
