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
