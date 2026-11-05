# ETAPA 9B — pipeline real SD1.5 MNN CPU e integração no chat

Base: `9bab76c873ebb4196ea1ad1892e6f6b9a1a3d8f0`, branch exclusiva `feature/offline-image-generation`.
Checkpoint: `checkpoint/image-9a-9bab76c`. PR #4 continua experimental, sem merge; base estável `luna/silero-vad` preservada. Não incorpora o experimento Vulkan.

## Implementação

O JNI agora chama o pipeline StableDiffusion oficial do MNN fixado em `c95758f4cd4cc4891a89833842dbd681109d3303`: tokenizer.mtok/CLIP → ruído → scheduler PNDM/PLMS e UNet/CFG → VAE → PNG. O código do pipeline e o tokenizer são compilados junto ao motor CPU isolado, sem outro motor LLM. O llama.cpp permanece inalterado. Suporte oficial MNN_LOW_MEMORY e MNN_SUPPORT_TRANSFORMER_FUSE habilitado, como no build upstream de difusão; tokenizer inclui unicode.cpp e unicode_data.cpp. MNN_ARM82 habilitado no motor de imagens, com seleção FP16 condicionada a supportFp16arith pelo próprio MNN, sem alterar GGML/LLM. OpenCV/imgcodecs MNN habilitados somente para o motor de imagens; Vulkan, OpenCL, Metal e CUDA permanecem desativados.

Para embedding estático no Android, MNN_BUILD_FOR_ANDROID_COMMAND evita o POST_BUILD de exportação de headers aplicado indevidamente ao object target MNNOpenCV (CMake rejeitou essa configuração no primeiro CI). Não muda o backend para GPU nem cria executável Android.

As adaptações no código copiado durante o CMake são explícitas em `pipeline.cmake`: entradas de warm-up inicializadas; módulos/resultados verificados; leitura materializada antes de confirmar uma etapa; checkpoints cooperativos; falha de imwrite propagada. Não há imagens prontas, serviço externo ou inferência fictícia no aplicativo.

O pipeline oficial suporta **512×512 nativo**. A preferência padrão **256×256** reduz o PNG após a inferência; não economiza o custo de inferência de 512. Isso aparece nas configurações. Etapas 1–50, padrão 5; balanced padrão corresponde ao memoryMode 2 oficial, economy 0, performance 1. Cinco passos não garantem boa qualidade para qualquer checkpoint SD1.5 não destilado. Não se declara compatibilidade com SDXL, Flux, qualquer MNN arbitrário ou safetensors. Grafos com FmhaV2/Fmhca/GroupNorm/SplitGeLU fundidos para GPU são recusados antes de descarregar o GGUF: essa revisão não registra executores CPU nem decomposição geometry para esses operadores. Não utilizar o pacote MNN opencl/metal como se fosse compatível com CPU.

## Instalação e modelo necessário

Continua o pacote ZIP da Etapa 9A: manifesto `haruna-image-model.json` (version 1, engine mnn, architecture sd15, displayName, SHA-256 em files), componentes `text_encoder.mnn`, `unet.mnn`, `vae_decoder.mnn`, `tokenizer.mtok`, e pesos externos `.mnn.weight` quando necessários. Os arquivos devem estar na raiz e corresponder ao exportador/pipeline MNN fixado. Instalação não dispara inferência. Não há GGUF, pesos ou downloads de modelo no APK. Safetensors/conversão local não implementados.

A arquitetura declarada no manifesto, hashes e FlatBuffers são validados, mas isso não prova compatibilidade numérica/semântica de um conjunto arbitrário de pesos. O carregamento real dos módulos e a inferência continuam necessários para confirmar compatibilidade.

## Chat e arquivos

Um botão discreto de imagem ao lado do anexo reutiliza a descrição digitada (ou solicita uma). Usa o mesmo armazenamento e histórico do chat; não cria uma segunda conversa. O cartão contém descrição, fase, passos realmente concluídos e cancelar. Após PNG validado, oferece visualizar, salvar e compartilhar. CSS novo é restrito ao botão/cartão; cabeçalho, navegação, voz e histórico existentes preservados.

PNG sempre permanece no diretório privado `generated-images`, associado por UUID à mensagem da conversa. LocalStorage guarda só metadados/descrição, nunca base64. Salvamento automático padrão significa também copiar para Pictures/Haruna usando MediaStore. Desativá-lo preserva o PNG privado necessário ao histórico. Visualização/compartilhamento usa FileProvider com concessão temporária de leitura; a WebView recebe apenas nomes UUID.png do diretório de imagens. Não expõe caminhos arbitrários.

Resultado terminal também é gravado em JSON privado por UUID para recuperar o cartão após recriação da tela. Um processo morto durante geração não é tratado como sucesso nem reinicia geração automaticamente. Excluir um chat não remove automaticamente os PNG da galeria/diretório privado nesta entrega.

## Segurança e recursos

Worker serial, aceitação síncrona que recusa operações concorrentes, lease já existente para descarregar GGUF e impedir sua recarga enquanto MNN ocupa o motor. Não muda o comportamento de inferência textual. Verificação de integridade cancelável, espaço e RAM antes de carregar (política preventiva: maior entre arquivos + 512 MiB e 3 GiB livres; não é medição nem garantia de consumo), limpeza em finally inclusive erro/cancelamento. A verificação de RAM é preventiva, não garantia contra LMK/OOM do Android.

Tickets de geração monotônicos no processo impedem que um cancelamento antigo cancele o próximo. Cancelamento reconhecido entre fases/chamadas de módulo e etapas de denoising, sem matar threads. **Não interrompe um kernel MNN ou operação de carregamento já em execução**: pode aguardar a chamada atual. Após terminar/cancelar, pipeline e lease são liberados, incluindo coleta dos blocos ociosos do allocator Express do próprio MNN, sem GC Java artificial; GGUF não é recarregado automaticamente. O usuário pode carregá-lo novamente pelo gerenciamento já existente.

## Validação executada / limites

- Controlador Kotlin real compilado/executado com doubles Android/JNI: instalação sem inferência, seleção/configuração persistidas, exclusão, unload, rejeição de owner concorrente, falha de load, geração serializada, metadados do resultado, cancelamento, ticket antigo e nova geração após cancelar.
- Fontes JNI/pipeline/tokenizer/scheduler compiladas no host contra os headers reais MNN fixados. Esse teste não executa pesos.
- Browser Chromium/Playwright, 360×800 e 800×1280, bridge simulado: criação do cartão no chat, apresentação do passo concluído, cancelamento, persistência após reload, abrir/fechar configurações, salvar preferências, ligações visualizar/salvar/compartilhar com PNG fixture, preservação após Nova conversa, controles antigos presentes, ícone único e ausência de overflow nos componentes novos. Não é teste físico Android nem inferência.
- APK Android completo, unit tests e empacotamento são executados pelo workflow `Android build` do commit deste PR; consultar o run correspondente e a entrega final para conclusão, artifact e SHA-256.

**Nenhum PNG de um modelo real foi gerado nesta sessão até a redação deste relatório.** O pacote real `taobao-mnn/stable-diffusion-v1-5-mnn-general` @ `56c93a62ac9d6b5d18605632b85e25f87281f317` foi baixado somente para teste Linux x86_64, com tamanho e SHA-256 dos pesos conferidos. Tokenizer exportado pelo código oficial MNN a partir de vocab IDs/merges idênticos ao SD1.5 oficial. O teste de cinco etapas foi encerrado por falta de memória antes de criar PNG. Com os flags oficiais low-memory/fuse habilitados, a tentativa balanced foi encerrada pelo OOM killer (SIGKILL), com pico amostrado de 6.405.730.304 bytes; uma tentativa economy foi interrompida preventivamente ao ultrapassar 6 GiB. Isso é evidência no host FP32, não medição Android nem prova de consumo ARM FP16. Não há dispositivo Android conectado. Os pesos não são incorporados ao código/APK. Não foi atribuída falsamente essa falha a um kernel específico. Portanto o critério de aceitação de primeira imagem real permanece pendente, ainda que o APK compile. Não se declara tempo, memória de inferência, qualidade, estabilidade absoluta, microfone ou GPU validados.

## Teste físico mínimo

1. Instalar APK experimental, abrir Configurações → Geração de imagens e importar o pacote SD1.5 MNN compatível com manifesto/hashes. Selecionar principal. Confirmar 256, 5, equilibrado, salvar na galeria.
2. No chat, digitar uma descrição simples; tocar no botão Gerar imagem. Confirmar GGUF descarregado, progresso de passos reais e PNG final. Visualizar, salvar e compartilhar; verificar Pictures/Haruna e voltar ao chat.
3. Reabrir aplicativo e conferir imagem e preferências. Iniciar outra geração, cancelar, aguardar liberação e tentar de novo. Recarregar GGUF e verificar chat/voz já existentes.

Requer validação física com modelo SD1.5 real. Não considerar geração funcional demonstrada apenas pelos testes com doubles.

## Arquivos alterados

- `.github/workflows/android-build.yml`
- `app/src/main/cpp/image/CMakeLists.txt`
- `app/src/main/cpp/image/image_jni.cpp`
- `app/src/main/cpp/image/pipeline.cmake`
- `app/src/main/cpp/image/pipeline_hooks.h`
- `app/src/main/cpp/image/pipeline_base.cpp`
- `app/src/main/java/com/proxyslabs/haruna/image/ImageBridge.kt`
- `app/src/main/java/com/proxyslabs/haruna/image/ImageNative.kt`
- `app/src/main/java/com/proxyslabs/haruna/image/ImageFiles.kt`
- `app/src/main/java/com/proxyslabs/haruna/image/ImagePackage.kt`
- `app/src/main/java/com/proxyslabs/haruna/MainActivity.kt`
- `app/src/main/AndroidManifest.xml`
- `app/src/main/res/xml/image_paths.xml`
- `app/src/main/assets/haruna/index.html`
- `app/src/main/assets/haruna/app.js`
- `app/src/main/assets/haruna/image-models.js`
- `app/src/main/assets/haruna/image-chat.js`
- `app/src/main/assets/haruna/image-chat.css`
- `tests/image_controller_check.py`
- `tests/image_ui_check.cjs`
- `reports/ETAPA_9B_RELATORIO.md`

Primeiro CI `41975345359`: Kotlin/Silero e testes de pacote passaram; configuração CMake falhou no POST_BUILD do object target MNNOpenCV. Corrigido com a opção oficial de embedding estático descrita acima. A entrega deve usar o APK do run posterior do commit corrigido, nunca esse run falho.
