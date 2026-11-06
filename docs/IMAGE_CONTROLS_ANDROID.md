# Android — controles de imagem e recarga do GGUF

Base: `feature/safetensors-sd15` em `7e960b62a51ce2e71a1ee8483c53a1afc5750927`.
Checkpoint recuperável: `checkpoint/android-before-image-controls`.
Nenhum merge na principal; nenhum Vulkan/OpenCL ou atualização dos runtimes.

## Acréscimos

- Etapas com regulador e valor numérico; CFG com regulador e valor numérico.
- Resolução quadrada anterior preservada e diálogo de proporções, retrato/paisagem,
  presets M/L, inversão dos eixos, largura/altura personalizadas.
- Opções avançadas do motor: seed, descrição negativa, clip skip, sampler,
  scheduler e memória reduzida, conforme suporte real. Valores padrão de cada
  caminho preservados: SDXL 28 etapas/CFG5/clip2/Euler/normal; SD1.5 Safetensors
  mantém CFG7 e os padrões de sampler do SDK; MNN/Nezumi mantém CFG7,5.
- Preferências separadas por família/motor, sem migrar/apagar dados. Chamadas
  antigas configure(resolution/steps) continuam aceitas.
- O GGUF realmente carregado é capturado antes de descarregá-lo. A memória de
  imagem é liberada antes da recarga do mesmo caminho. Sem modelo anterior não
  há autoload. Sem caminho confirmado, o controlador recusa suspender o GGUF
  ativo e informa o motivo, preservando o carregamento atual. Em cancelamento/erro tenta restaurar; fechar o controlador não
  inicia uma recarga. Falha ao restaurar deixa aviso e preserva PNG concluído.
- Estado RESTORING_LLM separado; a interface não anuncia READY antes do backend.

## Capacidades e limites

Safetensors SD1.5/SDXL: dimensões por eixo 256–2048, múltiplos de8; o SDK recebe
uma grade compatível (64 SD1.5,32 SDXL), com mínimo nativo512. O excesso é
recortado no centro, sem esticar. Preferências quadradas antigas mantêm o
cálculo nativo512/1024 e redução final existentes. Presets M/L iguais aos do PC
para esse motor. Até100etapas; CFG1–20; seed -1 ou inteiro32 positivo; samplers
padrão/Euler/Euler a/DPM++2M; scheduler padrão/normal/Karras; clip -1 ou1–12.
Memória reduzida usa params_backend=disk e VAE tiling reais, sem GPU.

MNN/Nezumi não foi substituído: pacotes continuam com cálculo512². Proporções
nesse caminho ajustam o corte de saída até512 por eixo; não são inferência
retangular nem economia de computação. Presets M/L maiores ficam desativados,
sem controles fictícios. Até50etapas. Nezumi expõe CFG,seed,descrição negativa
 e samplers suportados pela API existente; Karras exige DPM++2M. Clip skip e
params_backend=disk não são APIs do Nezumi e ficam desativados. MNN Haruna
mantém sampler/condicionamento próprios; expõe CFG via hook pontual no código
pinned que já era adaptado pelo CMake, e seed pela API run existente. Não passa
negativo/sampler inexistente para esse caminho. Desempenho/salvamento e ações
anteriores de modelos e imagens continuam disponíveis.

Resoluções acima de1MP exigem confirmação na UI. Verificação preventiva de RAM
não garante ausência de LMK/OOM; dimensões grandes podem ser inviáveis/lentas
no Teclast. Nenhuma execução RIN/SDXL real no tablet foi alegada. Nenhuma mudança
em GGUF, chat, histórico, anexos, memória, voz ou personalidade.

## Validação

29 testes JUnit passaram. O controlador real com Android/motores falsos
passou preservação da instalação, seleção, histórico, cancelamento e cleanup;
também confirmou restauração do GGUF, aviso de falha mantendo PNG, ausência
de autoload sem GGUF anterior e ausência de recarga ao fechar. Não são testes
de inferência dos motores falsos.

UI 360×800 e800×1280 passou sliders CFG/etapas, dimensões, inversão, modal,
configurações, persistência do cartão, ações de PNG e botões antigos.
JNI com API SD falsa passou concorrência cancel/free. Os três adaptadores
C++ foram verificados contra os headers reais dos SDKs.

Inferência real no host Linux: SD1.5 público já utilizado anteriormente,
576×512,1etapa,CFG6,5,seed424242,CPU e params_backend=disk: PNG real de650.892
bytes,203,49s de geração, picoRSS3.858.628KiB e unload concluído. Uma etapa
valida o pipeline e os novos argumentos; não é avaliação de qualidade nem
medição Android. SHA-256 do PNG: `05f962ab8337ee79d845e6903c920fa71b1d69a38648fb2c09df4237ee240937`.

RIN/SDXL e recorte Bitmap no Android ainda exigem validação física. Não houve
perda intencional de funcionalidades nem mudanças em voz/GGUF/conversas.

## Build

A autorização anterior era para um único GitHub Actions, já utilizado no APK
anterior. O usuário autorizou um novo build para esta atualização. O push executa um
único job de compilação; o evento duplicado do PR desta branch fica sem runner
de build e em grupo separado, sem cancelar a compilação autorizada. Sem
SDK/NDK Android neste ambiente local. O código de aplicação é fa2f8692;
o commit seguinte muda somente CI/documentação para gerar o APK.

Para atualizar sem perder dados, a assinatura deve ser compatível com o APK
instalado. Não desinstalar para contornar conflito de assinatura: isso pode
apagar dados locais. A implementação não limpa armazenamento nem muda o
pacote Android; o CI usa a assinatura de desenvolvimento já existente.
