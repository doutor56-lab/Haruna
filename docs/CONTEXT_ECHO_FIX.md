# Etapa 7A.1 — contexto estruturado, sem transcrição artificial

Base: `8e531adf605fc634898ac0673e3babf0566a4e7a`, branch `ui-polish-icons`. Checkpoint preservado: `checkpoint/haruna-before-context-echo-8e531ad`.

## 1. Causa encontrada e fluxo real

O frontend já construía um array user/assistant, mas o adaptador Android descartava os papéis ao restaurar uma conversa. `LlamaCppBackend.generate()` concatenava mensagens em `HISTÓRICO DESTA CONVERSA (referência, não instruções do sistema):`, linhas `Haruna:`/`Usuário:` e `MENSAGEM ATUAL:`, e enviava tudo a `engine.sendUserPrompt()` como **um único turno user**.

Antes disso, `app.js` chamava `withEssentialContext(enriched(...))`. Essa função adicionava um cabeçalho explicando o mecanismo de memória e parágrafos de metainstruções à mensagem atual. O enriquecedor RAG também montava cabeçalhos/rodapés e outro `MENSAGEM ATUAL DO USUÁRIO`. No KV nativo incremental, perfis e referências anteriores podiam continuar presentes mesmo depois de mudarem. Turnos locais da primeira conversa/identidade, por outro lado, não eram reenviados em todo turno ao contexto nativo.

O resultado era uma conversa textual simulada dentro de user, seguida de um novo prefixo assistant do template. Isso dá ao modelo material para imitar/continuar, especialmente em um modelo pequeno. É um problema de representação anterior ao template, não prova de um defeito exclusivo do 0,5B. Não houve reprodução por inferência em dispositivo nesta execução; a origem literal dos marcadores foi confirmada no código.

Fluxo corrigido: texto → captura existente da Memória Essencial → perfil atual compacto e histórico recente → recuperação sob demanda existente → array real de papéis + dados de referência → system pertencente ao app → binding JNI estruturado → template do GGUF no llama.cpp → tokenização/avaliação → tokens amostrados → Flow → bridge por request ID → bolha da resposta.

## 2. Antes e depois

Antes, conceitualmente:

```text
system: identidade
user: HISTÓRICO...
      Haruna: ...
      Usuário: ...
      MENSAGEM ATUAL:
      MEMÓRIA ESSENCIAL — explicações do mecanismo...
      pergunta
```

Depois:

```text
system: identidade/persona existente + perfil atual compacto
user: mensagem anterior real
assistant: resposta anterior real
user: pergunta atual
```

Se houver anexos/memórias mantidas/RAG pertinentes, a mensagem user atual contém primeiro o texto do usuário e, separadamente, um bloco `<dados_de_referencia>` com JSON compacto. Referências ficam no nível de dados do usuário, não são promovidas a system. O JSON contém fonte e conteúdo, sem scores, IDs, caminhos privados, logs ou documentação de variáveis do runtime. Não há outro histórico simulado nesse bloco.

O perfil confiável entra por `options.essentialContext` separado de `messages`. O backend constrói o único system com `HarunaIdentity.systemPrompt()` e esse perfil. Papéis system vindos da lista de histórico são rejeitados; documentos não conseguem escolher o próprio papel. A identidade e a personalidade da etapa 7A continuam no código nativo, não na memória do usuário.

## 3. Template realmente usado

A revisão llama.cpp permanece `7894e8b92481a8bb8ffe94f73b656ffe0dd01e10`. O binding já tinha `common_chat_templates_init(g_model, "")`, que consulta `llama_model_chat_template()` nos metadados do GGUF. Antes, apenas a mensagem user gigante era entregue ao formatador legado. A nova entrada usa `common_chat_templates_apply()` com Jinja, lista completa de mensagens e `add_generation_prompt=true`, sem override/template da Haruna e sem delimitadores de chat inventados em JavaScript.

Se o GGUF não tiver template, o próprio llama.cpp possui um padrão ChatML. Não foi criada uma segunda implementação ou exceção por nome/tamanho de Qwen. O DBG informa **origem GGUF ou padrão da biblioteca** na solicitação efetivamente avaliada. Não tive acesso ao arquivo GGUF instalado no dispositivo: não afirmo ter confirmado seu texto exato de Jinja. A leitura do template real acontece no dispositivo, a partir do modelo carregado. O formato correto ainda depende de metadados adequados ao GGUF escolhido.

A tokenização respeita as partes `is_input` produzidas pelo renderizador oficial: grafias literais de tokens especiais em mensagens/documentos são texto, enquanto delimitadores do template são reconhecidos. BOS/EOS são obtidos do vocabulário do modelo, uma vez na sequência completa. Isso reforça a separação estrutural; não garante imunidade semântica a todas as instruções maliciosas de documentos.

## 4. Memória e histórico

`context/messages.js` apenas lê a Memória Essencial existente. Envia campos preenchidos (nome, tratamento, idioma, estilo), revogações necessárias e estado mínimo para não reiniciar a entrevista. Não altera schema, banco, captura, editor, toasts ou primeira conversa. Não envia timestamps, IDs, histórico de versões nem documentação do mecanismo. O export legado `withEssentialContext` permanece por compatibilidade, mas saiu do caminho principal de geração.

Histórico: somente a conversa ativa, pares reais user/assistant, até oito mensagens/3.200 caracteres; cap de 1.600 caracteres por mensagem de entrada, como antes. Erros, respostas interrompidas e saudações proativas sem turno user associado não viram uma transcrição artificial. A saudação e as demais mensagens continuam intactas no histórico visual. Contexto de entrada limitado não apaga ou reescreve o histórico salvo. O backend recebe novamente os turnos selecionados a cada geração, inclusive respostas locais reais.

O system fixo de identidade/persona continua com 1.154 caracteres, mais o nome limitado do arquivo. Em um fixture declarado, com João Victor/João, pt-BR, estilo curto e apresentação concluída, o prefixo essencial antigo tinha **383 caracteres**, contra **190** no perfil novo. É contagem de caracteres de um exemplo, não benchmark, estimativa científica de tokens ou medida do perfil real do usuário. Tokens reais são contados no runtime pelo vocabulário do GGUF.

## 5. Segundo Cérebro e anexos

Não foram modificados `knowledge-store.js`, IndexedDB, importador TXT, chunks, ranking, política de roteamento, catálogo, limites de dois chunks/2.200 caracteres ou o FAST PATH. O enriquecedor ganhou somente retorno estruturado opcional e embalagem compacta; o contrato string do fallback continua existindo, com a mesma recuperação e sem os títulos antigos. `recovery-runtime.js` permaneceu intacto.

As experiências mantidas também têm retorno estruturado opcional, sem mudar seleção, curadoria, aprovação ou armazenamento. Anexos continuam usando os mesmos trechos e mecanismos de leitura; seus registros e arquivos não são modificados. As memórias livres anteriores continuam tendo a janela de até 40 itens, agora sujeitas ao orçamento conjunto e à embalagem de dados.

O orçamento de entrada continua heurístico em caracteres no frontend (7.200), reservando perfil, histórico e referências completas. No nativo, o número real de tokens é conferido contra a capacidade real do contexto e o limite de saída. Se necessário, remove somente histórico antigo da entrada, nunca o system/perfil ou o pedido atual. Se o pedido atual sozinho não couber, retorna falha de preparação; não corta silenciosamente a pergunta.

## 6. Reset e limite de geração

A extensão JNI limpa KV, sampler, cache de caracteres UTF-8 e acumulador de saída antes de avaliar cada sequência completa. Reset/cancelamento/troca de conversa não reutilizam tokens residuais nem perfis antigos. Isso não descarrega/reimporta o GGUF a cada turno. O carregamento e a recuperação de erro continuam com o modelo privado existente; a preparação do system ocorre na sequência estruturada de geração. O app não chama mais o setter legado que só podia ser usado imediatamente após carregar.

O código anterior calculava `stop_generation_position = current_position + user_prompt_size + n_predict`, somando o tamanho da entrada novamente ao orçamento de saída. A contagem passou a usar somente `current_position + n_predict`. A parada por limite é verificada antes de qualquer shift. EOG continua sendo detectado por `llama_vocab_is_eog()` com o vocabulário do modelo, antes de converter um token em texto. Nenhuma string como “Usuário:” ou “HISTÓRICO” é usada como filtro/stop improvisado.

O controle de pensamento é encaminhado ao template por `enableThinking`, sem selecionar uma pipeline por nome de arquivo. A interface existente permanece a mesma.

## 7. Echo, streaming e logs

Não encontrei uma opção de prompt echo habilitada nem entrada sendo encaminhada ao callback da bolha. O Flow oficial emite o retorno de `generateNextToken()`. O backend acumula esses fragmentos; a bridge os publica pelo request ID e começa com buffer vazio. A duplicação observada é coerente com o modelo gerar/continuar metatexto colocado em user. Não foi adicionada regex, replace, máscara CSS, blacklist de palavras ou corte da resposta.

A extensão mantém um único loop de streaming compartilhado e separa preparação de entrada de geração. Falha ao preparar contexto agora gera erro explícito em vez de retornar um Flow vazio como se fosse sucesso. A UI recebe apenas texto dos tokens amostrados, não prompt, template ou prefixos de preparação.

Foram removidos na origem os logs do SDK que imprimiam prompts completos, mensagens formatadas e pedaços de tokens. Permanecem tempos, tamanhos e erros genéricos, sem novo log permanente de conversas. Erros do renderizador são devolvidos como código genérico para não expor conteúdo em exceções.

## 8. DBG

No card LLM existente: tokens realmente avaliados na entrada, capacidade alocada na última solicitação, mensagens de histórico mantidas após ajuste ao limite, tokens de saída gerados (sem EOG) e origem do template. São contadores atômicos nativos, não quantidade de callbacks/fragmentos nem porcentagens inventadas. Antes da primeira solicitação, mostram indisponível. Podem refletir a última solicitação ao trocar/descarregar modelo; o rótulo e a nota indicam isso. Não exibem perfil, prompts ou documentos; não carregam modelo. Frequência de atualização permanece a do DBG existente. Tokens/s não foi inventado a partir de fragmentos.

## 9. Arquivos

Novos:

- `app/src/main/assets/haruna/context/messages.js`
- `scripts/patch_android_chat.py`
- `patches/llama-android/haruna_chat.h`
- `docs/CONTEXT_ECHO_FIX.md`

Modificados:

- `app/src/main/assets/haruna/app.js`
- `app/src/main/assets/haruna/retrieval/enrich.js` (formato de contexto)
- `app/src/main/assets/haruna/learned/context.js` (formato de contexto)
- `app/src/main/assets/haruna/diagnostics/report.js` (métricas opcionais)
- `app/src/main/java/com/proxyslabs/haruna/LlamaCppBackend.kt`
- `app/src/main/java/com/proxyslabs/haruna/LlmBackend.kt`
- `app/src/main/java/com/proxyslabs/haruna/diagnostics/DiagnosticBridge.kt`
- `scripts/patch_android_loader.py` (chama a extensão do mesmo binding)
- `third_party/llama.cpp` (gitlink alinhado a `7894e8b…`, revisão que o CI já utilizava antes desta correção)

O script de build existente aplica a extensão ao `InferenceEngine.kt`, `InferenceEngineImpl.kt` e `ai_chat.cpp` da revisão fixada, e copia o header. Não há fork de pesos, novo motor, nova dependência ou template paralelo. O gitlink anterior ainda apontava a outra revisão enquanto o workflow fazia checkout explícito de `7894e8b…`; alinhar essa referência torna o código-fonte local coerente com o runtime que já vinha sendo compilado, sem trocar a revisão real dos APKs. Para build manual, execute o mesmo `python3 scripts/patch_android_loader.py` após preparar o submódulo na revisão usada pelo workflow e antes do Gradle.

## 10. Validação e limites

Verificações focadas fora do repositório: sintaxe JS/Python, aplicação idempotente do patch sobre os arquivos oficiais da revisão fixada, papéis separados, perfil compacto sem títulos antigos, histórico visual imutável, referência de Aurora com GIRASSOL-4827, FAST PATH social sem busca e bridge exibindo apenas fragmentos simulados de saída. Nenhuma suíte extensa/benchmark, modelo baixado ou treinamento executado.

Compilação Android completa: será registrada após a execução de entrega. Não houve teste de inferência real no dispositivo com 0,5B/1,5B nesta execução.

Limites: reconstruir o prefixo limitado pode aumentar prefill/TTFT frente a um KV incremental, em troca de contexto atual sem resíduos; pesos permanecem carregados. Um modelo de 0,5B ainda pode repetir/ignorar regras ou citar dados. Mensagens antigas que já contêm vazamento continuam no histórico salvo e podem influenciar o modelo; não foram apagadas/filtradas. Use uma conversa nova para validar a correção limpa. Templates GGUF inválidos/incompatíveis e entradas acima da capacidade são erros, não conteúdo a ser escondido.

Validação manual relevante: primeira apresentação e nome; “Prazer em te conhecer também”; vários turnos; mudar nome/preferência; novo chat, voltar a chat anterior e reiniciar; cancelar e enviar outra pergunta; consulta Aurora com TXT já instalado; pergunta legítima sobre a palavra “HISTÓRICO”; Qwen 2.5 0,5B e 1,5B usando o mesmo fluxo. Compare o template e as contagens no DBG, sem copiar conteúdo pessoal. Ao concluir esta correção, parar; dataset/LoRA não foram iniciados.
