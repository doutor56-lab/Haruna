# Correção pontual: pedido de imagem após a decisão do LLM

Base: `3405e0eec75992117b0ddabc92ebf0ee6cfab6b0`.

O Windows envia o evento final do classificador antes do próximo snapshot ocioso. A continuação da Promise pode iniciar a imagem entre essas entregas. O preload consultava `cache.llm.state === 'generating'` e recusava localmente o pedido, mesmo com o classificador já concluído. O teste novo reproduziu a recusa antes da correção.

A ponte deixa a decisão sobre o dono atual do LLM para o controlador principal, que continua bloqueando requisições LLM realmente ativas, imagem, visão, manutenção e concorrência. A reserva local de imagem e o desbloqueio por snapshot permanecem intactos. Não há espera artificial, fila nem paralelismo novo.

Se uma imagem for recusada, o cartão já persistido recebe ERROR sem lançar novamente a mesma falha para o submit. O catch genérico de submit passa a dizer falha ao enviar mensagem, pois também recebe erros anteriores à persistência. Não há alteração no armazenamento de conversas.

Verificações: teste VM do preload (evento final com cache antigo, bloqueio de imagem concorrente e recuperação após rejeição); teste do cartão/retentativa com ponte simulada; suíte existente de modelos, geração sequencial, cancelamento, liberação e restauração do GGUF; classificador estruturado; Electron Linux headless com interface real. Nenhum desses testes é inferência real de difusão. Não houve alteração em runtimes, sampler, imagem nativa, voz, estilos ou dados existentes. Necessária validação final de geração com o checkpoint no Windows do usuário.
