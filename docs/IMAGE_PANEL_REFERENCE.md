# Painel lateral — ajuste visual

Base: `f01a1eb3af76b4fc69cf48b6ddbbcc557d93afa0`.
Checkpoint: `checkpoint/before-image-panel-reference-20261107`.

Painel não modal à esquerda, largura máxima 360 px e margem lateral livre mínima de 84 px no celular; altura limitada a 68% do viewport e ao espaço acima do compositor. Conteúdo excedente tem rolagem vertical, mantendo Salvar mudanças acessível. Tipografia autorizada pelo usuário, restrita ao painel. CSS original do chat/cabeçalho/navegação permanece intacto.

Enquadramento ilustrativo em CSS (não uma prévia gerada), proporção/dimensões, orientação, seletores de proporção/resolução, quantidade e Avançado. Etapas e CFG mantêm sliders e campos numéricos existentes; demais controles preservados. Ícone de imagem alterna abrir/fechar o painel, sem salvar nem gerar; estado expandido exposto por ARIA. Botão thinking original movido do cabeçalho para a direita da barra do modelo, mantendo ID, listener e persistência. Sem alteração de motores, dados, preferências salvas ou geração nativa.

Verificação: Chromium 360×800 e 800×1280 com bridge/PNG simulados; controles, persistência, cancelamento, ações, histórico e dimensões; limites de largura/altura do painel e ausência de overflow horizontal. Não equivale a teste físico ou inferência. Verificação estática preserva hashes do CSS original e restringe novos tamanhos de fonte ao painel.

A autorização do build anterior foi utilizada no APK `9a6ffe4`, que não contém este ajuste. O novo build foi autorizado posteriormente, conforme o registro abaixo. A limitação de assinatura original continua existente.

## Build 0.8.2 autorizado

Usuário autorizou novo build e remoção de versões antigas. Compilação ARM64 0.8.2 (versionCode 11). Limpeza pós-publicação mantém APK atual e quatro versões anteriores no Actions, sem apagar fontes, relatórios, Windows, modelos, releases, branches ou commits. Script testado localmente, sem executar deletes locais; resultado real será registrado após o Actions. A limpeza está limitada ao push com mensagem exata desta entrega, não a todo build futuro. Assinatura original continua indisponível; não desinstalar nem limpar dados.

## Resultado final 0.8.2

Actions [42338386688](https://github.com/doutor56-lab/Haruna/actions/runs/42338386688) concluído com sucesso; commit compilado `aa90915a834f377ae173487eac7562fc3fbf3078`. APK `Haruna-Consolidada-ARM64-debug.apk`: 79.573.394 bytes; SHA-256 `fa6179efecabe3fb648a959bd8a75e9761995d92e666f35cf571b8b922b29a71`. [Download do APK](https://github.com/doutor56-lab/Haruna/actions/runs/42338386688/artifacts/13561613186).

Assinatura v2 validada com ApkVerifier; certificado `e6fe4f1559a66bc894793e115bb7189f8befc59ff2c3368bf6e8e0c3a370a211`, diferente do anterior. Atualização direta exige a chave original; não desinstalar nem limpar dados. Assets do painel no APK conferidos contra o código validado. Testes automatizados e build passaram; não houve teste físico Android.

Limpeza autorizada concluída: 82 artefatos APK removidos, 1.580.673.284 bytes. Mantidos APK atual e quatro anteriores (runs 42328548271, 42301711003, 42226923268, 42144339412), conferidos após a limpeza. Fontes, relatórios, Windows, modelos, releases e código preservados. Detalhes por ID em `docs/evidence/consolidated/BUILD_RESULT_082.json`.

O primeiro envio teve YAML recusado antes de criar jobs; condição corrigida e validada antes desta execução. Após sucesso, o hook temporário de limpeza e a permissão Actions write foram retirados em commit de documentação/encerramento com `[skip ci]`, sem nova compilação remota.
