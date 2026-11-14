# Windows 0.5.1 — pedidos naturais de imagem

Base: `85c893229efc2bdbe7110e362a4a6b807452f2ad`, branch `feature/android-overdrive`.
Checkpoint: `checkpoint/before-image-intent-85c8932`.

O filtro anterior reconhecia apenas alguns verbos no início, seguidos imediatamente de “imagem” ou equivalente. Mesmo pedidos inequívocos ainda dependiam de o GGUF gerar um JSON exato, com uma inferência adicional. Além disso, o chat só encaminhava pedidos de imagem quando havia um GGUF carregado.

Agora pedidos claros são encaminhados diretamente ao motor de imagens, sem classificação extra. Exemplos: “Desenha um gato”, “Haruna, poderia criar uma imagem de uma floresta?”, “Quero uma imagem de um touro”, “Faz pra mim uma arte de um gato”, “Gostaria que você fizesse uma imagem de uma árvore”. Aceita saudações, cortesia, acentos, formas coloquiais e pedidos equivalentes em inglês.

Convites mais ambíguos, como “Que tal uma imagem de um gato?”, continuam exigindo decisão estruturada do LLM: instrução com exemplos, thinking desligado, até 64 tokens, parser de thinking existente e JSON estrito (também aceita um bloco Markdown contendo somente o JSON). Saudações, perguntas sobre capacidade/funcionamento, pedidos negados, imagens Docker/ISO e alguns pedidos de análise/edição ficam fora da geração automática. Não usa palavras isoladas como “imagem” para iniciar uma geração.

A normalização existe apenas para classificar; o prompt original não é traduzido, reescrito ou expandido. Motor, modelo, parâmetros, quantidade de imagens, progresso, cancelamento, salvamento e alternância de recursos permanecem existentes. Um pedido explícito pode gerar imagem sem GGUF textual carregado, mas ainda exige modelo de imagens compatível selecionado; ausência de modelo continua apresentando o erro real.

Verificações: 48 pedidos positivos e 33 negativos, decisões ambíguas com LLM simulado, rejeição de JSON inválido/prosa/chaves extras, suporte aos marcadores de thinking e preservação do texto original. Integração adicionada ao `npm test` Windows; suíte de 23 testes. Os testes de intenção não são prova de inferência de imagens: não foi executado checkpoint de imagem real nesta correção.

Build/artefato: pendentes da compilação desta revisão. Nenhuma alteração em runtime nativo, pesos, interface visual ou dados existentes. O ajuste compartilhado também fica disponível no código Android, mas a entrega desta correção é Windows.
