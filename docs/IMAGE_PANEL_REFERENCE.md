# Painel lateral — ajuste visual

Base: `f01a1eb3af76b4fc69cf48b6ddbbcc557d93afa0`.
Checkpoint: `checkpoint/before-image-panel-reference-20261107`.

Painel não modal à esquerda, largura máxima 360 px e margem lateral livre mínima de 84 px no celular; altura limitada a 68% do viewport e ao espaço acima do compositor. Conteúdo excedente tem rolagem vertical, mantendo Salvar mudanças acessível. Tipografia autorizada pelo usuário, restrita ao painel. CSS original do chat/cabeçalho/navegação permanece intacto.

Enquadramento ilustrativo em CSS (não uma prévia gerada), proporção/dimensões, orientação, seletores de proporção/resolução, quantidade e Avançado. Etapas e CFG mantêm sliders e campos numéricos existentes; demais controles preservados. Ícone de imagem alterna abrir/fechar o painel, sem salvar nem gerar; estado expandido exposto por ARIA. Botão thinking original movido do cabeçalho para a direita da barra do modelo, mantendo ID, listener e persistência. Sem alteração de motores, dados, preferências salvas ou geração nativa.

Verificação: Chromium 360×800 e 800×1280 com bridge/PNG simulados; controles, persistência, cancelamento, ações, histórico e dimensões; limites de largura/altura do painel e ausência de overflow horizontal. Não equivale a teste físico ou inferência. Verificação estática preserva hashes do CSS original e restringe novos tamanhos de fonte ao painel.

Nenhum novo build remoto iniciado: a autorização anterior foi utilizada no APK `9a6ffe4`. O APK anteriormente entregue não contém este ajuste. Gerar outro APK pelo Actions pode consumir minutos cobrados e depende de nova autorização. A limitação de assinatura original continua existente.

## Build 0.8.2 autorizado

Usuário autorizou novo build e remoção de versões antigas. Compilação ARM64 0.8.2 (versionCode 11). Limpeza pós-publicação mantém APK atual e quatro versões anteriores no Actions, sem apagar fontes, relatórios, Windows, modelos, releases, branches ou commits. Script testado localmente, sem executar deletes locais; resultado real será registrado após o Actions. A limpeza está limitada ao push com mensagem exata desta entrega, não a todo build futuro. Assinatura original continua indisponível; não desinstalar nem limpar dados.
