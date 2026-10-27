# Etapa 6 — Memória Aprendida e curadoria

## Separação e arquivos

A nova camada mantém experiências independentes de Memória Essencial, histórico, documentos/chunks do Segundo Cérebro e candidatos antigos do painel de documentos. Nenhum peso é treinado ou alterado. O GGUF não recebe API de gravação.

Novos, sob `app/src/main/assets/haruna/learned/`: `schema.js`, `privacy.js`, `capture.js`, `store.js`, `context.js`, `dataset.js`, `ui.js`, `ui.css`; este documento. Modificados: `app.js`, `index.html`, `diagnostics/metrics.js`, `diagnostics/report.js`. Nenhum código nativo, STT/TTS, banco IndexedDB, importador, busca, ranking ou roteador RAG foi modificado nesta etapa.

## Registro

Chave localStorage versionada: `haruna_learned_memory_v1`, objeto `{version:1,items:[...]}`. Uma experiência contém `id`, `type`, `summary`, `source`, `originChatId`, `scope`, `topicKey`, `context`, `example`, datas, `revision`, `occurrences`, `confidence`, `importance`, `status`, `useForContext`, flags de treinamento e aprovação com usuário/data/revisão.

Categorias: preference, fact, decision, correction, behavior, project_context. Origens previstas são user_explicit, user_inferred, assistant_generated, document e system; **somente user_explicit é coletada nesta etapa**. Confiança/importância alta/média são heurísticas de origem/utilidade, não probabilidade científica nem comprovação de veracidade.

Estados: observed, useful, training_candidate, approved, rejected, superseded. `useForContext` é separado de aprovação para treinamento. Uma captura começa observed, fora do contexto e não aprovada. Manter habilita referência relevante. Candidatar não aprova; Aprovar requer ação explícita e exemplo revisado elegível. Rejeitar limpa aprovação e uso de contexto; reaprovar remove rejeição. As duas flags nunca permanecem verdadeiras simultaneamente. Editar revoga aprovação anterior e incrementa revisão, exigindo nova aprovação. Aprovar apenas para dataset não habilita contexto nem substitui por si só uma memória atual.

Persistência só é confirmada após escrita/leitura de verificação; estado em RAM muda depois. Formato incompatível/corrompido fica indisponível sem sobrescrever o original. Falhas de quota não derrubam a conversa; a área de revisão informa erro. Limites: 300 itens e 1.000.000 de unidades UTF-16 no JSON. Nada é removido automaticamente ao atingir o limite; exclua experiências pela revisão para liberar espaço. Não é uma base ilimitada nem backup externo. Desinstalação/limpeza dos dados remove o armazenamento local, conforme a arquitetura existente.

## Captura e contexto de origem

Gates baratos reconhecem declarações explícitas de preferência persistente, regras futuras, decisões/projetos e correções. Conversa social, mensagens vagas sem contexto, mensagens temporárias, exemplos/citações/código, perguntas, anexos e falas automáticas não revisadas não criam experiências. Sem inferência extra, embeddings ou busca no RAG. Não há coleta em respostas da assistente. Mensagens que pertencem à Memória Essencial continuam lá; declarações já salvas na memória livre anterior não ganham cópia pela mesma instrução explícita.

Correção curta, como “Não, é 75”, só é candidata com pergunta do usuário e resposta anterior disponíveis. Referências vagas como “desse jeito” também exigem contexto. Guardam no máximo 600 caracteres de cada lado e o resumo da declaração; não se tornam “75 é verdade universal”. A resposta anterior é evidência do ocorrido, **não uma resposta validada para treinamento**. Nenhuma resposta desejada é inventada ou copiada automaticamente do LLM. A edição permite construir entrada/resposta desejada independentes e completas.

Escopo padrão: conversa de origem; projetos explicitamente nomeados ganham escopo de projeto. Na revisão, é possível manter o escopo ou escolher uso geral. Não há inferência semântica de qual projeto está ativo. Uma referência de projeto em outro chat exige nome explícito na mensagem atual.

## Duplicatas e conflitos

Resumo normalizado + tipo + escopo deduplicam; correções incluem também a pergunta de origem. Repetições reforçam contagem/data, sem reaprovar rejeitados. Não há deduplicação semântica pesada.

Antes de ativar uma experiência, chaves claras (regra “Quando X, use sempre Y” ou arquitetura de projeto nomeado) permitem marcar a versão anterior do mesmo escopo como superseded. A revisão também oferece substituição explícita de qualquer item anterior. Histórico permanece visível; substituídos saem do contexto e do dataset. Não há detector universal de contradições: declarações reformuladas, temas ambíguos e conflitos com memórias legadas precisam de revisão humana. Preferências fundamentais continuam sob responsabilidade da Memória Essencial.

## Recuperação leve

Somente itens mantidos explicitamente, com origem de usuário e escopo compatível, podem entrar como referência. Correspondência lexical exige dois termos relevantes; mensagem social/curta e anexos preservam caminho leve. No máximo duas experiências completas, com envelope JSON total de até 900 caracteres. Nenhuma experiência é cortada para caber; contexto de correção longo pode ficar fora. Essa seleção não usa `knowledge.search`, não indexa experiências como documentos e não altera FAST PATH/RAG. O tamanho é reservado como contexto local antes da recuperação opcional existente. Dados são rotulados como referência/escopo limitado, nunca system prompt nem verdade universal. Isso não garante imunidade a prompt injection.

## Curadoria e exportação

Área discreta na página Memória: contagem, filtro de estado, dez itens por página e revisão por dialog com os componentes/cores existentes. Permite editar resumo/tipo/escopo, ver contexto de origem, preencher exemplo, manter, candidatar, aprovar, descartar, substituir e excluir. Excluir afeta somente a experiência, preservando chat, perfil, documentos e chunks. Sem nova aba, biblioteca de ícones ou emoji de interface.

`dataset()`/`exportApproved()` produzem `haruna-reviewed-dialogues-v1` com instruction/input/output/metadata somente de exemplos explicitamente aprovados na revisão vigente. O botão Copiar aprovadas (JSON) exporta esse resultado para a área de transferência por ação do usuário; não lê/exporta todo histórico, documentos ou itens rejeitados/obsoletos. Sem saída desejada revisada, nada é aprovado/exportado. Fatos e contexto de projeto ficam excluídos por padrão; exemplos de comportamento, preferência e correção são elegíveis. Entradas obviamente sem contexto e duplicatas exatas são excluídas. Não há treinamento, job, LoRA, conexão com servidores ou alteração de pesos.

## Privacidade e voz

Padrões conservadores barram captura e exportação de nomes de perfil conhecidos, credenciais, CPF/identificadores, e-mails, números longos, finanças, saúde e conteúdo íntimo evidente. A origem assistant_generated nunca é aprovada pelo caminho implementado. Aprovação exige confirmação de revisão e retirada de dados pessoais. **O detector não encontra todo dado sensível**; não substitui inspeção do usuário. A memória é local e usa a proteção do aplicativo/Android existente, sem criptografia nova específica. A área de transferência fica sob controle do Android após cópia solicitada.

Ditado revisado e enviado manualmente segue as mesmas validações do teclado. Chamada automática continua marcada não revisada e não gera experiências, conforme a etapa 5. Não houve alteração do STT nesta etapa.

## Diagnóstico, custo e limites

DBG recebe somente contagens: armazenadas, em avaliação, candidatas, aprovadas, rejeitadas, substituídas. Sem resumos, nomes, IDs de conversa, exemplos ou conteúdo pessoal. Não há timer/polling novo. Captura negativa retorna antes de gravar/varrer experiências. Revisão é paginada; contexto percorre no máximo 300 registros e só seleciona referências pequenas. Estado local ocupa até o limite definido, mais cópias temporárias durante escrita/edição; isso é um teto estrutural, não RAM medida no aparelho. Nenhuma segunda inferência ou benchmark foi executado.

Verificações focadas fora do repositório cobriram gates sociais/essenciais/sensíveis/voz, deduplicação, escopo, aprovação explícita, rejeitar/reaprovar, reinício simulado, revogação por edição, substituição, correção com contexto e falha de persistência. Sintaxe JS verificada. Compilação Android será feita no pacote final. Pendências manuais: renderização/rolagem no tablet, fluxo completo de revisão/cópia, reinício real, seleção de referências pelo GGUF e coexistência com dados anteriores. A classificação e a recuperação são heurísticas em português; outras formulações podem não ser capturadas. Qualidade factual do modelo pequeno e conflitos semânticos continuam limitados.
