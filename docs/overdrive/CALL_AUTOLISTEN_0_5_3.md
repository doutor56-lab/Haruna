# Windows 0.5.3 — chamada contínua, aviso de turno e proteção do aplicativo

Base: `0c31351db70bfeb2d1d3edf29294da057fcb86fc`, branch `feature/android-overdrive`.
Checkpoint: `checkpoint/before-call-autolisten-0c31351`.

## Comportamento

- Abrir a chamada inicia a escuta, sem exigir um segundo clique em Falar. Acesso ao microfone continua condicionado à permissão do sistema.
- O Windows mantém VAD/microfone durante silêncio: descarta PCM antigo mantendo cerca de 0,5 s de pré-roll, em vez de encerrar a captura ao completar dez segundos sem fala. O buffer continua limitado e o limite existente de fala é mantido. Ditado mantém o comportamento anterior.
- O controlador compartilhado retoma após `no_speech`, sem pausar a chamada nem repetir sons periodicamente. Aguarda a liberação do chat/captura quando a conclusão JS e a limpeza nativa chegam em ordens diferentes; tenta por até dez segundos e apresenta erro se o recurso continuar ocupado.
- Após a resposta, um tom senoidal curto (880 Hz / 85 ms, volume suave proporcional à voz) sinaliza a vez do usuário quando a captura confirma `listening`. Funciona offline, sem arquivo de áudio ou modelo adicional. Eventos duplicados de fim de áudio são ignorados.
- Pausa manual continua pausada; retomar e encerrar cancelam timers/sons pendentes. A chamada permanece por turnos: o microfone não grava a resposta da própria Haruna.

## Fechamento relatado no Windows

Não foi possível reproduzir o fechamento específico do PC neste ambiente Linux. Vinte ciclos isolados do VAD oficial com os antigos workers passaram; isso não comprova comportamento no Windows. Não se declara uma causa nativa específica como demonstrada.

Foram identificadas operações assíncronas de encerramento/resultado sem tratamento local completo. A implementação agora trata essas rejeições no pedido correspondente. Para conter falhas nativas, os motores de voz executam em `Electron utilityProcess`, fora do processo principal, com o mesmo Sherpa/ONNX e modelos existentes. Mantém um único processo de síntese e a antecipação limitada de áudio. Saída inesperada é convertida em erro da operação; barreiras de liberação precedem o próximo motor. Recursos GGUF/imagens permanecem intactos.

Diagnóstico local limitado: ações start/finish/stop/pause/resume e encerramento esperado/inesperado dos processos, tipo de motor e código de saída. Sem texto livre de exceção, prompt, transcrição, PCM, caminhos de modelos ou identificadores de conversas.

Arquivo: `%APPDATA%\Haruna Windows\diagnostics\runtime.jsonl` (rotação existente de 32 KiB). Se a nova versão ainda fechar, esse arquivo e o módulo/código do erro no Visualizador de Eventos do Windows são necessários para determinar a causa no dispositivo. Uma falha externa ao processo de voz, como driver ou renderer, não é diagnosticada por inferência a partir dos testes de VAD.

## Verificação

- 27 testes Node passaram: inclui continuidade/limites de áudio, ACK antigo, cancelamento, PCM silencioso limitado, tratamento de falha de liberação e sinal sonoro sem tocar após encerramento.
- Chromium real, 320×700 e 800×360, temas claro/escuro: início automático, silêncio → nova escuta sem outro bip, pausa manual, fim de TTS → escuta + um som, fim duplicado ignorado, encerrar por cabeçalho/rodapé/miniplayer, resposta tardia descartada e chamada em segundo plano. STT/TTS e som são simulados nesses testes de UI.
- Electron real Linux: transporte IPC de Float32Array, cancelamento antes da inicialização, processo de teste encerrado com código 73 enquanto o aplicativo permanece aberto, dois ciclos reais do Silero VAD e preservação do layout nas quatro escalas. Não é geração/transcrição de voz real com o modelo do usuário.
- O smoke do EXE Windows foi ampliado para executar as mesmas verificações de processo e VAD oficial incluído no pacote.

## Entrega

Build Windows concluído com sucesso no commit `fa8d4acccc866a6fbca13ac04b4e850da54ad00b`: [workflow](https://github.com/doutor56-lab/Haruna/actions/runs/43677122588).

- [Baixar Haruna Windows 0.5.3 x64](https://github.com/doutor56-lab/Haruna/actions/runs/43677122588/artifacts/14147355718). Extrair o ZIP e abrir `Haruna-Windows-0.5.3-x64.exe`; o AppData existente é reutilizado.
- SHA-256 do EXE: `ebdaf0a06f513b6b58f84b4f34b6241f6a9258b17b7e4b86ddabeb17d1c1f389`.
- [Relatório e screenshots Windows](https://github.com/doutor56-lab/Haruna/actions/runs/43677122588/artifacts/14147375636): EXE empacotado abriu, 27 testes do workflow passaram, transporte PCM e cancelamento antes de ready passaram, encerramento isolado código 73 preservou o aplicativo e dois ciclos reais do VAD passaram. Layout nas quatro escalas preservado.
- Não houve transcrição com Whisper nem síntese com o modelo TTS do usuário no CI. O isolamento adiciona o custo de um processo Node; consumo adicional de memória no PC não foi medido. Não se declara que a causa específica do fechamento relatado foi reproduzida ou eliminada no hardware do usuário.

 A mudança compartilhada de controle também está no código Android; não é uma nova build Android nesta entrega, cujo problema de fechamento foi confirmado como Windows. Audição do sinal e tentativa de reproduzir o fechamento original permanecem dependentes do PC do usuário.
