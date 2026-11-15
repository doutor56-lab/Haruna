# Leitura em voz — Android 1.4.1 / Windows 0.5.2

Base `61661fefe69d22f8cd61df5389b7c3e309cba624`, branch `feature/android-overdrive`.
Checkpoint `checkpoint/before-continuous-speech-61661fe`.

Problema confirmado no código Windows: o próximo trecho só começava a ser sintetizado depois do ACK de reprodução do anterior. Além disso, o renderer fechava e recriava o AudioContext em cada trecho. Isso somava o custo de síntese ao intervalo entre falas. No Android, `TtsManager` já antecipa a síntese com seu worker e mantém AudioTrack; essa implementação nativa foi preservada.

Alterações:

- Windows: sintetiza no máximo um trecho à frente enquanto toca o atual. Há um único worker de síntese, uma reprodução ativa e no máximo um PCM pronto em espera. Uma resposta inteira não é convertida para áudio em RAM.
- ACKs ordenados e serial crescente no processo, inclusive ao reler a mesma mensagem. Stop descarta o trecho antecipado e termina o worker; áudio tardio não inicia reprodução.
- Um AudioContext por fluxo no Windows, reutilizado entre trechos e fechado ao parar/finalizar. Preserva pausa, retomada, volume e indicador de nível.
- Segmentação compartilhada Android/Windows: libera frases curtas completas sem aguardar 24/48 caracteres; aceita vírgulas como fronteiras de cláusula após o mínimo de texto; limita o primeiro trecho a 96 caracteres e os seguintes a 180, respeitando palavras e pares Unicode. Mantém proteção de abreviaturas, thinking, cancelamento e ordem. Não altera o texto no chat/histórico.
- Não altera a voz, speaker, velocidade salva, modelo, etapas do TTS, STT, aparência ou parâmetros do LLM. O texto continua chegando incrementalmente à síntese; não é necessário esperar a resposta inteira.

Verificação: suíte Windows com 26 testes; cenários de worker e Web Audio são simulados e identificados como tais. Cobrem síntese do segundo trecho antes de terminar o primeiro, limite de um trecho antecipado, ordenação, ACK repetido/antigo, releitura da mesma mensagem, stop com áudio pronto e com síntese em andamento, reutilização/fechamento do AudioContext e parser compartilhado.

Não houve audição nem medição de lacunas com modelo real no aparelho. Antecipação remove a espera serial identificada, mas não garante áudio sem pausas: se o LLM entregar texto mais devagar do que se fala, ou o TTS sintetizar mais lentamente que a reprodução, ainda haverá espera. Aumentar a velocidade de fala não corrige esses gargalos.

Código compilado: `90bfae45ce68c80ba23367059e12d2cf34ebe249`. [Workflow Android/Windows](https://github.com/doutor56-lab/Haruna/actions/runs/43672793356).

Windows 0.5.2 concluído: [download](https://github.com/doutor56-lab/Haruna/actions/runs/43672793356/artifacts/14144548664), [relatório](https://github.com/doutor56-lab/Haruna/actions/runs/43672793356/artifacts/14144722930). EXE `Haruna-Windows-0.5.2-x64.exe`, SHA-256 `62cf08e2831b98204dca99dfe7664f155959e38edd8b441e12feff6021395b6e`. Testes do runner passaram e o EXE empacotado abriu no Windows x64; sem inferência de voz real no CI. Dados Windows permanecem no mesmo AppData.

Android 1.4.1 concluído: [APK ARM64](https://github.com/doutor56-lab/Haruna/actions/runs/43672793356/artifacts/14145516635). Gradle executou testes unitários e assembleDebug; pacote/nome/ABI verificados pelo workflow. APK `Haruna-Overdrive-ARM64.apk`, 79.351.241 bytes, SHA-256 `cb4ce1b61e642d62dcd39e80fb805551c0b3e993101371fec890075e8ab3c038`. Download conferido pelo hash e asset `voice/stream.js` inspecionado no APK para confirmar os novos limites.

Certificado Android SHA-256: `45e285dfdf382d7eceeeb711ed3aec9135a3a6c249f3ae83ec7c9b0e536316d0`, **diferente** da build 1.4.0 (`ceaf75d3e79964982db95ccb0583e2e70a7bf1f47efcf2045b98ffa39df1646c`). Portanto este APK não atualiza aquela instalação no mesmo sandbox sem a chave privada correspondente. `SIGNATURE.txt` acompanha o artefato. Nenhum dado ou aplicativo foi removido para contornar esse impedimento.

Ambos os jobs concluíram com sucesso. Teste físico de fluidez, microfone e saída de áudio permanece pendente. O fluxo Android atual usa assinatura debug gerada pelo SDK; não há keystore persistente configurada no workflow. Portanto não é possível garantir que o novo APK substitua uma build antiga sem incompatibilidade de assinatura. Tentar atualização é seguro; se o Android rejeitar a assinatura, **não desinstalar nem apagar os dados existentes** para contornar o bloqueio. Não foi mudado o applicationId para criar uma cópia paralela.
