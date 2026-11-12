# Overdrive 1.3.1 — envio de texto após abrir configurações de imagem

Base `e62f90b`, branch `feature/android-overdrive`, checkpoint `checkpoint/overdrive-before-image-routing-e62f90b`.

## Causa e correção

O ícone abria o painel e também marcava `harunaImageMode=true`. O submit do compositor verificava esse sinal antes do fluxo normal e encaminhava qualquer mensagem diretamente a `harunaStartImage`, ignorando a intenção. Fechar pelo X ou salvar também podia deixar o sinal ativo. Com nenhum modelo selecionado, enviar “oi” produzia o aviso de instalação SD1.5 da captura do usuário.

Removido esse modo implícito: o ícone abre/fecha somente as configurações e todos os envios passam pelo fluxo existente de texto/anexos. Pedidos explícitos continuam usando `imageCandidate` + decisão JSON da LLM. A regra de intenção, os prompts, os motores e os parâmetros de imagem não foram alterados. O destaque visual do ícone agora acompanha `aria-expanded`, incluindo fechamento pelo X, Escape e salvamento.

Sem migração ou remoção de histórico/modelos/preferências; correção anterior do instalador Whisper preservada. Mesmos applicationId e nome Haruna Overdrive. Versão 1.3.1-overdrive, código 17.

## Verificações

`tests/image_chat_routing_check.cjs` reproduziu o aviso exato antes da correção. Depois passou em 360×800 e 800×1280: “oi” com painel aberto, fechado pelo ícone, X e salvar, com e sem modelo de imagem; pergunta sobre imagens não chama classificador; pedido explícito chama classificador e encaminha o prompt original ao motor. Pontes de inferência simuladas: não é teste de geração real nem de desempenho Android.

Execução: `NODE_PATH=/opt/codex/cua_node/lib/node_modules node tests/image_chat_routing_check.cjs`, com Playwright e Chromium instalados. Testes existentes de intenção, integridade da interface e streaming de voz passaram. Resultado do build/APK será registrado após conclusão.

`tests/image_parameters_check.cjs` passou nas duas dimensões, validando etapas/CFG visíveis e persistidos. O teste legado `tests/image_ui_check.cjs` para ao clicar no antigo atalho oculto `[data-dimensions]`; a mesma falha foi reproduzida no código base `e62f90b`, sem a correção. Não se alterou a interface para acomodar esse teste desatualizado.

A assinatura debug anterior continua indisponível; não desinstalar nem limpar dados para contornar atualização com certificado diferente. O APK deve ser validado antes de se afirmar compatibilidade de atualização. Não houve aparelho conectado.

## Entrega conferida

- Código compilado: `be1548c4762b81c981bb4445f70647126116e4de`.
- [Build 43316360957](https://github.com/doutor56-lab/Haruna/actions/runs/43316360957): sucesso; Gradle `:app:testDebugUnitTest :app:assembleDebug`, `BUILD SUCCESSFUL in 19m 6s`. Verificações de pacote, nome e publicação também passaram.
- [Artefato ARM64](https://github.com/doutor56-lab/Haruna/actions/runs/43316360957/artifacts/13989199084), disponível até 19/11/2026; contém APK e SHA256SUMS.txt.
- `Haruna-Overdrive-ARM64.apk`: 79324856 bytes; SHA-256 `41f8468be6b4bb825961eba77a067fab1d3aeacf083eef4a7de8cc6a1e8f4907`, conferido no download real contra o manifesto. Bibliotecas exclusivamente ARM64. `app.js` e `image-chat.js` do APK conferidos: nenhum encaminhamento pelo antigo `harunaImageMode`.
- Certificado SHA-256 `3f8f434c09151777f97f2fa42396c5b2727f64d00275127b9356b0abc5037940`, diferente do build 1.3 (`63f2e3877d6cd5235ab59b386dd1d5d2bdcc31be847df527b5bfaf40243bdcd1`). Não é atualização compatível com a assinatura anterior. A chave anterior é necessária para atualizar preservando o sandbox; não foram desinstalados apps, apagados dados ou alterado o applicationId.

Validação física pendente: enviar “oi” após abrir/fechar/salvar o painel e, separadamente, um pedido explícito de imagem. A reprodução automatizada cobre o roteamento, sem comprovar inferência no aparelho.
