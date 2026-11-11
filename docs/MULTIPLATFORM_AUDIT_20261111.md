# Haruna Android / Windows — auditoria e integração

## Base preservada

- Android: `design/haruna-paginas-aprovadas-20261108`, commit `e0fa47f8e42e6ada3be7f449a8b39399867ce461`.
- Windows reutilizado: `port/windows-from-working-42504813611`, commit `9228b88135483e525e175f8b0a002d684a7f48bb`.
- Checkpoint: `checkpoint/multiplatform-20261111`.
- Trabalho: `integration/haruna-multiplatform-20261111`. Nenhum merge na main.
- Android continua em llama.cpp `4d71b42fd87db24b8b7c808c151b713aa4459cfd`; não alteramos seus kernels, templates, sampler ou proteção híbrida.
- stable-diffusion.cpp continua em `f5df5f8b84f139f1e80496902da90798a0d92896`. Foi conectado seu suporte existente a FLUX.1, sem atualizar o SDK.

## Correções verificáveis

1. O teste Windows tinha regex inválida e não iniciava. Também faltava a fixture de executável do teste de servidor. Ambos corrigidos, sem remover verificações.
2. A persona Windows era uma cópia antiga: agora é gerada da identidade/comportamento Kotlin atuais. O prompt normal Android não mudou.
3. Tags de raciocínio podiam invalidar o JSON da decisão de imagem. O classificador reutiliza o ThinkParser existente e continua aceitando somente uma ação JSON estrita, sem alterar o prompt original.
4. Campos do painel de imagem tinham fundo escuro e texto escuro no tema claro. Passaram a usar a paleta ativa. A largura móvel deixa margem lateral; não virou tela cheia.
5. Windows permitia persistir quatro imagens, mas executava uma. Agora executa sequencialmente, com seeds distintas, progresso real e resultados parciais preservados ao cancelar.
6. Encerramento nativo podia ser considerado concluído após uma promise de erro, antes do evento close. Agora aguarda close; uma falha de liberação impede restaurar outro motor pesado.
7. Componentes FLUX privados são removidos quando o usuário confirma a remoção; originais externos e PNGs continuam preservados. Modelos ausentes também podem ser removidos da lista.

## Funcionalidades conectadas

| Função | Android | Windows |
|---|---|---|
| Interface/conversas/Biblioteca/Memória | Assets atuais | Cópia desses mesmos assets, com adaptadores de plataforma |
| GGUF | Runtime existente, CPU padrão preservado | llama.cpp CPU/Vulkan b12130, hashes fixados |
| SD1.5/SDXL completo | Adaptador existente preservado | Importação e CLI CPU/Vulkan |
| FLUX.1 dev/schnell | JNI real, quatro componentes, CPU | Quatro componentes, CLI CPU/Vulkan |
| Voz local | sherpa/whisper.cpp/Silero/Supertonic existentes | sherpa-onnx-node 2.0.1, Silero, Whisper ONNX e Supertonic em workers |
| Documentos/OCR/visão | Implementação existente preservada | PDF.js, Mammoth compartilhado, Tesseract, SQLite FTS5 e llama-server multimodal |

Vulkan solicitado no Windows não é apresentado como offload comprovado. No LLM,
o efetivo é preenchido quando o runtime relata camadas offloaded; sem confirmação,
fica desconhecido. Configuração de backend vale no próximo carregamento.

Diferenças reais permanecem explícitas: MNN/Nezumi, Whisper GGML e o DBG JNI são
do Android. O Windows usa os adaptadores acima. O CLI Windows recarrega os pesos
entre imagens do lote; o Android mantém sua sessão. O CLI não fornece prévias
progressivas nessa integração; a opção fica indisponível, sem simulação.

## Modelos de imagem e Civitai

Não há suporte universal ao catálogo. São aceitos checkpoints SD1.5 e SDXL/Illustrious
completos, nas estruturas verificadas, e conjuntos FLUX.1 txt2img dev/schnell:

- Difusão original/Comfy compatível em GGUF ou safetensors.
- `clip_l.safetensors`.
- `t5xxl.gguf` ou `t5xxl.safetensors`.
- `ae.safetensors`.

Na interface, **Adicionar conjunto FLUX.1** abre seleção múltipla. Use nomes com
prefixo clip_l, t5xxl e ae/vae para esses três componentes; o restante é difusão.
O Android também aceita ZIP na raiz com `haruna-image-model.json`, formato
`sdcpp_components_v1`, arquitetura `flux1-dev`/`flux1-schnell` e SHA-256 por componente.
Há validação de tamanho, formato, shapes, presença dos componentes e integridade;
a instalação é atômica. GGUF de conversa não é aceito como difusão/T5 só pela extensão.

Limite atual do conjunto: 8 GiB. GGUF: F32/F16/BF16, Q4_0/Q4_1, Q5_0/Q5_1, Q8_0
e Q2_K até Q8_K conforme o inspetor. Não anunciamos outras quantizações.
LoRA isolado, FLUX.2/Fill, SD2/SD3 e conjuntos incompletos não são habilitados.
Um cabeçalho válido é só pré-validação: o runtime ainda precisa confirmar o modelo.
Modelos grandes podem não caber no Teclast; importar não executa inferência nem
garante RAM suficiente. Resoluções pequenas podem usar cálculo interno maior e
corte, como já fazia o motor Android; o tamanho interno é informado.

## Testes executados localmente

- Suíte Windows: 16 testes passaram, incluindo servidor HTTP/streaming, exclusão
  dos motores, lote/cancelamento, perfis, FTS5 e validação de componentes. Processos
  de geração e pesos dessas fixtures são explicitamente simulados.
- Electron real 45.2.3: inicialização, isolamento de Node no renderer, painel,
  proporções, persistência/reload e corte PNG. Sem geração por difusão nesse smoke.
- Kotlin 2.3: classes de imagem novas compiladas; controlador Android real testado
  com Android/JNI simulados. Nezumi/SD1.5/SDXL, lote de quatro, cancelamento e retorno
  do GGUF passaram. Importação ZIP FLUX, shapes GGUF e corrupção/ausência passaram
  com arquivos estruturais esparsos, nunca apresentados como pesos treinados.
- C++ JNI: compilação contra o header do SDK fixado e teste de cancel/free e progresso
  com C API simulada; não é prova de inferência ARM64.
- Chromium: chamada em 320×700 e 800×360, claro/escuro; Biblioteca, busca, prévia de
  página, DOCX real e histórico em 360×800 e 800×1280, com pontes simuladas.
- Voz REAL em Linux: Supertonic gerou PCM, Silero detectou fim de fala e Whisper Tiny
  transcreveu esse PCM. A frase pública “Olá Haruna, que horas são?” foi transcrita
  incorretamente, com repetição. Comparar padding 300/1000 não resolveu; não alteramos
  parâmetros como se isso tivesse corrigido a qualidade. Não foi teste de microfone.
- OCR REAL português/inglês leu “HARUNA OFFLINE OCR”; PDF.js renderizou uma página
  real e Mammoth extraiu título/parágrafo/tabela em ordem. Ambiente Linux.
- Integridade dos assets, syntax checks JavaScript, intenção de imagem, orbe,
  drawer e SQLite Android FTS5/FTS4 passaram.

## Entrega e limites

Os builds Android ARM64 e Windows x64 estão preparados em `multiplatform.yml`.
Não foram iniciados nesta revisão: o repositório é **privado** e houve instrução
de não gastar Actions sem autorização. O workflow exige disparo manual ou commit
`[build approved]`; commits de preparação usam `[skip ci]`.

Não foi gerado APK/EXE novo nem PNG por difusão nesta validação. Ainda precisam de
compilação final e execução real em Windows e no Teclast/celular: Vulkan/driver,
modelos SD/FLUX, SmolVLM, microfone, saída de áudio e pico de RAM. Não prometemos
qualidade do Tiny nem viabilidade de todo FLUX em cerca de 6 GB.

O applicationId Android e os diretórios de dados foram preservados. Não há limpeza
de histórico ou migração destrutiva. A assinatura do APK anterior não foi recuperada;
uma atualização sobre o app instalado exige a mesma chave. Não desinstale nem apague
dados para contornar uma incompatibilidade de assinatura.
