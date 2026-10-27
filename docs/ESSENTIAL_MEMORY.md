# Etapa 2 — primeira conversa e Memória Essencial

Base: `c537c74809057a79d5c3ca2d87561101ff64210b`, mesma branch `ui-polish-icons`.

Checkpoint anterior: `checkpoint/haruna-before-essential-memory-c537c74`.

## Arquivos

Criados em `app/src/main/assets/haruna/essential/`:

- `schema.js`: campos, enums e validação de formato.
- `store.js`: persistência local, resumo não pessoal para diagnóstico e contexto compacto.
- `capture-policy.js`: regras conservadoras de declarações explícitas. A política futura de memória aprendida fica delimitada; não há extração livre de fatos pelo LLM.
- `phrases.js`: listas locais e seleção sem repetição imediata.
- `first-contact.js`: estado leve da apresentação e decisões de resposta local.
- `ui.js` e `ui.css`: revisão opcional na página Memória e feedback discreto.

Criado este documento. Alterados somente `app.js`, `index.html`, `diagnostics/metrics.js` e `diagnostics/report.js`.

Nenhum arquivo Kotlin, dependência, prompt de sistema, configuração de GGUF, modelo, STT/TTS, Segundo Cérebro, ranking, chunks ou armazenamento anterior foi modificado. As duas linhas informativas do DBG ficam em Dispositivo e sessão, separadas da seção Segundo Cérebro.

## Armazenamento e separação

Uma chave nova do localStorage da WebView: **`haruna_essential_memory_v1`**. O objeto versionado contém:

- `essential`: `userName`, `preferredName`, `preferredLanguage`, `responseStyle`, `updatedAt`.
- `introduction`: estado, ID opaco da conversa de apresentação e últimos índices das três listas.
- `privacy`: revogações de nomes/preferências, para orientar mensagens futuras após esquecimento.

Campos desconhecidos ficam vazios. Idioma e estilo são escolhas finitas, não texto arbitrário. Não existe embedding, índice, chunk ou consulta RAG nessa memória. Não se copia ou migra silenciosamente o conteúdo de memórias antigas ou documentos.

A aplicação confirma `setItem` e a leitura de retorno antes de atualizar o estado em RAM ou anunciar um salvamento. Falha de armazenamento não vira promessa de memória salva. Formato incompatível/corrompido falha de modo conservador e não é sobrescrito automaticamente; a revisão mostra indisponibilidade e permite apagar somente essa memória mediante ação confirmada.

Persiste no mesmo armazenamento privado de dados web que o app já utiliza e independe de conversa/modelo ativo. Não há sincronização ou nova criptografia. Limpar dados, desinstalar ou uma política externa de armazenamento/backup pode afetá-la; não é promessa de backup permanente.

## Aberturas e variações

Foram adicionadas **12 aberturas**, **10 perguntas de nome** e **10 reações ao nome**. Nenhuma depende de inferência. Os textos locais estão em português brasileiro; a preferência de idioma orienta o LLM nas mensagens seguintes.

Seleção usa sorteio local, excluindo o índice imediatamente anterior da mesma lista. Os índices são persistidos. Não há centenas de frases nem aleatoriedade que substitua uma decisão contextual.

A abertura aparece uma vez numa conversa vazia, depois que o onboarding existente estiver fechado e sem interferir em um rascunho/anexo. É uma mensagem normal persistida pelas rotinas existentes, com marcador adicional da apresentação. Não inicia áudio automaticamente. Conversas antigas com mensagens não recebem inserções retroativas. Usuários existentes sem esse estado podem encontrar a apresentação na próxima conversa vazia.

Se a conversa de uma apresentação ainda incompleta for apagada, uma conversa vazia pode legitimamente recomeçar com abertura diferente. Apresentação concluída ou recusada não recomeça ao criar chat, reiniciar, trocar GGUF ou esquecer os campos.

## Conversa flexível

Uma saudação/afirmação simples recebe uma pergunta local variada. Uma negativa recebe uma resposta que aceita o desvio; não dispara automaticamente a mesma pergunta. Uma recusa é aceita sem salvar nome e encerra a apresentação.

Perguntas, tarefas e desvios não reconhecidos continuam pelo fluxo original do LLM, sem serem consumidos como resposta de cadastro. A apresentação termina conservadoramente ao mudar de assunto, sem impedir que o usuário informe um nome depois. Nunca se pergunta idioma, hobby, endereço ou profissão como sequência de entrevista.

Não existe sequência obrigatória de quatro campos. A prioridade é uma pergunta de nome no máximo; a preferência pode ser informada espontaneamente. Respostas locais e salvamentos não exigem um GGUF carregado. Perguntas gerais continuam dependentes das capacidades e do modelo já existentes.

## Captura e atualização

Captura automática considera apenas a mensagem enviada pelo usuário, nunca resposta do LLM ou texto de documento/anexo. Regras incluem declarações próprias claras como “meu nome é …”, “eu sou o …”, “me chamo …” e “pode me chamar de …”. Uma preferência de tratamento altera `preferredName`; não inventa nome civil. Um nome informado não apaga um apelido preferido já escolhido.

Nome isolado é aceito apenas como resposta imediata à pergunta de nome marcada pela aplicação, na conversa correspondente. Não se extrai qualquer nome citado: “meu professor …” e “meu irmão se chama …” não correspondem às regras. Código, citações iniciadas como tal, texto grande/multilinha, exemplos hipotéticos e formas ambíguas são descartados pela captura conservadora.

Regras automáticas limitam formato, comprimento e quantidade de palavras, recusando palavras típicas de ações, respostas e papéis. Isso pode perder nomes legítimos incomuns ou construções não previstas. A revisão opcional aceita um conjunto mais amplo de nomes/apelidos curtos, inclusive alguns alfanuméricos. Não é um reconhecedor universal de identidade.

Idioma só é salvo se explicitamente declarado como preferido. Não é inferido por escrever em português. Estilos admitidos: conciso, detalhado, passo a passo, descontraído e formal. Pedidos limitados a “agora”, “hoje” ou “nesta resposta” não viram preferência global por essas regras. Não há campos de senha, token, saúde, finanças, intimidade ou documentos, nem captura automática de fatos livres.

Não se altera o sistema anterior de memórias explícitas da conversa; sua lógica e seu conteúdo continuam como estavam. A restrição conservadora descrita aqui aplica-se à nova Memória Essencial.

## Contexto do LLM

`withEssentialContext` acrescenta um prefixo de **no máximo 900 caracteres**, após a recuperação original e antes de montar as mensagens de inferência. A pergunta original continua sendo a entrada da busca; ranking e documentos não mudam. O histórico e a mensagem visual permanecem originais, sem gravar o prefixo como mensagem do usuário.

O resumo inclui somente campos preenchidos e orientações curtas úteis, sem `updatedAt`, IDs, índices ou valores vazios. Nome preferido e mudanças recentes prevalecem sobre preferências antigas. O limite de histórico existente contabiliza o comprimento final do prompt normalmente.

Não se chama `setSystemPrompt` novamente, nem se reinicia ou descarrega o modelo. Isso evita tocar no binding que só aceita o prompt de sistema logo após carregar.

## Feedback, revisão e esquecimento

O indicador com ícone próprio e texto **“Haruna lembrou disso”** aparece por 2,3 segundos somente após mudança real de campo persistida. Abrir uma conversa, trocar frase, repetir o mesmo dado ou recusar não dispara esse feedback. O indicador é independente dos avisos antigos e não acrescenta mensagem artificial ao histórico.

Uma pequena seção aditiva na página Memória permite revisar os quatro campos, salvar e esquecer os dados. É opcional e não aparece como cadastro inicial. A exclusão exige confirmação e só afeta a chave nova.

Comandos explícitos de escopo estreito também são suportados: esquecer o próprio nome, as preferências ou a Memória Essencial. Eles não apagam histórico, documentos, chunks, modelos ou memórias anteriores. O contexto futuro recebe orientação de revogação; dados já presentes no histórico/contexto nativo não são apagados por esse comando. Não é garantia de que o LLM jamais repetirá algo que já leu.

## Diagnóstico e limitações

DBG recebe só `available`, `active` e contagem de campos definidos. Nenhum nome, idioma ou estilo pessoal é incluído no relatório. Contadores de gerações do DBG continuam contando somente o runtime LLM; mensagens locais da apresentação não são contadas como inferência.

Limitações: regras não cobrem toda ambiguidade linguística; algumas formas/nicknames exigem revisão manual; um modelo de 0,5B pode ignorar o contexto, repetir perguntas ou confundir referências apesar das regras. A aplicação controla a persistência, não garante a coerência de toda saída do LLM. Não há treinamento de pesos, LoRA, memória aprendida geral nem exclusão retroativa do histórico. Essas funcionalidades não foram simuladas.

## Conferência

Executadas somente verificações pequenas fora do repositório: sintaxe JavaScript e casos de captura, terceiros, recusa, preferência temporária, mudança de nome, falha de armazenamento, não repetição e inclusão de contexto. Não foram adicionados testes ao projeto ou executados benchmarks/suítes extensas.

Não foi gerado APK nem validado em dispositivo nesta etapa. Verificação manual: onboarding → abertura; saudação → pergunta; nome na primeira resposta sem nova pergunta; negativa/recusa/desvio; persistência ao reabrir/trocar chat/GGUF; captura com anexo sem impedir sua análise; revisão e esquecimento; contexto com nome atualizado; estilo/idioma global versus pedido temporário; toast apenas após salvar; DBG sem valores pessoais; uso em aparelho com pouco armazenamento e nomes longos/incomuns.
