# Haruna — integração Nezumi SD1.5 CPU

## Resultado

Implementação real de txt2img offline para os pacotes Nezumi Anything V5 e
CyberRealistic. Ambos produziram PNGs reais no host Linux; Android físico ainda
não foi validado. Não confundir esse resultado com geração no tablet.

Branch exclusiva: `feature/nezumi-model-compat`.
Base recuperável: `530f11809c981e229c53a1e1406972969533dc94`.
Commits: `ca4eac3` (integração), `558d35f` (evidência/cancelamento),
`4b5d6814820de9a9361f86502d219df16e75c3c4` (validação final).
O commit que adiciona este relatório não altera o binário.
Nenhuma branch estável foi escrita; nenhum merge.

## Arquitetura e escopo

Preservado motor antigo Haruna MNN/tokenizer.mtok, modelo GGUF, llama.cpp,
chat/histórico, STT/TTS, memória/RAG e interface normal. Apenas a seção já
existente de imagens informa os novos pacotes e desativa perfis que não se
aplicam ao Nezumi; não há redesenho ou novo chat.

Motor Nezumi em biblioteca compartilhada LGPL v3, separada do JNI Haruna.
MNN da Haruna permanece no mesmo pin; sem nova dependência de GPU, sem Vulkan,
OpenCL ou atualização de GGUF. Símbolos MNN são privados em cada DSO. Host
confirmou coexistência dos dois motores e unload independente.

Instalação privada/atômica, ZIP64/diretório central, CRC e SHA-256, controles
de caminhos, symlinks, duplicatas, tamanho, espaço e JSON. Apenas pacotes
SD1.5 com tokenizer BPE CLIP e embeddings compatíveis. Erro relacionado
corrigido na revisão: posições FP16 eram aceitas pelo validador, mas este motor
lê FP32; agora são recusadas. C++ protege o acesso às tabelas incompletas.
Teste real de tabela inválida retornou MODEL_INVALID (2), sem PNG nem crash.

Handles monotônicos e ownership shared_ptr, serialização de operações, lease
exclusivo de recursos com GGUF e cancelamento atômico cooperativo. Cancelar não
interrompe um kernel MNN em execução; verifica fronteiras e criação de estágios.
Carregar prepara tokenizer/embeddings; sessões CLIP/UNet/VAE são JIT e liberadas
sequencialmente. Native RGB tem free exatamente uma vez; Bitmap grava PNG real,
com resultado, salvar/compartilhar e histórico usando fluxo existente.

## Licença/fontes

Nezumi pin `e23719bdf4d74e7ad3cbc5bca467e3f7136eb95b`: licença raiz LGPL v3,
sem assumir como concedida a intenção MIT do README. Avisos, LGPL e GPL completos
no código/APK. Artefato técnico acompanha fontes correspondentes (incluindo MNN)
e instruções para reconstruir/substituir a biblioteca. Não foram copiados UI
Nezumi, local-dream ou pesos para o APK. Modelos têm licenças próprias.
MNN pin `c95758f4cd4cc4891a89833842dbd681109d3303`, Apache-2.0, inalterado.

## Testes

VALIDADO EM HOST/AUTOMAÇÃO, não dispositivo Android:

- 10 testes JUnit: legado, Nezumi, atomicidade, corrupção, caminhos, symlink,
  arquitetura/tokenizer/tabelas inválidos, cancelamento, espaço e validação negada.
- Controller real com Android/motores explicitamente fake: importar, seleção,
  preferências, concorrência/lease, load/unload, PNG fake, cancelamento, erro,
  cleanup, restart sem autoload e geração após cancelamento. Não é inferência.
- JNI real no host: FlatBuffer, load CPU, unload, destroy idempotente, cancelamento
  pré/início de geração e isolamento de handle antigo.
- Ambos ZIPs oficiais: importação Kotlin real, CRC/SHA restore, load/unload nativos.
- Chromium 360×800 e 800×1280: card, progresso, cancelar, persistência,
  configurações/preferências, visualizar/salvar/compartilhar com bridge mock.
- Inferência real com pesos verdadeiros, offline CPU Linux x86-64:

| Modelo | Caminho | Resolução / steps | Tempo total host | Pico RSS host |
| --- | --- | --- | --- | --- |
| Anything V5 | C API Nezumi | 512² / 5 | 311,27 s | 2726372 KiB |
| CyberRealistic | JNI generateRgb | 512² / 5 | 276,63 s | 2781604 KiB |

Seed 424242, DPM++ 2M, CFG 7.5; prompt público de maçã. Evidências, hashes e
parâmetros em `docs/evidence/nezumi/HOST_EVIDENCE.json` e PNGs nessa pasta.
A revisão final `4b5d681` repetiu CyberRealistic via JNI: 308,35 s,
pico RSS 2781488 KiB, PNG SHA-256 idêntico ao anterior
(`6d650cd5e68e33734debaeee9c27b696f22043e13f96ebfa2a0aae2230f2a58d`).
Foi executada sob carga concorrente de testes; não é comparação de desempenho.

Esses tempos não são promessa nem benchmark do Android. Memória medida por
ru_maxrss do processo filho no Linux, não PSS do tablet.

## Build/artefatos

Workflow: https://github.com/doutor56-lab/Haruna/actions/runs/42039920698
Commit do binário: `4b5d6814820de9a9361f86502d219df16e75c3c4`.
Resultado: **SUCCESS**. `:app:compileDebugKotlin`, check Silero existente,
controller fake, `:app:testDebugUnitTest` e `:app:assembleDebug` passaram.
Build nativo otimizado Release; instalador DEBUG ARM64.

APK: `Haruna-Nezumi-ARM64-debug.apk`, 41118146 bytes.
SHA-256: `29f33777f05d40789502285839a5883cc00b9d6aa8004ca4c15f1dc071c335e1`.
Download: https://github.com/doutor56-lab/Haruna/actions/runs/42039920698/artifacts/13421573348
Fontes/licenças/relatório técnico:
https://github.com/doutor56-lab/Haruna/actions/runs/42039920698/artifacts/13422382865

APK baixado do Actions e hash recalculado localmente. Arquivo de instalação
contém apenas o APK; artefato técnico fica separado. Sem pesos MNN/GGUF no APK.
Bibliotecas somente ARM64. JNI tem NEEDED libharuna_nezumi_engine.so; esta não
depende de Vulkan/OpenCL ou libMNN.so. Símbolos MNN privados, API C/JNI confirmada;
segmentos ELF das bibliotecas novas alinhados a 16 KiB. Os 65 assets originais
conferidos (exceto image-models.js) são byte a byte iguais à base, incluindo chat
e voz. App ID `com.proxyslabs.haruna.incremental` e versão existentes preservados.

Avisos de build, sem alteração fora de escopo: SDK XML CXX5304, depreciações
Node/FetchContent nas dependências existentes. Conversor UTF-16/UTF-8 usa a
biblioteca padrão C++17 codecvt/wstring_convert, depreciada mas ainda suportada
nesta versão; não foi trocada por implementação manual ou dependência adicional.
Nenhum desses avisos impediu o build.

## Limitações e teste no tablet

Requer validação física no Teclast: ARM FP16/INT8, pico de memória/LMK,
carregamento, geração, cancelamento durante UNet/VAE, nova geração após cancelar,
salvar/compartilhar/galeria e retomada de GGUF/chat/voz. Nenhum teste físico foi
alegado. Pré-checagem de 3 GiB livres não garante ausência de OOM/LMK.

Saída nativa 512²; preferência 256² reduz o PNG depois, não o custo computacional.
Cinco steps podem ser insuficientes para qualidade em outros prompts SD1.5.
CPU Nezumi usa quatro threads/configuração própria; perfis antigos são preservados
para o motor antigo. Sem safetensors, conversão local, SDXL ou img2img exposto.

Importar requer espaço temporário para ZIP + extração, além de 128 MiB de margem.
CRC/SHA locais não autenticam um pacote desconhecido; nomes Anything/CyberRealistic
são atribuídos apenas aos SHA oficiais conhecidos. Fontes e URLs exatas dos modelos
estão em `IMAGE_ENGINE_NEZUMI_INTEGRATION.md`; pesos não estão nos artefatos.

Roteiro curto: instalar APK → Configurações/Imagens → importar ZIP oficial sem
renomear/descompactar → selecionar → carregar → gerar descrição simples no chat.
Aguardar etapas e PNG; abrir/salvar/compartilhar. Cancelar outra geração e gerar
novamente. Reabrir para confirmar escolha e histórico. Recarregar GGUF pelo fluxo
existente ao voltar ao texto. Nenhuma exclusão de conversas/modelos é necessária.
A assinatura debug do CI pode diferir de APKs anteriores; não desinstalar para
resolver conflito de assinatura sem antes preservar seus dados.

Não foram corrigidos bugs fora do escopo. Limitações conhecidas acima foram
mantidas explícitas, sem imagens simuladas, sucesso fictício ou fallback silencioso.

## Arquivos alterados

- `.github/workflows/android-build.yml`
- `app/src/main/assets/haruna/image-models.js`
- `app/src/main/assets/licenses/nezumi/GPL-3.0.txt`
- `app/src/main/assets/licenses/nezumi/LGPL_LICENSE`
- `app/src/main/assets/licenses/nezumi/MNN-LICENSE`
- `app/src/main/assets/licenses/nezumi/NOTICE`
- `app/src/main/assets/licenses/nezumi/README.md`
- `app/src/main/cpp/image/CMakeLists.txt`
- `app/src/main/cpp/image/nezumi.cmake`
- `app/src/main/cpp/image/nezumi/CMakeLists.txt`
- `app/src/main/cpp/image/nezumi/GPL-3.0.txt`
- `app/src/main/cpp/image/nezumi/HARUNA_CHANGES.md`
- `app/src/main/cpp/image/nezumi/LGPL_LICENSE`
- `app/src/main/cpp/image/nezumi/NOTICE`
- `app/src/main/cpp/image/nezumi/README.md`
- `app/src/main/cpp/image/nezumi/UPSTREAM-LICENSE.md`
- `app/src/main/cpp/image/nezumi/android/jni/mnn_sd_jni.cpp`
- `app/src/main/cpp/image/nezumi/include/mnn_sd/engine.h`
- `app/src/main/cpp/image/nezumi/include/mnn_sd/export.h`
- `app/src/main/cpp/image/nezumi/include/mnn_sd/model_config.h`
- `app/src/main/cpp/image/nezumi/include/mnn_sd/types.h`
- `app/src/main/cpp/image/nezumi/src/c_api.cpp`
- `app/src/main/cpp/image/nezumi/src/engine_detail/sd_lifecycle.cpp`
- `app/src/main/cpp/image/nezumi/src/engine_detail/sd_lifecycle.h`
- `app/src/main/cpp/image/nezumi/src/engine_detail/sd_log.h`
- `app/src/main/cpp/image/nezumi/src/engine_detail/sd_model_kind.h`
- `app/src/main/cpp/image/nezumi/src/engine_detail/sd_path.h`
- `app/src/main/cpp/image/nezumi/src/engine_detail/sd_pipeline.cpp`
- `app/src/main/cpp/image/nezumi/src/engine_detail/sd_schedulers.cpp`
- `app/src/main/cpp/image/nezumi/src/engine_detail/sd_schedulers.h`
- `app/src/main/cpp/image/nezumi/src/engine_detail/sd_session.cpp`
- `app/src/main/cpp/image/nezumi/src/engine_detail/sd_session.h`
- `app/src/main/cpp/image/nezumi/src/engine_detail/sd_tensor_io.cpp`
- `app/src/main/cpp/image/nezumi/src/engine_detail/sd_tensor_io.h`
- `app/src/main/cpp/image/nezumi/src/engine_detail/sd_tokenizer.cpp`
- `app/src/main/cpp/image/nezumi/src/engine_detail/sd_tokenizer.h`
- `app/src/main/cpp/image/nezumi/src/engine_internal.h`
- `app/src/main/cpp/image/nezumi/src/mnn_session.cpp`
- `app/src/main/cpp/image/nezumi/src/model_config.cpp`
- `app/src/main/cpp/image/nezumi_engine.map`
- `app/src/main/cpp/image/nezumi_jni.cpp`
- `app/src/main/cpp/image/nezumi_jni.map`
- `app/src/main/java/com/proxyslabs/haruna/image/ImageArchiveFormat.kt`
- `app/src/main/java/com/proxyslabs/haruna/image/ImageBridge.kt`
- `app/src/main/java/com/proxyslabs/haruna/image/ImageFiles.kt`
- `app/src/main/java/com/proxyslabs/haruna/image/ImagePackage.kt`
- `app/src/main/java/com/proxyslabs/haruna/image/NezumiImageNative.kt`
- `app/src/main/java/com/proxyslabs/haruna/image/NezumiPackage.kt`
- `app/src/test/java/com/proxyslabs/haruna/image/NezumiPackageTest.kt`
- `docs/IMAGE_ENGINE_NEZUMI_INTEGRATION.md`
- `docs/evidence/nezumi/HOST_EVIDENCE.json`
- `docs/evidence/nezumi/anything-host.png`
- `docs/evidence/nezumi/cyber-host.png`
- `tests/image_controller_check.py`
- `tests/nezumi/JniCheck.kt`
- `tests/nezumi/RealGeneration.kt`
- `tests/nezumi/RealImport.kt`
- `tests/nezumi/cpu_smoke.cpp`
- `docs/ETAPA_NEZUMI_RESULTADO.md` (este relatório).

## Reconstrução isolada da biblioteca LGPL

O artefato de fontes contém `image-source/image` e `image-source/MNN`. Para
reconstruir sem depender do projeto Android completo, crie um wrapper CMake:

```cmake
cmake_minimum_required(VERSION 3.22)
project(HarunaNezumiReplacement LANGUAGES C CXX)
add_subdirectory("${IMAGE_SOURCE}" image)
```

Configure com CMake 3.31.6 e NDK 29.0.13113456 (troque caminhos absolutos):

```sh
cmake -S wrapper -B replacement \
  -DCMAKE_TOOLCHAIN_FILE="$ANDROID_NDK_HOME/build/cmake/android.toolchain.cmake" \
  -DANDROID_ABI=arm64-v8a -DANDROID_PLATFORM=android-33 \
  -DCMAKE_BUILD_TYPE=Release \
  -DIMAGE_SOURCE=/absoluto/image-source/image \
  -DFETCHCONTENT_SOURCE_DIR_MNN_IMAGE=/absoluto/image-source/MNN
cmake --build replacement --target haruna_nezumi_engine --parallel 2
```

O override FetchContent usa a fonte MNN fornecida. Preserve `mnn_sd_*` da API
pública. Substitua `lib/arm64-v8a/libharuna_nezumi_engine.so` no APK, execute
zipalign/apksigner com sua chave. Não há bloqueio de hash/assinatura do motor;
Android pode exigir reinstalação para outra chave — preserve seus dados antes.
O README da biblioteca também descreve reconstrução do APK completo na revisão
correspondente; este wrapper esclarece o caminho isolado com a fonte fornecida.
