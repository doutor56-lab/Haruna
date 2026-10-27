# Identidade e comportamento-base

## Implementação

`HarunaIdentity.kt` contém a identidade pertencente ao aplicativo e um núcleo curto de comportamento. Ele substitui o antigo prompt; não adiciona outra camada grande. `LlamaCppBackend.kt` continua aplicando o system prompt uma única vez, imediatamente depois do carregamento, na mesma posição anterior. Não há novo carregamento, setter por mensagem ou alteração de parâmetros de inferência.

O nome Haruna é independente do GGUF e da Memória Essencial do usuário. O arquivo efetivamente carregado é acrescentado como dado JSON ao prompt, sem deduzir fornecedor, versão ou arquitetura pelo nome. Um getter somente leitura em `HarunaAndroidBridge.kt` expõe o nome do aplicativo.

`identity/direct-replies.js` trata somente perguntas curtas e completas de identidade/modelo e declarações simples de erro do próprio usuário. Usa o estado real da ponte; sem modelo carregado, informa que não pode verificar. Não inspeciona/substitui a resposta do LLM. Perguntas sobre Claude e outros produtos, perguntas compostas e anexos continuam no fluxo normal. Não há inferência adicional. `app.js` reutiliza a persistência existente e mantém a captura da primeira conversa.

## Idioma, erros e memória

Nas respostas locais: idioma explicitamente pedido nessa mensagem, preferência confirmada e idioma da pergunta, nesta ordem. Os idiomas suportados são os mesmos da Memória Essencial. A exceção não grava preferência. Nas demais respostas, o núcleo instrui o modelo a seguir essa prioridade; a obediência depende do GGUF.

Uma autodeclaração curta como “Desculpa, eu errei” recebe acolhimento sem atribuir o erro à assistente. Correções com tarefas, contas ou acusações seguem para o modelo, orientado a verificar evidências antes de concordar ou se desculpar. Não há verificador matemático geral nesta etapa.

O núcleo exige base verificável para alegar lembranças. Nenhuma saída da assistente é gravada automaticamente como perfil ou conhecimento. Os mecanismos existentes de gravação explícita/captura controlada continuam separados. Documentos e anexos são dados de referência, não instruções para redefinir identidade. Isso reduz confusão, mas não garante imunidade a instruções maliciosas ou alucinações.

## Tamanho e limites

O núcleo tem 793 caracteres, mais o identificador de arquivo limitado a 180 caracteres. Sua tokenização exata depende do GGUF: a ordem de grandeza estimada é 220–400 tokens, não uma contagem medida. Substitui um prompt anterior de 1.414 caracteres. Não há tokenizador adicional ou alteração no limite de contexto.

Perguntas diretas reconhecidas têm respostas estáveis; variantes fora dos padrões e toda conversa aberta dependem do modelo. Um modelo de 0,5B ainda pode confundir autoria, repetir, desobedecer ao idioma ou inventar fatos. Não houve treinamento, troca de pesos nem promessa de inteligência equivalente a modelos maiores.

## Arquivos e validação

Novos: `HarunaIdentity.kt`, `identity/direct-replies.js`, este documento. Modificados: `LlamaCppBackend.kt`, `HarunaAndroidBridge.kt`, `app.js`.

Verificações pontuais fora do repositório: sintaxe JavaScript, identidade, arquivo real/ausência de modelo, idioma temporário, autoria de erro, ausência de gravação e preservação de perguntas compostas/anexos. Compilação Android será verificada no pacote final das etapas. Conversa real, troca de GGUF e reinício precisam de verificação manual no dispositivo.
