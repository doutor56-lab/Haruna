# Android 1.4.0 e Windows 0.4.0

Base `f40eae872d4fa5fe9481f9d49f1c1c9e3192d9d4`, checkpoint `checkpoint/overdrive-before-desktop-sync-f40eae8`, branch `feature/android-overdrive`. Compilação das duas plataformas autorizada pelo usuário após as alterações de carregamento e voz. Sem merge em main ou downgrade dos runtimes.

## Android

Inclui o trabalho de carregamento por fases, downloads de voz em foreground service e continuidade da chamada ao alternar apps descrito em [VOICE_BACKGROUND_AND_LOADING.md](VOICE_BACKGROUND_AND_LOADING.md). Versão 1.4.0-overdrive, código 19, mesmo package `com.proxyslabs.haruna.overdrive`. O resultado da compilação e as limitações de assinatura serão registrados após o build. A compilação não comprova comportamento físico de microfone, serviços ou desempenho no Samsung/Teclast.

## Windows

- Escala 75–150% passa do `zoom` CSS para `WebContents.setZoomFactor`, validado na fronteira IPC e persistido na mesma preferência. O zoom CSS antigo é limpo. Cabeçalho, navegação, barra do modelo e compositor ocupam a largura disponível; mensagens continuam com limite de linha legível. O tamanho da janela não é reduzido para aplicar escala.
- UI é gerada da revisão Android atual, incluindo cartão de carregamento, envio de imagem somente por intenção explícita, painéis de voz não modais e indicador de downloads. Motores/aceleração do PC permanecem disponíveis em seção recolhível. O texto de importação de voz informa ONNX, sem anunciar suporte Windows a Whisper CPP que não existe neste backend.
- Último GGUF carregado é lembrado e restaurado na abertura, com fallback para o principal. Modelo ativo é reutilizado. Estado de carregamento vem do servidor real, com fase/nome/tempo; pronto exige `/health` positivo, sem percentual inventado. Não foi alterado sampler nem revisão do runtime.
- Download de voz continua no processo principal ao minimizar/trocar de app. Status é publicado até finalizar, cancelamento respeita o motor escolhido, e parar reprodução não apaga o estado do download. Há progresso na barra de tarefas e aviso de conclusão/falha, com acesso à seção de voz. Encerrar o aplicativo encerra suas operações.
- Extração mostra bytes comprimidos, hash de componentes é cancelável, Tiny usa o SHA-256 oficial conhecido e a validação multilíngue aceita o marcador final `= 50256`, rejeitando ranks inválidos/duplicados/inglês. Bytes instalados são separados dos bytes do pacote.
- Chamada ativa desativa throttling de segundo plano do Electron, restaurado ao encerrar. A captura e reprodução continuam locais. Não foi removida a interrupção/pausa por falta de microfone ou foco de áudio.

Mantidos AppData, conversas, referências a arquivos originais, modelos, CPU/Vulkan, SD1.5/SDXL/FLUX, documentos/OCR/visão e identidade compartilhada. Windows mantém executáveis próprios; patches JNI, serviço foreground Android, laboratório JNI e modelos Whisper CPP não são anunciados como recursos nativos Windows. Sem novas dependências ou migração destrutiva. Versão Windows 0.4.0.

## Verificações

- 20 testes Node passaram, incluindo ciclo LLM/imagem, restauração/cancelamento, documentos, componentes FLUX, vocabulário Whisper e controle de download (processos/instalador simulados nos testes de estado).
- Electron 45.2.3 real, em Linux headless: UI carregada, isolamento de contexto, ações de imagem e escala 75/100/125/150%. Foram medidos limites do conteúdo nativo, app, cabeçalho, menu, novo chat, compositor e navegação. Sem bordas vazias decorrentes da escala; screenshots revisados. Não é teste de inferência Windows.
- O mesmo teste geométrico foi integrado ao smoke do EXE empacotado no workflow Windows. Além disso, o workflow verifica CLI/runtime reais sem baixar um checkpoint de usuário ou simular imagem gerada.
- Integridade da UI Android, parser de intenção de imagem e segmentação de voz passaram. O workflow conjunto executa testes unitários e compila o APK ARM64, além do EXE x64.

Pendente: resultados do workflow, hashes e validação nos dispositivos. Não se declara ganho de tokens/s, TTFT, velocidade de carga ou inferência de imagem real com base em smoke/compilação. A assinatura debug anterior do Android não pode ser recuperada do certificado público: atualizar uma instalação com assinatura diferente exige a chave privada original; não desinstalar nem limpar dados para contornar.
