# Correções da interface e diagnóstico de encerramento — 11/11/2026

- Windows: folha de layout aplicada depois das folhas compartilhadas. Janela usa a largura disponível; cabeçalho, mensagens, compositor e navegação têm dimensões de desktop, mantendo escala salva e sem afetar Android.
- Android/Windows: os controles existentes de etapas/CFG eram transferidos para o painel conservando `hidden`/classe `image-engine-only`. Agora perdem essas marcas e aparecem antes de Avançado. Os controles técnicos restantes continuam em Avançado. Atalho em Modelos locais → Imagens abre o mesmo painel; sem preferências duplicadas.
- Encerramento Windows após minutos: causa ainda não demonstrada. Registro limitado (32 KiB + arquivo anterior) em `%APPDATA%/Haruna Windows/diagnostics/runtime.jsonl`, somente estágio, horário, tipo, motivo e código de saída. Não contém textos, exceções brutas ou caminhos de modelos. Falha do renderizador oferece reabrir a interface; não encerra nem reinicia automaticamente os motores. Falha de inicialização deixa mensagem visível. Não há captura/supressão global de exceções fatais.

## Validação

16 testes Node passaram; teste de navegador com ponte simulada confirma Etapas/CFG visíveis e persistidos em 360×800 e 800×1280. Electron Linux headless carregou a interface real, confirmou CSS desktop, largura da janela, controles, persistência de dimensões, recarga e corte PNG de fixture. Sem inferência de modelo neste teste.

O teste antigo `image_ui_check.cjs` encontra botão legado oculto de dimensões e falha; foi preservado. O novo teste direcionado usa o ícone público do chat. Não é falha nova de inferência.

Fechamento Windows não reproduzido neste Linux: não declarar corrigido. Se repetir, coletar o `runtime.jsonl` e o evento correspondente no Monitor de Confiabilidade do Windows (`perfmon /rel`); ambos podem identificar renderizador/GPU/OOM/main. Nenhum runtime, pesos, persona ou dados persistentes foi substituído. Build Android/Windows em Actions ainda deve ser confirmado.
