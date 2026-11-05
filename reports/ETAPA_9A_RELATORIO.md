Etapa 9A — Configurações e componentes MNN SD1.5

Base escolhida por data: luna/silero-vad @ 6edb9c30a2d53c08d4357ba6c19eed9e75105abd (2026-11-04), a mais recente sem os commits da investigação Vulkan. Branch de entrega: feature/offline-image-generation. Não houve merge ou alteração da base/versão estável.

Implementação

- Card adicional somente em Configurações; seleção por SAF OpenDocument. Preferências privadas: resolução solicitada 256, 5 etapas, equilibrado, autosave ativado, CPU. Resolução/etapas/autosave são preferências para geração futura, não parâmetros falsamente declarados efetivos.
- ZIP próprio contendo haruna-image-model.json versão 1, architecture=sd15, engine=mnn, displayName e hashes SHA-256 de cada componente. Arquivos na raiz: text_encoder.mnn, unet.mnn, vae_decoder.mnn, tokenizer.mtok; sidecars correspondentes .mnn.weight opcionais.
- scripts/pack_image_model.py empacota arquivos já convertidos; NÃO converte pesos. Uso: python3 scripts/pack_image_model.py pasta_modelo saida.zip --name "SD1.5 MNN". Não sobrescreve pacote existente.
- Instalação via streaming para diretório temporário, limite de 8 GiB/8 arquivos, nomes restritos, sem diretórios/traversal/duplicatas/arquivos não declarados; manifesto limitado a 64 KiB; espaço livre rechecado, hash dos arquivos, rename atômico. Sem carregar o LLM ou MNN em RAM. Cancelamento remove arquivos parciais; cópia em MiB é exibida sem percentual inventado.
- Manifestos/dados preservados no armazenamento privado; a inicialização revalida hashes em worker antes de listar. Modelo principal persiste em SharedPreferences. Importação não executa inferência. Pacote incompatível/corrompido é rejeitado, sem sobrescrever outro modelo.
- Formato .mnn é verificado com FlatBuffers Verifier da versão real do MNN, usando mmap e sem criar sessões. Limite de buffer FlatBuffers de 2 GiB por arquivo de grafo é respeitado; pesos grandes devem usar sidecars.
- Motor CPU nativo MNN fixado em c95758f4cd4cc4891a89833842dbd681109d3303, archive SHA-256 f6f6117e0ed89ec7896d29407469dd33075145d8748af9a8f89d3aa62a4928a6. Bibliotecas estáticas ocultas, JNI haruna_image separado de Whisper e llama.cpp. GPU/OpenCL/Vulkan/Metal/CUDA desativados no MNN. Nenhuma correção experimental Vulkan incorporada.
- Carregar cria realmente três MNN::Interpreter e sessões CPU, verifica nomes e dimensões de entradas compatíveis com SD1.5 (CLIP 2×77, UNet 2×4×64×64/contexto 2×77×768, VAE 1×4×64×64). Não executa geração. Estados distinguem INSTALLED, INCOMPATIBLE, LOADING, LOADED, ERROR e ausência de instalação.
- Lease compartilhado com o lifecycle LLM impede novos loads e gerações de texto enquanto imagens reservam o motor. O GGUF é descarregado com cancelamento/join existente ANTES de criar sessões MNN. Unload destrói os Interpreters e suas sessões; sem chamadas artificiais de GC. Ao sair da Activity, operação é cancelada e recursos liberados no worker. O histórico permanece no armazenamento original.
- Só uma operação de imagem por vez; RAM é consultada após unload GGUF. Checagem conservadora não elimina risco de OOM/LMK ou falha nativa. Instalação não exige esse orçamento de RAM.

Limitações explícitas

Geração completa de imagem NÃO está implementada nem declarada funcional nesta Etapa 9A. O botão carrega componentes MNN reais, não um pipeline de difusão com tokenizer/scheduler/execução. Nenhuma imagem real foi inferida nesta tarefa; nenhum GGUF foi baixado/trocado.
O tokenizer é obrigatório e protegido por hash, mas sua semântica completa ainda depende do pipeline de geração futuro. Manifesto declara família; a confirmação adicional é feita por schema/nome/dimensões de componentes, não por nome de arquivo sozinho. Hash garante integridade, não autenticidade de editor/conhecimento do modelo.
256×256 é preferência solicitada: o código SD1.5 de referência no MNN consultado usa latentes fixos 64×64 (512×512). Não há redimensionamento escondido nem promessa de geração 256 nativa. Cinco etapas não provam qualidade para um SD1.5 convencional.
Safetensors não é executável pelo MNN atual e não é aceito como instalado. Conversão exige ferramenta e cadeia de exportação própria; não foi adicionada conversão local fictícia/PyTorch ao Android.
Não há autoload de imagem ao abrir, nem inferência depois de importar, evitando ciclo automático de falta de RAM. Após descarregar imagem, o usuário pode carregar o GGUF pelos controles existentes; nenhum chat é apagado.
Não é garantido suporte a todos os pacotes MNN, SDXL, Flux ou arquivos GGUF de imagem.

Testes / validação

Teste JVM usa bytes de componentes artificiais para testar o instalador (NÃO inferência): sucesso/cópia/progresso, restauração do manifesto em disco, traversal, espaço insuficiente, cancelamento, formato arbitrário, componente ausente, corrupção e remoção/limpeza parcial. Os resultados do build/testes serão registrados na entrega após verificar o Actions.
A confirmação de seleção SharedPreferences após reiniciar Activity, importação SAF real, carregamento dos três componentes de um SD1.5 real, liberação observada de RAM e responsividade sob pressão requer aparelho físico. Não foi medido consumo de memória de imagem com modelo real; sem estimativas apresentadas como medição.
CI verifica libharuna_image.so e ausência de libggml-vulkan.so no APK CPU desta branch. A versão do llama.cpp da base é mantida, sem atualização preventiva.

Teste adicional do controlador real com Android/MNN simulados: importação sem load, reserva de memória exclusiva, rejeição de owner concorrente, unload, preferências/seleção restauradas em nova instância, ausência de autoload, cleanup de falha nativa simulada e remoção. PASS local. Esse teste NÃO executa o MNN real nem mede RAM; o build nativo usa os headers/implementação MNN fixados. Sintaxe JNI C++ verificada localmente contra esses headers reais: PASS.
