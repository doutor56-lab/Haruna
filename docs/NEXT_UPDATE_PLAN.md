# Haruna — próxima atualização

Esta branch inicia a reorganização da Haruna para separar conversa, configuração técnica e conhecimento local.

## Escopo acordado

### 1. Configurações próprias
- Retirar o gerenciamento direto de modelos do topo do chat.
- Criar uma área própria de Configurações.
- Centralizar Modelos locais, Conhecimentos e Armazenamento.

### 2. Modelos locais
- Manter múltiplos GGUF instalados, com apenas um ativo por vez.
- O primeiro modelo instalado continua sendo o principal.
- Permitir trocar, definir principal e excluir modelos nas Configurações.
- Adicionar feedback de importação: selecionando, copiando/importando, preparando e concluído.
- Usar progresso determinado (barra/porcentagem) quando a cópia fornecer total conhecido e spinner quando não fornecer.
- Bloquear uma segunda importação enquanto houver uma em andamento.

### 3. Primeira inicialização
- Criar onboarding para dispositivo sem modelo instalado.
- Oferecer baixar/instalar um modelo recomendado, importar GGUF próprio ou pular por enquanto.
- Esconder detalhes técnicos atrás de uma visualização de detalhes quando possível.

### 4. Alimentar IA / Conhecimentos
- Criar uma área para importar TXT inicialmente.
- O arquivo deve ser lido de verdade, não apenas copiado para attachments/.
- Dividir conteúdo grande em trechos e manter índice/base local persistente.
- Recuperar somente trechos relevantes para compor o contexto do LLM.
- Listar conhecimentos com nome, tamanho, data e estado ativo/inativo.
- Permitir desativar e excluir um conhecimento.
- A base de conhecimento deve ser independente do GGUF ativo.
- Preparar distinção entre Conhecimento e Comportamento/Conversação.

### 5. Anexos do chat
- Fazer TXT anexado ficar disponível para consulta pelo LLM.
- Evitar inserir arquivos enormes integralmente no contexto do modelo.
- Reutilizar o mecanismo local de chunking/recuperação da área Alimentar IA.

### 6. Chat
- Manter a tela principal focada em conversa e anexos.
- Estado da IA pode permanecer visível, mas gerenciamento técnico deve ficar nas Configurações.

## Estado atual identificado

- `index.html` contém o modal `#modelSettings` e o botão `#model` diretamente no cabeçalho.
- `model-library.js` gerencia o modal, seleção de GGUF e anexos.
- `MainActivity.kt` copia GGUF/attachments em threads de background, mas não publica progresso da cópia.
- `LocalLibrary.kt` já possui diretórios privados separados para `models`, `attachments` e `documents`.
- `app.js` recebe o evento de anexo, porém hoje apenas informa que o arquivo foi salvo; o conteúdo ainda não entra no contexto do LLM.

## Ordem de implementação

1. Infraestrutura de progresso de importação no bridge/library.
2. Tela própria de Configurações e migração do gerenciamento de modelos.
3. Onboarding sem modelo.
4. Base local de Conhecimentos TXT + chunking e recuperação.
5. Integração de anexos TXT com a mesma base de recuperação.
6. Refinos de interface e armazenamento.

A implementação deve preservar o princípio local/offline da Haruna e evitar carregar documentos inteiros no contexto de modelos pequenos como 0.5B.
