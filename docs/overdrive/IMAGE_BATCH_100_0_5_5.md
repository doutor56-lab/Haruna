# Windows 0.5.5 — lotes e metadados locais

Base: `a83acb24a9d68f2ca6f48131a2b51827e43560d4`.
Checkpoint: `checkpoint/before-image-batch-100-a83acb2`.
Branch: `feature/android-overdrive`; sem merge na principal.

- Windows permite 1–100 imagens, sequencialmente. O LLM é descarregado antes e restaurado ao terminar ou cancelar. O CLI de imagem continua sendo iniciado por imagem: esta alteração não mantém pesos residentes entre processos.
- Cada imagem de um lote recebe seed criptograficamente aleatória distinta. Geração individual preserva seed fixa para reprodução; seed automática é materializada antes da chamada nativa e registrada.
- Quantidades explícitas (“crie 100 imagens”) valem só para aquele pedido. “Uma imagem com 100 gatos” não altera o lote. Preferências existentes são preservadas.
- Galeria paginada em até 12 imagens visíveis. Cancelamento conserva resultados já concluídos.
- Um JSON por PNG em `%APPDATA%\Haruna Windows\generated-images\metadados`, com `prompt`, `seed`, `cfg`, `steps`, resolução e configurações efetivamente encaminhadas ao motor. Também acompanha salvar individual, salvar lote e cópia automática. Imagens antigas sem informações continuam exportáveis, sem inventar metadados.
- Os JSONs contêm o prompt solicitado pelo usuário e permanecem locais; não são diagnóstico público. Arquivos internos de estado e histórico permanecem intactos.
- Android conserva limites reais informados pelo motor; não foi ampliado seu backend nativo nem produzido APK nesta entrega.
- Mantida a instrução de autoria Proxys Labs da versão 0.5.4, sem atribuir a ela o treinamento dos GGUF.

Validação local: 28 testes Node passaram, incluindo lote de 100 com CLI simulado, seeds realmente distintas, cancelamento parcial, metadados no disco e exportação com nome alterado. Classificação de intenção: 48 positivos e 33 negativos, além das quantidades. Smoke Electron passou com controles, persistência de lote 100, escalas 75–150% e dois ciclos VAD nativos. Nenhuma geração real com checkpoint de imagens foi executada neste ambiente. Tempo, qualidade, memória e estabilidade de um lote real longo dependem do modelo e do computador; não há promessa de desempenho.
