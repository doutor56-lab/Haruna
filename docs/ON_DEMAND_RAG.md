# Etapa 3 — Segundo Cérebro sob demanda

Base: etapa 2, commit `e60bbc64bb222b525a92b9fb583cdbaf5ebf69da`, mesma branch `ui-polish-icons`.

Checkpoint anterior: `checkpoint/haruna-before-on-demand-rag-e60bbc6`.

## Escopo

A etapa modifica somente a decisão de consultar, a coordenação da consulta e a montagem limitada das referências. O armazenamento, importação TXT, chunks, algoritmo de busca/ranking e atualização de uso existentes são reutilizados. Não se apaga, reconstrói ou migra nenhum dado. Quando a busca é realmente chamada, ela mantém inclusive sua atualização normal de estatísticas de uso.

Memória Essencial, runtime LLM, GGUF, parâmetros de geração, conversas, histórico, STT/TTS, treinamento e anexos não são reformulados. A integração de anexos mantém seu conteúdo e suas operações existentes, montando primeiro esse contexto para reservar espaço antes do RAG opcional.

## Arquivos novos

- `app/src/main/assets/haruna/retrieval/policy.js`: regras locais, normalização e verificação lexical de pertinência.
- `app/src/main/assets/haruna/retrieval/enrich.js`: catálogo leve em RAM, chamadas à busca existente, orçamento e referências como dados.
- `app/src/main/assets/haruna/retrieval/indicator.js`: indicador temporário de consulta real.
- `app/src/main/assets/haruna/retrieval/indicator.css`: somente posicionamento do novo indicador; reaproveita o componente e ícone existentes de memória.
- Este documento.

## Arquivos existentes alterados

- `recovery-runtime.js`: somente a função `enrichPrompt` delega à coordenação sob demanda, por import local e com retorno do texto original em falha. O ponto público `__HARUNA_ENRICH_PROMPT__` e o fluxo de importação TXT permanecem iguais.
- `app.js`: passa contexto recente, comprimentos reservados e presença de anexos ao mesmo ponto público. O contexto de anexos/memórias existentes é montado antes de pedir referências opcionais. A Memória Essencial continua sendo acrescentada depois, no topo do prompt final, como na etapa 2.
- `index.html`: carrega indicador e CSS isolados.
- `diagnostics/metrics.js` e `diagnostics/report.js`: contadores/razões do roteamento, quantidade de trechos selecionados e tamanho do contexto recuperado. Sem perguntas, conteúdos, nomes de documentos ou valores pessoais no diagnóstico.

Sem alteração em `knowledge-store.js`, `attachment-store.js`, fontes `essential/*`, `llm-engine.js`, `android-bridge.js`, fontes Kotlin, Gradle, permissões, estilos anteriores ou gerenciamento de modelos.

## Decisão local, sem inferência extra

O roteador usa regras pequenas, não outra chamada ao Qwen. Nos casos reconhecidos de saudação, agradecimento, conversa comum, pergunta sobre personalização, conta aritmética simples ou continuação do contexto recente, retorna a mensagem original sem chamar `search()` nem abrir IndexedDB.

Perguntas sobre o próprio nome/idioma/estilo priorizam a Memória Essencial. Continuações como “explique melhor” com resposta recente usam o contexto da conversa. Pedidos relacionados a um anexo já presente priorizam o fluxo existente desse anexo, salvo pedido explícito ao Segundo Cérebro. Mensagens que já incluem código em bloco ou muito contexto também evitam consulta automática, a menos que o pedido de documentos esteja explícito fora do bloco de código.

Uma instrução reconhecida para não consultar tem precedência. Pedidos explícitos sobre documentos/Segundo Cérebro, perguntas factuais e assuntos identificados no catálogo podem consultar documentos ativos. Exemplos de conversação são buscados principalmente em tarefas de formular respostas/conversas; não são carregados por padrão em toda saudação ou pergunta técnica.

O catálogo é somente uma contagem de documentos ativos por tipo e até 512 termos dos nomes, sem conteúdo ou IDs. É lido da lista de metadados apenas quando a decisão precisa dele. Mudança de conhecimento invalida e libera o cache. Não há cache de perguntas ou de respostas recuperadas.

## Consulta pequena e pertinente

O mecanismo existente `knowledge.search()` continua realizando a recuperação. Consulta típica factual: uma chamada para conhecimento, com limite de dois candidatos. Conversação: uma chamada para comportamento, com limite de um. Pedido explícito envolvendo ambos pode consultar os dois tipos.

Um filtro posterior descarta correspondências lexicais fracas, principalmente as que só coincidem no nome de uma linguagem em uma pergunta mais específica. Ele usa palavras normalizadas, não embeddings nem inferência. Pedidos explícitos têm critério mais permissivo para preservar a intenção de consultar uma fonte.

No máximo **dois chunks completos** são incluídos no contexto. Orçamento máximo: **2.200 caracteres**, incluindo rótulos/serialização. O orçamento diminui para reservar primeiro texto atual, Memória Essencial, até 3.200 caracteres de histórico recente e contexto local já existente de memórias/anexos, dentro do orçamento de caracteres usado pela conversa atual. Com pouco espaço, a consulta é pulada. Não se corta um chunk no meio de código apenas para preencher o espaço restante.

Se nada suficientemente pertinente couber, o prompt original é devolvido. Não se inventa resposta, fonte, trecho ou sucesso de recuperação.

## Dados recuperados e falhas

Trechos são serializados em um pequeno array JSON, com referência numérica e tipo. O texto ao redor os identifica como dados de referência e orienta ignorar ordens presentes neles, preservando o pedido atual.

Isso é delimitação e orientação ao modelo, **não uma garantia contra prompt injection**. Um LLM pequeno ainda pode interpretar dados incorretamente; não há sandbox semântica aplicada às respostas.

Falha na lista, import do módulo ou consulta não impede conversar: o texto original segue para o fluxo existente. Uma falha de consulta não dispara busca legada adicional nem nova inferência para decidir. Se uma consulta parcial retornar dados válidos, eles podem ser usados sem a parte que falhou. Erros brutos não entram no prompt ou no DBG.

## Indicador e DBG

“Memória consultada” aparece por 2,3 segundos somente após ao menos uma chamada real de busca concluir com sucesso, mesmo que não encontre trechos pertinentes. Não significa “o modelo usou a fonte”. Não aparece em fast path, sem documentos ou quando todas as tentativas falham.

O indicador reutiliza `memory-toast` e seu ícone gráfico existente. Não há emoji, biblioteca visual nova, aba, botão, mudança de navegação ou texto adicional gravado na conversa. O conteúdo normal produzido pelo LLM, inclusive possíveis emojis conversacionais, não é filtrado.

DBG mostra decisões medidas e razões enumeradas, contagem de solicitações com/sem busca, chamadas reais, candidatos retornados, trechos selecionados e caracteres das referências. Seleção para contexto não comprova uso pelo modelo. Mantêm-se as frequências e a privacidade do painel; não há novo polling.

## Limitações e validação

As regras não entendem intenção de forma universal: podem deixar de consultar em um caso útil ou consultar numa pergunta cotidiana não reconhecida. Para casos ambíguos, o usuário pode pedir explicitamente consulta ao Segundo Cérebro/documento e mencionar assunto ou palavra-chave, ou pedir para não consultar. Não se fez uma classificação extra pelo Qwen para corrigir essa incerteza.

A busca atual continua lexical e ainda varre chunks quando realmente chamada; não foi criado índice novo. Abreviações, nomes curtos/símbolos de linguagens e palavras com variações semânticas continuam sujeitos aos limites do tokenizador existente. A filtragem de relevância pode omitir trechos úteis. Dois chunks não bastam para sínteses de uma biblioteca inteira.

O orçamento usa caracteres e não tokens reais, pois o binding atual não expõe tokenizer/uso de contexto ao app. Histórico, anexos ou memórias anteriores muito grandes ainda podem exercer pressão sobre o contexto fora do RAG; não foram truncados/refatorados nesta etapa. Também não se promete aumento mensurado de velocidade: custo de geração e dispositivo continuam relevantes.

Executadas apenas verificações pontuais fora do repositório: fast paths sem chamadas/leitura de catálogo, passagem do caso Projeto Aurora com `GIRASSOL-4827`, inclusive apresentação pessoal seguida de pergunta factual na mesma mensagem, filtro de um trecho não relacionado, orçamento, pedido para não consultar, prioridade de anexo, falha de busca e eventos sem conteúdo. A verificação do Aurora usou uma fonte controlada no coordenador, não um aparelho ou o IndexedDB real do usuário. Não foram adicionados testes ao projeto nem executados benchmarks/suítes extensas.

Pendente no Android: confirmar o caso Aurora no banco existente; saudações sem busca; consultas explícitas com/sem resultados; preferência de nome/idioma sem RAG; continuação recente; anexos; limites de contexto; importação/exclusão/pausa invalidando o catálogo; comportamento consultado sob demanda; DBG e indicador; conversa em caso de falha; regressão do fluxo TXT. A compilação de entrega, quando executada, é informada separadamente no relatório final. Não houve teste no dispositivo.
