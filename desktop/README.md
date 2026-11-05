# Haruna Windows — GGUF + SDXL offline

Branch `feature/windows-sdxl`, base Android/Nezumi `5023e8e0ae0ce62b8c8a9b4f1b461077ef2881d0`.
Nenhum arquivo Android é alterado. A edição Windows copia a interface atual para
o pacote e aplica somente adaptações de plataforma nessa cópia.

## Usar

1. Baixar o artefato **Haruna-Windows-SDXL-EXE**, extrair o único `.exe` e abrir.
   É portable x64 para Windows 10/11. Não há instalador de modelos nem login.
   O executável não é assinado comercialmente; Windows pode exibir SmartScreen.
2. Configurações → Geração de imagens → importar checkpoint **SDXL completo
   `.safetensors`**, incluindo UNet, CLIP-L, CLIP-G e VAE. Selecionar o modelo.
   LoRA sozinho, MNN Android e GGUF de conversa não são checkpoints SDXL.
3. Escrever a descrição no chat e clicar no ícone de imagem. A imagem e seus
   controles usam a conversa existente. A descrição negativa fica nas configurações.
4. Clique no botão de tamanho junto ao compositor ou em **Dimensões da imagem**
   nas configurações. Retrato/paisagem, 3:5, 1:1, 9:16, 3:4, 7:9 e 2:3;
   presets M/L e largura/altura independentes entre 256 e 2048, múltiplos de 8.
   Todas as opções estão disponíveis, sem quotas/assinatura.
5. Importe GGUF em Configurações para conversar. Seleção/principal persistem,
   mas não há autoload cego ao abrir o programa.

Arquivos de modelo são referenciados no local escolhido, sem duplicar gigabytes.
Remover da lista não exclui o original. Não mova o arquivo depois de importá-lo.
Conversas/memórias/IndexedDB ficam no perfil Windows `AppData/Roaming/Haruna Windows`.
PNGs privados ficam em `generated-images`; salvamento automático copia para
Imagens/Haruna. Visualizar abre o visualizador padrão; Mostrar no Explorer
permite localizar e compartilhar o arquivo. Nenhum upload é feito.

## RAM: exclusão entre LLM e imagem

Se havia GGUF ativo, guarda-se seu ID por job. O processo llama-server é encerrado
e sua saída é observada **antes** de iniciar sd-cli. Depois de sd-cli terminar
ou ser cancelado, seus recursos são liberados pelo sistema, o PNG é finalizado,
e o mesmo GGUF é recarregado. Só fica ativo após `/health` confirmar pronto.

Isso também é tentado após erro de imagem. Falha ao restaurar aparece como erro
LLM e aviso, sem fingir que o modelo voltou. Nenhum GGUF é iniciado no fechamento
do programa. Histórico visual permanece no renderer; o contexto textual é
reconstruído pelo fluxo de mensagens existente. Não há dois processos de modelo
residentes intencionalmente nem troca de buffers entre motores.

## PC informado: Windows 11 / 12 GB RAM / Radeon Vega 11 / 4 GB VRAM informados

Vega 11 é normalmente integrada; a memória gráfica pode ser compartilhada com
os 12 GB de RAM. O programa não assume 4 GB dedicados. CPU é o padrão seguro;
Vulkan pode ser solicitado e detectado em Configurações. Depende do driver AMD.

Pouca memória vem ativado: VAE em tiles; CPU solicita parâmetros em disco,
Vulkan solicita auto-fit e orçamento de 2 GiB. Isso usa controles existentes do
runtime, não garante RAM/VRAM disponível nem evita toda falha de driver/OOM.
Manter o arquivo de paginação do Windows gerenciado pelo sistema pode ser
necessário. Não há promessa de velocidade; SDXL pode ser lento nesse hardware.

## Resoluções exatas e alinhamento

SDXL do runtime alinha o cálculo à grade interna de 32 pixels. Para 840×1400,
o motor recebe 864×1408 e o excedente é recortado no centro, resultando em PNG
**840×1400**, sem esticamento. A janela informa isso antes de confirmar.
Para 768×1280 ou 1024×1024 não há corte. O tamanho do PNG nativo é validado;
saída inesperada vira erro, não sucesso. Campos solicitados e internos são
registrados no resultado local. Esse recurso não é geração nativa arbitrária
em tamanho incompatível com a arquitetura.

## Modelo RIN AnimePopCute Illustrious

Checkpoint SDXL/Illustrious; importar o arquivo obtido legitimamente do criador.
Não redistribuímos seus pesos. A página do autor pede não re-upload.
Referência do autor: https://tensor.art/models/1040109127226907325
Recomenda Clip skip 2, 20–40 etapas e CFG 3–7. A edição começa com 28 etapas,
CFG 5, Clip skip 2 e Euler; são ajustáveis. Resolução inicial 1024².
**O checkpoint RIN não foi executado nesta implementação sem o arquivo do usuário.**
Aceitar o cabeçalho não é prova de qualidade ou inferência; o runtime deve
confirmar a geração e produzir PNG válido. Não há imagens simuladas no aplicativo.

## Runtimes e licenças

- stable-diffusion.cpp `f5df5f8b84f139f1e80496902da90798a0d92896`, release
  `master-1052-f5df5f8`, Windows CPU e Vulkan x64. MIT. Suporte SDXL:
  https://github.com/leejet/stable-diffusion.cpp/blob/f5df5f8b84f139f1e80496902da90798a0d92896/docs/sd.md
- llama.cpp Windows CPU `b12130` / `7e42b95f231e508a001b6006fa73abbbbc1da3c2`, MIT.
  Não substitui o llama.cpp do Android.
- Electron 45.2.3, electron-builder 26.18.0; dependências fixadas em lockfile.
- Bibliotecas VC redistribuíveis app-local do SDK Windows licenciado do build,
  para evitar depender de DLLs MSVC ausentes. Ver `licenses/` e metadata.

Downloads de binários acontecem **na compilação**, com SHA-256 obrigatório de
cada arquivo de release. Nenhum download silencioso de pesos ou IA na nuvem.
Cada motor fica em seu diretório de DLLs, sem misturar GGMLs de versões diferentes.
O modelo textual usa servidor só em 127.0.0.1, API key efêmera, sem WebUI pública.
Electron usa isolamento, sandbox, sem Node no renderer e protocolo próprio/CSP.

## Limites desta primeira edição Windows

- STT/TTS nativos Android e seu laboratório JNI não foram portados; a cópia
  Windows não apresenta controles fingindo executá-los. Sem fallback cloud.
- Importação de anexos Windows: textos TXT/MD/CSV/JSON/LOG até 2 MiB;
  parsers Android de PDF/DOCX não são executados no Windows.
- Catálogo automático GGUF Android não foi reimplementado; importar arquivo local.
- Sem LoRA adicional, ControlNet, upscaler, geração em lote ou edição img2img na UI.
- Ausência de falha no CI não valida desempenho/VRAM na Vega 11.
- CPU atual, Vulkan solicitado e dispositivos detectados são apresentados sem
  alegar offload confirmado apenas por selecionar uma opção.

## Compilar e testar

Node 24 + Python 3 + Windows com Visual Studio/VC Redist para empacotamento:

```sh
cd desktop
npm ci
npm test
python scripts/fetch-runtimes.py
# PowerShell, no Windows: ./scripts/bundle-vc-runtime.ps1
npm run dist:win
```

Workflow `.github/workflows/windows-sdxl.yml`: testa lógica/state/persistência com
processos explicitamente fake, baixa runtimes verificados, empacota EXE e abre
**o app empacotado no Windows** para testar interface de dimensões e CLI real
`--help`/`--version`. A fixture PNG usada no teste de corte não é imagem SDXL.
Relatório do smoke registra `realImageGenerated: false`; não há inferência
falsamente atribuída ao CI. Execução real com RIN e driver Vega requer o PC.

Na validação do PC, começar com CPU/pouca memória e 768×768, depois testar
Vulkan e os tamanhos desejados. Confirmar no Gerenciador de Tarefas:
llama-server encerra → sd-cli inicia → sd-cli encerra → llama-server retorna.
Se não houver GGUF ativo inicialmente, não há reload automático de outro modelo.
