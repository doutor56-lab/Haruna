# LoRAs e Anima — Android / Windows

Base: `e4f278e573289669c1c716875ea1613c6ccb7ce9`.
Branch: `feature/android-overdrive`.
Checkpoint: `checkpoint/before-lora-anima-e4f278e`.

## Implementação

O stable-diffusion.cpp já fixado em `f5df5f8b84f139f1e80496902da90798a0d92896` oferece ambas as APIs. Não houve troca de runtime, alteração de GGML, novos motores, dependências ou pesos. Android permanece CPU; Windows preserva CPU/Vulkan existentes. GGUF de conversação, voz, MNN/Nezumi, histórico e preferências anteriores foram mantidos.

### LoRAs convencionais

- Importação de `.safetensors` com pares `lora_down/lora_up` ou `lora_A/lora_B`, F16/BF16/F32; rank e estrutura são verificados. Famílias SD1.5, SDXL/Illustrious, FLUX.1 e Anima são identificadas por metadados e assinaturas conhecidas. Arquitetura incerta é recusada; o nome do arquivo não identifica a família.
- Seleção e força (-2 a 2, exceto zero) persistem por modelo-base, com até quatro adaptadores. É possível desativar todos, inclusive seleções antigas indisponíveis. Adaptadores de outra família não são aceitos.
- Android instala atomicamente os bytes originais em diretório UUID privado, com SHA-256. Windows registra o arquivo externo e verifica seu digest antes da geração; usa hardlink temporário ou cópia quando necessário, sem modificar ou excluir o original.
- JNI encaminha os registros `sd_lora_t` em `sd_img_gen_params_t`. Windows usa o mecanismo oficial de tags do CLI, geradas internamente com aliases UUID dentro de uma pasta temporária controlada. Tags manuais `<lora:...>` são recusadas para impedir que um prompt carregue caminhos arbitrários. A pasta temporária é removida após o lote.
- Erros de aplicação, tensores incompatíveis/ignorados ou aplicação parcial reportada pelo runtime impedem aceitar o resultado. Logs livres do motor não são exportados pelo JNI; os sinais relevantes viram erros locais limitados. Callbacks são retirados antes de liberar a sessão.
- O JSON Windows em `generated-images/metadados` conserva o prompt sem tags internas e registra nome, digest, família e força dos adaptadores utilizados.
- MNN/Nezumi permanece funcionando, mas não aplica estes LoRAs. LoHa/LoKr/DoRA e outros formatos não convencionais não foram integrados; não são apresentados como suportados. Palavras de ativação indicadas pelo autor devem constar na descrição quando necessárias.

### Anima

O botão de componentes aceita três arquivos Anima ou os quatro componentes FLUX.1 já suportados. Anima exige:

1. Difusão Anima 2B compatível, `.safetensors` ou GGUF aceito pelo leitor existente.
2. Encoder **Qwen3-0.6B-Base**, `.safetensors` ou GGUF compatível (nome iniciado por `qwen_3`, `qwen3` ou `llm` para identificar o papel no seletor).
3. VAE **Qwen Image/Wan**, `.safetensors`, com `vae` no nome.

A atribuição inicial de papéis não substitui a inspeção: tensores e dimensões esperadas são verificados, e os digests são conferidos antes do carregamento. O manifesto deve conter exatamente o conjunto autorizado, até 8 GiB. Falhas e cancelamento removem a instalação temporária. O carregador JNI utiliza `diffusion_model_path`, `llm_path` e `vae_path` e exige que o runtime identifique o modelo como **Anima**. Windows encaminha `--diffusion-model`, `--llm` e `--vae`.

As preferências iniciais desta nova família são 512×512, 20 etapas, CFG 6 e Euler; perfis de outras famílias não são sobrescritos. Instalar um conjunto não garante memória suficiente para executá-lo. O GGUF de chat é descarregado antes de preparar a imagem e restaurado após liberar seus recursos. O Qwen3 deste conjunto é o encoder de imagens, não o modelo de chat.

Não há integração automática com downloads/login do Civitai: baixe os arquivos legitimamente e use o seletor local. Nem todo arquivo do ecossistema Anima é um checkpoint completo ou corresponde a esta arquitetura. O modelo-base, o encoder, o VAE e cada LoRA precisam ser compatíveis. A página oficial atual do Anima declara licença não comercial; consulte a licença da versão e dos componentes efetivamente utilizados. Nenhum peso é redistribuído nesta implementação.

## Uso

Em **Configurações → Modelos locais → Imagem**, importe o modelo/conjunto. Abra **LoRAs · adaptadores do modelo**, importe o adaptador e marque-o no modelo-base correspondente; ajuste a força. A geração continua no chat, com os mesmos controles de lote e cancelamento. Remover um LoRA não remove o modelo-base nem arquivos externos originais no Windows. No Android, remove apenas a cópia instalada do adaptador.

## Verificação e limites

- 33 testes Node passaram, incluindo pacotes Anima sintéticos reais, digests, instalação/cancelamento, CLI, seleção por família, persistência, lote com LoRA, metadados e rejeição de aplicação inválida. Os pesos/PNGs dos fixtures são explicitamente simulados.
- `tests/image_controller_check.py`: controlador, instaladores, sessões e verificadores Kotlin reais compilados com Kotlin 2.3.0; Android/JNI simulados. Passaram importação LoRA, preservação da seleção principal, caminho/força no JNI, persistência, rejeição de família incompatível sem gravar preferências, remoção preservando origem, conjunto Anima, defaults e despacho correto para `loadAnima`.
- `tests/lora_ui_check.cjs`: controles compartilhados em 360×800 e 800×1280, importação, força, bloqueio por família/backend, ocupado, remoção e desativação. API de plataforma simulada.
- `tests/safetensors_native_check.cpp`: adaptador C++ real contra API SD simulada, discriminação de progresso, sinais de rejeição LoRA, retirada do callback, cancelamento/liberação concorrentes e IDs antigos. Compilou e passou com os headers da revisão fixada.
- `tests/image_ui_check.cjs`: painel e galeria existentes passaram em celular e tablet, incluindo cancelamento e histórico.
- Smoke do Electron real em Linux passou: inicialização, controles, persistência de lote 100, escalas e dois ciclos VAD nativos. Não equivale a teste no Windows nem a geração real.
- Sem inferência real Anima/LoRA com pesos treinados, medição de RAM/tempo ou teste no tablet nesta tarefa. Verificação estrutural e compilação não demonstram qualidade, desempenho nem cobertura de todos os LoRAs do Civitai.
- Sem novo APK/EXE e sem GitHub Actions disparado nesta alteração. Android completo ARM64 ainda exige SDK/NDK/build e validação física; não confundir compilação Kotlin de host e teste C++ com APK validado.

## Referências técnicas consultadas

- [Anima no runtime fixado](https://github.com/leejet/stable-diffusion.cpp/blob/f5df5f8b84f139f1e80496902da90798a0d92896/docs/anima.md)
- [LoRA no runtime fixado](https://github.com/leejet/stable-diffusion.cpp/blob/f5df5f8b84f139f1e80496902da90798a0d92896/docs/lora.md)
- [API nativa fixada](https://github.com/leejet/stable-diffusion.cpp/blob/f5df5f8b84f139f1e80496902da90798a0d92896/include/stable-diffusion.h)
- [Modelo e licença oficiais](https://huggingface.co/circlestone-labs/Anima)

A página indicada do Civitai não pôde ser aberta pelo mecanismo de pesquisa nesta sessão. Compatibilidade foi investigada nas fontes oficiais do modelo e no código do runtime, não inferida pela existência da página.
