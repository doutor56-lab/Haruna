# Consolidação Android — modelos e imagens

Base preservada: `feature/stage8-documents-vision`, `0283303d24c58492b5d59588439ec84440f77095`; deriva de `feature/safetensors-sd15`. Checkpoint/branch de trabalho: `feature/consolidated-image-batches`. A base já possui APK ARM64 aprovado no Actions. Esta atualização não altera a base. Build Android autorizado pelo usuário em 2026-11-07, somente nesta branch.

## Auditoria e organização

- Essencial: GGUF instalado/ativo, importar/selecionar/carregar/descarregar, imagens safetensors/MNN/Nezumi, modelo visual. Os controles originais são movidos por DOM para Modelos locais → Modelos, sem cópias e sem alterar suas preferências.
- Avançado: dimensões, etapas, CFG, clip skip, sampler, scheduler, seed, negativo, VAE em blocos. Controles originais ficam no painel de imagem → Avançado, conservando validações/capacidades por motor.
- Diagnóstico: estado/medidas nativas, lifecycle/JNI, laboratório A/B, controles experimentais de contexto/threads/FA/backend. Permanecem no DBG; não são promovidos silenciosamente para produção. A aba Desempenho observa RAM e parâmetros efetivos. Motores observa estado e compatibilidade. Não há aba Avançado vazia.
- STT/TTS incluem preferências de uso além de modelos; seus painéis não foram deslocados integralmente para evitar perder controles de voz. Modelos locais oferece atalhos para os painéis originais, sem duplicar suas funções. Memória pessoal/aprendida também permanece independente.
- Obsoleto: nenhum componente removido com base apenas em posição ou aparência.

Biblioteca reutiliza o cartão de conhecimento e a biblioteca nativa de documentos existentes. Navegação: Conversas → Biblioteca → Memória → Configurações. Sem alteração de tamanho de fonte em CSS existente. As novas regras não declaram tamanhos de fonte fora de Modelos locais.

## RAM

O painel reutiliza `HarunaDiagnostics.requestSnapshot` e o mesmo timer do DBG. O coletor nativo existente mantém cache de 10 segundos. Nenhum novo coletor/serviço. Somente a aba Desempenho visível ou o DBG solicitam amostras; segundo plano pausa o timer. Total/disponível/ocupada são RAM do sistema; PSS da Haruna é apresentado separado. Ausência de medida mostra N/D.

## Imagens

O ícone existente ativa modo imagem e abre o painel compacto não modal à esquerda, ancorado acima do compositor. O envio normal nesse modo gera usando o rascunho; o painel só salva preferências. Proporção/enquadramento, orientação e quantidade estão no topo; parâmetros existentes foram movidos para Avançado. Preferências do usuário e defaults específicos de SDXL foram preservados; SD1.5 sem preferências continua 256/5/equilibrado/auto-save. Quantidade inicial 1.

Safetensors/Nezumi: 1–4 gerações sequenciais na mesma sessão, mesmo prompt sem tradução, seeds diferentes, cada PNG gravado antes do próximo. Resultados referenciam arquivos, não base64. Metadados parciais são gravados atomicamente após cada PNG; ao restaurar uma solicitação sem execução nativa correspondente, o cartão marca Interrompido e conserva os resultados concluídos. Um único unload/restore de GGUF por lote. O botão Parar pede cancelamento cooperativo e impede próximas imagens; arquivos concluídos persistem. Cartão único mostra progresso agregado e resultados em grade. Abrir/compartilhar cada resultado é possível durante o lote; salvamento manual aguarda término (auto-save continua por imagem).

Intenção automática: somente comandos explícitos passam pelo gate; uma geração curta do LLM produz decisão JSON, isolada do histórico. Apenas `generate_image` validado inicia o motor, encaminhando o texto original. Perguntas como “Como gerar uma imagem?” não acionam a classificação. Resposta em prosa ou JSON inválido não simula geração. O modo manual permanece disponível sem LLM.

## Limitações explícitas

- MNN Haruna antigo recria/carrega o pipeline dentro de cada chamada JNI. Sem uma alteração profunda e prova de reset correto do estado, continua limitado a 1 imagem. A interface bloqueia 2–4 nesse motor. Safetensors e Nezumi usam as sessões persistentes existentes.
- Prévia progressiva: callback real do SDK stable-diffusion.cpp conectado no adaptador safetensors, modo PREVIEW_PROJ (projeção dos latentes), sem VAE extra ou segundo modelo. Produz um PNG substituído atomicamente, limitado a 128 × 128; o buffer RGB temporário é descartado por callback. Intervalo proporcional às etapas, inclusive a cada etapa em gerações curtas. Checkbox persistente, inicialmente desativado; prévia bloqueada em lowMemory ou margem disponível abaixo de 512 MiB antes de cada imagem. Os arquivos temporários são removidos ao concluir/cancelar cada imagem. Projeção é aproximada e pode diferir da imagem final. Nezumi/MNN não expõem prévia eficiente por esse adaptador e mostram somente progresso. Custo/estabilidade no tablet ainda exigem validação física.
- Build Android autorizado em 2026-11-07; resultado será registrado após a execução. SDK/NDK completos não estão instalados localmente. A chave de assinatura original continua ausente; não é possível garantir atualização sobre APK anterior sem ela. Não desinstalar nem limpar dados.
- Testes de interface/controle não equivalem a inferência física. A validação no Teclast continua necessária, inclusive comportamento de classificação do LLM pequeno.

## Verificações

Testes locais de Kotlin com o controlador real e JNI/Android simulados: lote de quatro, seeds distintas, preservação parcial após cancelamento, restauração única do GGUF, além das regressões anteriores. Chromium 360×800 e 800×1280: controles, preferências, navegação, cartões, abrir/salvar/compartilhar e histórico, com ponte simulada. Teste de decisão estruturada com LLM simulado. Testes reais concluídos no Linux: uma sessão do SDK/JNI de geração existente produziu quatro PNGs 512×512, uma etapa Euler/discrete, CFG 7, seeds 424242–424245; contexto liberado ao terminar. O adaptador JNI atualizado gerou prévia PROJ real 128×128 e PNG final, idêntico por SHA-256 ao controle sem prévia neste fixture. Sem extrapolar qualidade de poucas etapas, tempo ou estabilidade para Android. Evidências: `docs/evidence/consolidated/LOCAL_RESULTS.json`.

## Arquivos modificados

- `tests/image_controller_check.py`
- `tests/image_intent_check.mjs`
- `tests/safetensors_native_check.cpp`
- `tests/image_ui_check.cjs`
- `tests/consolidated_static_check.py`
- `docs/CONSOLIDATED_MODELS_IMAGES.md`
- `tests/real-image/README.md`
- `tests/real-image/SessionCheck.kt`
- `tests/stage8/ui_check.cjs`
- `app/src/main/assets/haruna/image-chat.js`
- `app/src/main/assets/haruna/image-controls.js`
- `app/src/main/assets/haruna/consolidated.css`
- `app/src/main/assets/haruna/index.html`
- `app/src/main/assets/haruna/local-models.js`
- `app/src/main/assets/haruna/image-intent.js`
- `app/src/main/assets/haruna/image-models.js`
- `app/src/main/assets/haruna/app.js`
- `app/src/main/assets/haruna/diagnostics/panel.js`
- `app/src/main/cpp/safetensors/safetensors_jni.cpp`
- `app/src/main/java/com/proxyslabs/haruna/MainActivity.kt`
- `app/src/main/java/com/proxyslabs/haruna/image/SafetensorsImageNative.kt`
- `app/src/main/java/com/proxyslabs/haruna/image/ImageBridge.kt`
- `app/src/main/java/com/proxyslabs/haruna/image/SafetensorsSession.kt`
- `docs/evidence/consolidated/LOCAL_RESULTS.json`
