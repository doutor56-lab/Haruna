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
