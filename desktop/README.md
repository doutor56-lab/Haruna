# Haruna Windows — GGUF + SDXL offline

Base Android funcional: APK do GitHub Actions run `42504813611` (`2c3a4bc38f55797a65bdf4a1b7ae366d80b7eaee`), com correções isoladas de barra lateral e margem de RAM na branch `fix/android-sidebar-remove-3gb-cap-42504813611`. Port Windows: branch `port/windows-from-working-42504813611`. Motor Windows CPU/Vulkan, modelos GGUF e arquitetura Electron foram transportados de `integration/windows-ui-20261108`.
Nenhum arquivo Android é alterado. A edição Windows copia a interface atual para
o pacote e aplica somente adaptações de plataforma nessa cópia.

## Usar

1. Baixar o artefato **Haruna-Windows-SDXL-EXE**, extrair o único `.exe` e abrir.
   É portable x64 para Windows 10/11. Não há instalador de modelos nem login.
   O executável não é assinado comercialmente; Windows pode exibir SmartScreen.
2. Configurações → Modelos de IA → aba **Imagem** → importar checkpoint **SDXL completo
   `.safetensors`**, incluindo UNet, CLIP-L, CLIP-G e VAE. Selecionar o modelo.
   LoRA sozinho, MNN Android e GGUF de conversa não são checkpoints SDXL.
3. No chat, clicar no ícone de imagem para abrir o painel da interface Android; ajustar as dimensões, escrever a descrição e enviar. A imagem e seus controles usam a conversa existente. As opções avançadas ficam no painel de imagem.
4. No painel do ícone de imagem, ajustar retrato/paisagem, 3:5, 1:1, 9:16,
   3:4, 7:9, 2:3 e 16:9;
   presets M/L e largura/altura independentes entre 256 e 2048, múltiplos de 8.
   Todas as opções estão disponíveis, sem quotas/assinatura.
5. Importe GGUF em Configurações → Modelos de IA → **Linguagem** para conversar. Seleção/principal persistem,
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
Vulkan pode ser selecionado em Configurações → Modelos de IA → Imagem → **Motor de imagens no Windows**. Depende do driver AMD.

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

Workflow `.github/workflows/windows-sdxl.yml` (branch `port/windows-from-working-42504813611`): testa lógica/state/persistência com
processos explicitamente fake, baixa runtimes verificados, empacota EXE e abre
**o app empacotado no Windows** para testar interface de dimensões e CLI real
`--help`/`--version`. A fixture PNG usada no teste de corte não é imagem SDXL.
Relatório do smoke registra `realImageGenerated: false`; não há inferência
falsamente atribuída ao CI. Execução real com RIN e driver Vega requer o PC.

Na validação do PC, começar com CPU/pouca memória e 768×768, depois testar
Vulkan e os tamanhos desejados. Confirmar no Gerenciador de Tarefas:
llama-server encerra → sd-cli inicia → sd-cli encerra → llama-server retorna.
Se não houver GGUF ativo inicialmente, não há reload automático de outro modelo.

## Estado da migração

A interface é copiada diretamente da revisão Android funcional na preparação do pacote. As adaptações Windows são feitas apenas na cópia em `desktop/ui`: não alteram o APK. A aba Imagem mantém o painel original e adiciona controles Windows CPU/Vulkan. O formato do motor Windows é SDXL completo `.safetensors`, não os pacotes MNN Android.

A seleção Vulkan usa o binário Windows previamente fixado e verificado por SHA-256. **Selecionar Vulkan não é teste de geração real nem comprova compatibilidade com a Vega 11.** O LLM GGUF permanece na CPU nesta edição.

A biblioteca nativa de PDF/DOCX, o motor Android de voz e geração MNN não são executados no Windows. Não há modelos baixados automaticamente. Em caso de falha no runner Windows do GitHub Actions antes de iniciar as etapas, não existe executável validado: confira o estado do fluxo antes de instalar.
