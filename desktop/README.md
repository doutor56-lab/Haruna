# Haruna Windows — interface compartilhada Android/Windows

Base Android: `e0fa47f8e42e6ada3be7f449a8b39399867ce461`.
Port Windows reutilizado: `9228b88135483e525e175f8b0a002d684a7f48bb`.
Branch consolidada: `integration/haruna-multiplatform-20261111`.
A preparação copia os assets Android atuais, incluindo o orbe e os botões aprovados.
As instruções da Haruna são geradas dos arquivos Kotlin atuais, sem uma persona paralela.

## Capacidades

- GGUF com llama.cpp CPU ou Vulkan; mudança de backend vale no próximo carregamento.
  Solicitado e efetivo são separados; o efetivo vem do log de offload, quando disponível.
- Checkpoints completos SD1.5 e SDXL/Illustrious safetensors.
- FLUX.1 dev/schnell: **Adicionar conjunto FLUX.1**, selecionar difusão, CLIP-L,
  T5-XXL e VAE juntos. Difusão e T5 podem ser GGUF nas quantizações aceitas pelo
  inspetor; CLIP-L e VAE são safetensors. Limite do conjunto: 8 GiB.
- CPU/Vulkan de imagem, mesmas configurações de resolução/etapas/CFG/seed e
  lotes sequenciais de até quatro imagens. Cancelamento preserva imagens prontas.
  O CLI Windows recarrega pesos entre imagens; o GGUF só retorna ao terminar o lote.
- Whisper multilíngue ONNX INT8 Tiny/Base/Small, Silero VAD e Supertonic 3 INT8
  em CPU, com captura/ditado, chamada, áudio em streaming, pausa e cancelamento.
  Sem reconhecimento do navegador, serviços de nuvem ou voz simulada.
- PDF, DOCX e TXT, Tesseract português/inglês, Biblioteca SQLite FTS5 e SmolVLM-500M
  com projetor correspondente, alternando com o GGUF. OCR e interpretação visual
  permanecem distintos. Modelo visual e modelos de voz são instalados pelo usuário.

Não há suporte universal ao Civitai. LoRA sozinho, SD2, SD3, FLUX.2, Fill e componentes
incompletos são recusados. O inspetor é uma verificação estrutural; o runtime ainda
precisa confirmar o carregamento. Modelos grandes podem exceder RAM/VRAM disponível.
Pacotes MNN/Nezumi e Whisper GGML do Android não são executados pelo adaptador Windows;
o Android preserva esses motores. O DBG JNI é específico do Android. Não há prévia
progressiva no CLI Windows; a opção informa a indisponibilidade. O Android preserva
sua prévia por projeção, quando suportada.

## Dados e execução

Conversas/IndexedDB e configurações continuam no perfil `AppData/Roaming/Haruna Windows`.
Checkpoints GGUF/SD são referenciados sem apagar originais. Conjuntos FLUX são copiados
atomicamente para armazenamento privado com hashes. Remover da lista não apaga o
checkpoint original. PNGs ficam em `generated-images`; Salvar todas exporta os resultados
concluídos. O motor de imagem encerra antes da restauração do GGUF. Falha de encerramento
bloqueia uma restauração que poderia manter dois motores pesados residentes.

Runtimes permanecem fixados e verificados por SHA-256:
llama.cpp `b12130 / 7e42b95f231e508a001b6006fa73abbbbc1da3c2` CPU/Vulkan e
stable-diffusion.cpp `f5df5f8b84f139f1e80496902da90798a0d92896` CPU/Vulkan.
ONNX: sherpa-onnx-node 2.0.1, Apache-2.0. Bibliotecas de documentos constam no lockfile
com licenças distribuídas. Não são distribuídos pesos do Civitai.

## Compilar no Windows

```sh
cd desktop
npm ci
npm run prepare:ui
npm test
python scripts/fetch-runtimes.py
# PowerShell: ./scripts/bundle-vc-runtime.ps1
npm run dist:win
```

O workflow conjunto tem dois jobs e só executa por disparo manual ou commit
`[build approved]`. Não deve ser disparado sem autorização: o repositório é privado.
O smoke do Windows abre o EXE empacotado e verifica CLI/UI; não simula inferência.
Verificações locais e limitações: `docs/MULTIPLATFORM_AUDIT_20261111.md`.
