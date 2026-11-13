# Overdrive 1.3.2 — restauração do GGUF na abertura

Base `954fa8f`, branch `feature/android-overdrive`, checkpoint `checkpoint/overdrive-before-autoload-954fa8f`. Relato: o GGUF só aparece carregado ao entrar em Configurações. Sem diagnóstico físico desta abertura, não se presume lentidão de disco nem se altera o aquecimento do SmolLM3.

## Alteração mínima

`MainActivity` iniciava a restauração somente no primeiro `onPageFinished` da WebView. Agora agenda `autoLoadPrimaryModel()` no fim de `onCreate`, após configurar as pontes. O trabalho continua no executor existente de modelos, fora da thread principal. A seleção existente (último/principal/primeiro GGUF instalado), a guarda de instalação em andamento e a reutilização do modelo já carregado no processo permanecem.

`onPageFinished` da página local passa a republicar o estado atual, sem recarregar o modelo. O backend também notifica o início da manutenção/carregamento, além do término. Assim a interface pode mostrar a preparação antes do estado final e recuperar o estado caso notificações iniciais tenham ocorrido antes de seus listeners estarem prontos. Não cria polling, serviço ou segundo contexto.

Não se alterou prompt, sampler, threads, contexto, motores de imagem/voz, preferências, GGUF instalado ou dados. Não se removeu o snapshot estático nem se transferiu seu custo para a primeira mensagem. A alteração elimina a dependência do carregamento em relação à WebView; **não demonstra redução do tempo nativo de carregar pesos/prefill**.

## Verificação e limite

- `tests/overdrive_ui_check.cjs` passou em 360×800 e 800×1280, incluindo transição preparando→carregado na página do chat e preservação do rascunho, antes de abrir Configurações. Ponte nativa simulada: não testa `Activity.onCreate` num Android real.
- Testes existentes de intenção de imagem, segmentos/streaming de voz, integridade da interface e `git diff --check` passaram.
- Build Android e APK serão registrados após conclusão. Requer validação física: abrir o processo encerrado com um GGUF instalado, permanecer em Conversas e conferir preparação→carregado sem navegar ou tocar em Usar. Reabrir uma Activity com modelo ainda ativo deve reutilizá-lo.
- A limitação de assinatura debug anterior permanece; não desinstalar nem apagar dados para tentar atualizar com certificado diferente. Sem chave de assinatura anterior, não se afirma atualização compatível.

## Entrega verificada

O usuário esclareceu que basta abrir Configurações para o modelo carregar e que tocar em Usar parece acelerar. `useModel()` já agenda `prepareModel()` diretamente; a restauração automática agora também é agendada em `onCreate`. Sem log do aparelho, não se afirma qual parte da percepção anterior era atraso real de carga ou estado visual atrasado.

- Commit compilado `e9a22a61926773a4459de780e8ee83f4c8f87fa4`, versão 1.3.2-overdrive, código 18.
- [Actions 43356402687](https://github.com/doutor56-lab/Haruna/actions/runs/43356402687): sucesso; `:app:testDebugUnitTest :app:assembleDebug`, `BUILD SUCCESSFUL in 24m 57s`.
- [Artefato ARM64](https://github.com/doutor56-lab/Haruna/actions/runs/43356402687/artifacts/14007756213), disponível até 20/11/2026. Contém `Haruna-Overdrive-ARM64.apk` e `SHA256SUMS.txt`.
- APK baixado e conferido: 79324936 bytes; SHA-256 `20e1a9736a7ee09797994e6c7f397b7e54e0b2b8408d3b4b7bda7a0c6f9d5c82`, correspondente ao manifesto de hashes. Bibliotecas somente `arm64-v8a`; método `notifyCurrentStatus` presente no DEX do APK.
- Certificado SHA-256 `a9fb097f5df144785cbcf0acaf54da9d36603dc65a3a4fe79e6295b3e58d841b`, diferente do APK 1.3.1 (`3f8f434c09151777f97f2fa42396c5b2727f64d00275127b9356b0abc5037940`). A instalação anterior não pode ser atualizada preservando o sandbox sem sua chave original. Não se alterou applicationId nem se apagaram dados para contornar esse impedimento.

O teste físico de abertura automática e seu tempo permanecem pendentes. A compilação não comprova aceleração nativa ou resolução do relato no dispositivo.
