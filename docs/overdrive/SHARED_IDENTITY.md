# Identidade compartilhada — Android e Windows

Base: `4e40b1fcfee09e1a682d92475df11ef3c3bf50e8`.
Branch: `feature/android-overdrive`. Checkpoint: `checkpoint/before-identity-config-4e40b1f`.

`app/src/main/assets/haruna/identity/config.json` centraliza nome, desenvolvedor, instrução de identidade, resposta de referência e referências aos avisos existentes. O build Windows copia esse mesmo asset, sem manter outra identidade manual.

A autoria da Haruna é Proxys Labs. O fornecedor do modelo é separado: nome, autor, organização, licença e URL vêm de metadados GGUF declarados, quando disponíveis. Não se deduz origem a partir do nome do arquivo. Autor/organização podem identificar conversão ou distribuição, não necessariamente treinamento. Ausência de dados é explicitada. Não se afirma propriedade de pesos de terceiros nem parceria/afiliação.

Android injeta a instrução no papel `system` de cada geração e na preparação do prefixo; troca de modelo renova os metadados. Windows usa a mesma instrução em cada solicitação ao llama-server, incluindo conversas recuperadas. A análise visual também recebe `system`, formatado pelo template Jinja do runtime no Android e pela API de chat no Windows. Os pesos e os arquivos de modelos não são modificados.

As respostas locais antigas que diziam desconhecer o desenvolvedor foram corrigidas. Perguntas sobre o modelo continuam consultando o estado nativo atual. Sobre, em Configurações, mostra os créditos e permite ler os textos locais de licença já incluídos, carregados sob demanda. O painel acompanha alterações de estado, sem polling adicional. Fontes, temas, recursos e dados existentes não foram substituídos.

## Validação

- `npm --prefix desktop run prepare:ui` e `npm --prefix desktop test`: 30 testes passaram. Incluem leitura real de cabeçalho GGUF sintético e controlador real com HTTP/processos simulados: identidade em cada solicitação, troca de modelo, reinício e restauração de histórico completo.
- `NODE_PATH=/opt/codex/cua_node/lib/node_modules node tests/identity_ui_check.cjs`: passou com bridges Android e Windows simuladas, perguntas sobre identidade/autoria/modelo, unload, reinício, atualização do fornecedor e leitura offline de licença.
- `python3 tests/identity_android_check.py`: identidade e comportamento Kotlin reais compilados com Kotlin 2.3.0; Android Context de assets simulado. Duas execuções JVM passaram. Ferramentas externas temporárias em `HARUNA_KOTLIN_TOOLS` (padrão `/tmp/haruna-identity-tools`); não são dependências novas do aplicativo.
- `haruna_vision.cpp`: verificação sintática C++ com os headers reais do llama.cpp fixado e headers JNI temporários passou. Não equivale a link/build Android ARM64.
- Electron real em Linux passou no smoke local: inicialização, persistência de lote 100, escalas, isolamento de voz e dois ciclos VAD nativos.
- UI de imagens em 360×800 e 800×1280 passou, incluindo cancelamento, persistência e galeria paginada.

Sem novo APK/EXE nesta alteração e sem workflows remotos disparados. A integração Android completa não foi compilada neste ambiente sem SDK/NDK. Não houve inferência real com um GGUF de linguagem ou visão nesta tarefa: os testes validam configuração, mensagens e estado, não garantem obediência de qualquer modelo às instruções. Não há métricas novas de desempenho.

## Limpeza do comando de imagem

Atendendo à instrução posterior, o encaminhamento compartilhado remove comandos explícitos no início da descrição: `Crie uma imagem: um gato` envia `um gato` ao motor. Não traduz nem amplia a descrição. Comandos dentro do conteúdo (por exemplo, texto entre aspas num cartaz) permanecem. O histórico conserva a mensagem original, e o JSON do motor registra o prompt efetivamente utilizado. Descrição vazia após a limpeza é recusada. Quantidade, seeds, CFG, etapas e cancelamento permanecem independentes. Testes de intenção e despacho verificam o texto limpo e a mensagem original preservada.
