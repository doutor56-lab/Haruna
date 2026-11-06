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


## Resultado do build autorizado

- Workflow: https://github.com/doutor56-lab/Haruna/actions/runs/42226923268 — SUCCESS.
- Commit compilado: `174975fef45bd20f7b9c23eee0784d94dd3b2866`.
- Código da aplicação: `fa2f8692cbe65adaeca3f833d367d1bd4956a03b`; o commit de build altera apenas CI/documentação.
- Um job de compilação executado; nenhum merge.
- Instalador: [artefato contendo somente o APK](https://github.com/doutor56-lab/Haruna/actions/runs/42226923268/artifacts/13510405233).
- [Fontes e relatório do build](https://github.com/doutor56-lab/Haruna/actions/runs/42226923268/artifacts/13509930414).
- Arquivo: `Haruna-Multimotor-Controles-ARM64-debug.apk`, 58.396.010 bytes.
- SHA-256: `af9e2491a0cfeebeb437cb4706c9527e8f9e1718cd7bcefe454a8e2a04b8c9ec`.

Kotlin, testes unitários/controlador/JNI, assembleDebug, verificação do pacote
e publicação das fontes passaram no CI. O arquivo foi baixado; seu hash confere
com o log do CI. ZIP de instalação contém somente o APK. Sem geração real no
Android durante este build.

### Preservação conferida no APK

Comparado ao APK anterior entregue (run42144339412): nenhum asset anterior
removido; 64 arquivos Haruna fora dos três módulos de imagem alterados são
idênticos byte a byte, incluindo chat, voz, memória e interface geral.
Todos os23 caminhos de bibliotecas nativas anteriores permanecem presentes.
Silero é idêntico. Novo módulo image-controls.js presente. Sem biblioteca Vulkan.
Biblioteca SD é ELF64/AArch64 e depende apenas das bibliotecas de sistema;
o SDK GGML de imagem segue isolado do GGUF/Whisper.

### Impedimento para atualizar sobre o APK anterior

A comparação dos certificados APKv2 confirmou assinaturas diferentes:

- APK anterior: `a3eef5d1e124201189420769f5cb514fd7d50cc75c6d6a08c6058c6a65f36520`.
- APK novo: `4533db1f26377ea913cd835dee862c776df95c45d35a4709b77f4b3ed16025b2`.

São hashes SHA-256 dos certificados, não hashes dos APKs. O pipeline usa
assinatura debug padrão; a chave privada do APK anterior não foi fornecida
nem encontrada no repositório consultado. Não houve mudança de pacote
(`com.proxyslabs.haruna.incremental`) nem rotina para limpar dados.

O Android bloqueará atualização direta sobre aquele APK anterior por
incompatibilidade de assinatura. **Não desinstale nem limpe os dados para
contornar o bloqueio.** Para atualizar mantendo os dados é necessária a chave
anterior ou uma migração com backup integral verificado. Essa migração não foi
executada: não há acesso ao tablet neste ambiente. Nenhuma garantia de
preservação numa desinstalação foi feita.

Esta limitação de instalação não deve ser confundida com aprovação de inferência
RIN ou com regressão funcional demonstrada. Os recursos estão implementados e
compilados; RIN/SDXL e o uso real no Teclast continuam sem validação física.
