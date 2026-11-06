# Haruna Android multimotor — integração

Base Android: feature/safetensors-sd15 @0c92681. Referência Windows:
feature/windows-sdxl @21a2b857. Nenhum merge/main ou migração de dados.

Reutilizados os perfis e assinatura estrutural SDXL/Illustrious do Windows,
com SDK stable-diffusion.cpp f5df5f8 e GGML135ce1 isolados de GGUF/Whisper.
Windows Electron/servidor localhost não são transplantados: Android mantém
WebView/JNI e armazenamento privado existentes. MNN/Nezumi, GGUF e voz preservados.

Seleção automática por formato: GGUF textual no motor existente; ZIPs MNN/Nezumi
no motor apropriado; checkpoints SD1.5 e SDXL completos no stable-diffusion.cpp.
LoRA/split-models não são tratados como checkpoints completos. SDXL exige CLIP-L
768, CLIP-G1280, atenção cruzada2048, UNet4canais e VAE. Nome RIN não substitui
validação dos tensores nem prova uma geração.

Perfil SDXL/Illustrious: CPU, pesos em disco (params_backend=disk), mmap, CFG
sequencial, flash attention e VAE tiling usando APIs reais do SDK; 1024 nativos,
28 etapas iniciais, CFG5, clip skip2, Euler/discrete, seed aleatória. Preferências
SDXL de resolução/etapas separadas preservam as anteriores do MNN/SD1.5. PNGs
podem ser reduzidos para256/512. SDK mantém segmentação/auto-fit, mas isso NÃO
garante RAM suficiente. Lease existente descarrega GGUF e impede modelos de
imagem concorrentes, com cancelamento e cleanup. Nenhum processamento cloud.

Vulkan não é anunciado como funcional nesta build CPU. Disponibilidade de
código Vulkan no SDK não prova execução no Teclast; nenhum seletor fictício.

Validação: SD1.5 real no host Linux, checkpoint público2.13GB SHAverificado,
512²/5etapas: PNG coerente de maçã,296.44s, picoRSS3784548KiB. 256 nativos
produziu artefatos inclusive com20etapas; API C reproduziu mesmoSHA com/sem
mmap/CFGbatched. Fluxo usa512nativos e redução final. Cancelamento JNI real,
reopen e coexistência bibliotecas MNN/Nezumi passaram; testes de parser,
instalação e controlador são separados dos testes reais de inferência.

RIN não foi fornecido nem executado. A versão Windows tampouco o executou.
NÃO há evidência física de geração SDXL/RIN no Teclast. O caminho está integrado
às APIs reais, mas peso real, driver/ARM, RAM, temperatura e duração exigem
validação. Não há prova de impossibilidade física: armazenamento em disco e
FA/tiling reduzem residência, mas não eliminam workspace/pressão de memória.
Importação não carrega pesos e pode concluir mesmo que a execução não caiba.
Os pesos RIN devem ser obtidos legitimamente do autor; não redistribuídos.

Build solicitado pelo usuário: autorizado um GitHub Actions. Instalação deve
usar assinatura compatível para preservar dados; não desinstalar sem backup.
APK único, motores integrados; nenhum modelo é incorporado ao instalador.
Teste final: importar checkpoint completo obtido legitimamente, selecionar,
carregar e gerar. Começar pela configuração padrão; guardar erro técnico e
RAM se falhar. Não são necessários vários aplicativos nem uma matriz de testes.

Testes locais finais: 24 testes JUnit passaram; controlador real com Android e
motores falsos passou, incluindo SDXL 1024/28, preferências separadas, seleção,
restauração e liberação. JNI com API SD falsa passou teste de concorrência
cancel/free e progresso. Interface passou em 360×800 e 800×1280. Esses testes
não substituem inferência ARM64 nem validam o RIN. Os motores GGUF, MNN/Nezumi
e voz não foram substituídos; nenhum arquivo de conversa/configuração foi
migrado ou apagado. Checkpoint completo limitado a 8 GiB; checkpoints maiores,
componentes separados, LoRA e outros formatos não são aceitos como executáveis.
