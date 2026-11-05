# Haruna Windows — SDXL e alternância de memória

## Base e entrega

- Branch exclusiva: `feature/windows-sdxl`.
- Base preservada: `5023e8e0ae0ce62b8c8a9b4f1b461077ef2881d0`.
- Commit do código e do executável testado: `ec3718fc0f9a4876fc1cb303e683e56ddc85955e`.
- Este relatório é uma alteração posterior somente de documentação; não muda o executável testado.
- Workflow [Haruna Windows SDXL, run 42105007558](https://github.com/doutor56-lab/Haruna/actions/runs/42105007558): **SUCCESS**.
- [Instalação — ZIP contendo somente o EXE portátil](https://github.com/doutor56-lab/Haruna/actions/runs/42105007558/artifacts/13452216342).
- [Artefato técnico separado](https://github.com/doutor56-lab/Haruna/actions/runs/42105007558/artifacts/13451996814): metadata, hashes, licenças e evidência dos testes.
- Executável: `Haruna-Windows-SDXL-0.1.0-x64.exe`.
- SHA-256: `9c20fc9fd4dd6aa4bac5f385b6c750227817f2156075094f3160cd97f4eb002d`.

A branch Android e os arquivos originais do aplicativo não foram alterados nem mesclados. A versão Windows deriva dos assets atuais e utiliza armazenamento separado em `%APPDATA%/Haruna Windows`.

## Implementação

Aplicativo Windows x64 portátil, com Electron 45.2.3, reutilizando a interface da Haruna. Modelos são importados pelo seletor nativo e referenciados no disco; nenhum checkpoint é baixado ou incorporado ao aplicativo.

O motor de imagem é **stable-diffusion.cpp**, revisão fixa `f5df5f8b84f139f1e80496902da90798a0d92896`, release `master-1052-f5df5f8`. Este caminho Windows é independente do motor MNN Android. Suporta checkpoints SDXL completos em Safetensors estruturalmente compatíveis; um arquivo LoRA, pickle/CKPT ou GGUF de conversa não é tratado como checkpoint SDXL executável. A validação estrutural não substitui um teste de inferência com o checkpoint específico.

RIN AnimePopCute Illustrious foi considerado como checkpoint SDXL de referência. A [página do modelo](https://tensor.art/models/1040109127226907325) recomenda Clip Skip 2, 20–40 etapas e CFG 3–7. O perfil inicial usa 28 etapas, CFG 5 e Clip Skip 2; isso não constitui validação do modelo. Os pesos não são redistribuídos, respeitando a solicitação do autor.

O LLM Windows utiliza llama.cpp CPU, revisão `7e42b95f231e508a001b6006fa73abbbbc1da3c2` (`b12130`). Isso não altera o llama.cpp Android. Os CLIs nativos usam processos separados, supervisionados pelo aplicativo, sem serviços de nuvem. O servidor LLM escuta somente no localhost e utiliza chave efêmera.

CPU é o backend inicial. Vulkan é opcional e experimental nesta versão Windows, com detecção de dispositivos; seleção não é prova de execução efetiva na GPU. Bibliotecas CPU e Vulkan ficam em diretórios separados. Runtimes, licenças e hashes são fixados nos scripts e metadata. Redistribuíveis MSVC app-local vêm do diretório licenciado de redistribuição do Visual Studio, com versões e hashes registrados.

## LLM e imagem nunca residentes intencionalmente ao mesmo tempo

1. A geração captura a identidade do GGUF realmente ativo.
2. Bloqueia operações concorrentes e encerra o processo LLM, aguardando seu evento de fechamento.
3. Só então inicia o processo de imagem.
4. Ao concluir, cancelar ou falhar, encerra e aguarda o processo de imagem; valida/salva o PNG e remove arquivos temporários.
5. Recarrega o mesmo GGUF anterior. Só declara READY após a confirmação de saúde do servidor.
6. Se a restauração falhar, mostra a falha e mantém o LLM descarregado. Não seleciona outro modelo silenciosamente.

Se nenhum GGUF estava ativo, nenhum é carregado automaticamente ao final. O fechamento do aplicativo encerra os processos e evita recarga. Tickets de cancelamento são específicos da geração. Histórico permanece no armazenamento da interface; o contexto LLM é reconstruído no próximo turno.

Essa exclusão refere-se aos processos que possuem os pesos. Não significa memória de sistema instantaneamente zerada: cache de arquivos e pequenos buffers de imagem podem permanecer. O consumo real no PC ainda não foi medido.

## Resoluções e interface

Diálogo integrado ao tema Haruna com retrato/paisagem, proporções 3:5, 1:1, 9:16, 3:4, 7:9 e 2:3, tamanhos M/L, largura/altura personalizadas e troca dos eixos. Sem travas comerciais. Preferências são persistidas.

Valores personalizados: 256 a 2048 por eixo, múltiplos de 8 e até 4 megapixels. Quando a grade nativa SDXL exige múltiplos de 32, a geração usa a próxima dimensão compatível e o PNG recebe corte central, sem esticar. Exemplo: tamanho solicitado 840 × 1400, cálculo interno 864 × 1408, PNG final 840 × 1400. A diferença aparece antes da execução.

Configurações técnicas ficam nas configurações; geração, progresso real, cancelamento e imagem resultante são integrados ao chat. Prompts ficam em arquivos privados temporários, não na linha de comando. O modelo de imagem é carregado ao gerar, sem botão fictício de residência.

## Hardware informado e limites

Windows 11, 12 GB RAM, Radeon Vega 11 e 4 GB de memória gráfica informada. Vega 11 normalmente compartilha memória com o sistema; não se presume que sejam 4 GB dedicados.

O modo de pouca memória usa VAE em blocos e armazenamento de parâmetros em disco no caminho CPU. Vulkan solicita ajuste automático e orçamento de memória, que não representa um limite físico garantido. SDXL continua pesado para esse equipamento: lentidão, falta de memória e limitações do driver precisam ser verificadas no PC. Nenhuma promessa de velocidade ou ausência de travamentos é feita.

STT/TTS nativos Android e o DBG JNI não foram portados para Windows; não há substituição por voz em nuvem. Os arquivos Android continuam preservados. Anexos Windows nesta versão: TXT, MD, CSV, JSON e LOG até 2 MiB; os parsers Android de PDF/DOCX não foram portados. Importação GGUF é manual; não foi portado o catálogo de downloads Android. Não há controles adicionais de LoRA, ControlNet ou img2img nesta entrega.

## Validação automática

- Sete testes Node passaram localmente e no CI Windows: dimensões/alinhamento; argumentos nativos e privacidade; validação estrutural de modelos; exclusão LLM/imagem no sucesso, cancelamento e erro; servidor LLM/estado READY e término de streaming.
- Testes de ciclo de modelos usam processos/backend fake e fixtures estruturais sem pesos. Não são testes reais de inferência.
- Verificação local de interface em 360 × 800 e 1280 × 900, com bridge simulada: diálogo, proporções, troca de eixos, tamanhos e ausência de overflow.
- O **EXE final empacotado abriu no Windows CI**.
- O CLI real de imagem CPU respondeu a `--help`; o llama-server real respondeu a `--version`.
- No aplicativo empacotado, 840 × 1400 foi salvo e restaurado após reload; paisagem preservou o preset L.
- Teste de corte PNG confirmou saída exata 840 × 1400. A entrada desse teste era sintética, não gerada por SDXL.
- Screenshot e `WINDOWS_SMOKE.json` estão no artefato técnico.
- `realImageGenerated = false`, declarado explicitamente na evidência.

**Não houve geração real com RIN, outro checkpoint SDXL ou execução física na Radeon Vega 11.** Compilação, abertura da interface e execução dos comandos de versão não provam inferência. O executável é experimental e não assinado.

## Primeiro teste no PC

1. Extraia o artefato de instalação e execute o EXE.
2. Em configurações, importe um checkpoint SDXL completo compatível em Safetensors e selecione CPU inicialmente.
3. Opcionalmente carregue um GGUF para confirmar o ciclo automático. Configure uma resolução moderada antes do primeiro teste; resoluções menores alteram a composição/qualidade.
4. Gere uma imagem. Confira progresso, PNG e dimensões finais; confirme que o GGUF sai de READY durante a imagem e só volta após recarga.
5. Teste cancelamento e confirme a restauração do mesmo GGUF. Vulkan só depois, como comparação separada.

## Arquivos adicionados

```text
.github/workflows/windows-sdxl.yml
desktop/.gitignore
desktop/README.md
desktop/licenses/THIRD_PARTY_NOTICES.md
desktop/licenses/libwebm-LICENSE.txt
desktop/licenses/libwebp-LICENSE.txt
desktop/licenses/llama-MIT.txt
desktop/licenses/stable-diffusion-MIT.txt
desktop/package-lock.json
desktop/package.json
desktop/renderer/desktop.css
desktop/renderer/entry.js
desktop/renderer/haruna.ico
desktop/renderer/image-settings.js
desktop/scripts/bundle-vc-runtime.ps1
desktop/scripts/fetch-runtimes.py
desktop/scripts/prepare-ui.cjs
desktop/src/controller.cjs
desktop/src/identity.cjs
desktop/src/image-config.cjs
desktop/src/main.cjs
desktop/src/models.cjs
desktop/src/preload.cjs
desktop/src/processes.cjs
desktop/test/core.test.cjs
docs/HARUNA_WINDOWS_SDXL_RELATORIO.md
```
