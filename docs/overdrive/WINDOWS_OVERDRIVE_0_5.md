# Windows 0.5.0 — configurações Overdrive

Base: `feature/android-overdrive`, `76e8fa7`. Checkpoint: `checkpoint/windows-before-overdrive-76e8fa7`.
Somente Windows; nenhuma alteração no aplicativo Android, dados existentes ou gitlink do llama.cpp.

## Implementação

- Reutiliza o formulário recolhível Android em **Modelos locais → Modelos → Inferência avançada · por modelo**, com ponte IPC Windows real. Mantém a escala nativa e o layout existentes.
- Preferências validadas por ID do GGUF, no `desktop-models.json` existente: temperatura, top-k/p, min-p, repetição, presença/frequência, seed, limite de saída, threads, contexto, batch, microbatch e Flash Attention. Nenhuma migração destrutiva.
- Perfil SmolLM3 igual ao Android: temperatura 0,6, top-k 40, top-p 0,95, min-p 0,05, repetição 1, penalidades 0, seed aleatória, saída máxima 1024, contexto 8192, batch/microbatch 512, FA off. Threads automáticas: todos os processadores permitidos até 4; acima disso, 80% arredondado para baixo, limitado a 16. Valores explícitos prevalecem. Os demais modelos mantêm o fallback Windows 2/6, limitado aos processadores permitidos, com FA auto. Não copia flags ARM para um executável x64.
- Sampling muda na próxima solicitação sem destruir o cache. Alterações de contexto/threads/FA provocam recarga exclusiva antes da próxima geração, sob o mesmo ticket cancelável; mensagens permanecem intactas. Limites específicos de tarefas internas, como classificar intenção em até 64 tokens, continuam respeitados.
- Jinja explicitamente habilitado, template do GGUF, histórico e thinking continuam enviados ao servidor existente. K/V permanecem f16/f16. Runtimes CPU/Vulkan, imagens, voz, documentos e assinatura do aplicativo Windows preservados.
- Preparação estática apenas para arquitetura `smollm3` confirmada por uma leitura limitada dos metadados GGUF, reaproveitando o leitor existente. Se não for possível confirmar, a preparação é ignorada e o carregador nativo continua responsável pela compatibilidade.
- Usa `/apply-template` → `/tokenize` → `/completion` com tokens, `n_predict:0`, `cache_prompt:true`, slot 0. Até 512 tokens, excluindo 16 tokens do final; somente instruções estáticas, sem perfil pessoal, histórico ou documentos. Tempo cobrado no carregamento, com estado visual real. Não é uma resposta fria acelerada artificialmente.
- O servidor mantém a sequência viva e compara os tokens antes do reaproveitamento. Não foi implementado snapshot KV-only, rollback híbrido próprio ou segundo motor. Diferentemente do Android, **não há snapshot estático independente para restaurar após descarregar o processo**: recarregar o GGUF prepara novamente o prefixo.
- Métricas vêm de `usage` e `timings` do SSE; o tempo até o primeiro texto começa antes do HTTP, incluindo prefill. Não é apresentado como TTFT JNI. Configuração solicitada/salva, configuração enviada ao processo e contexto confirmado por `/props` são distintos. FA efetiva permanece não confirmada se o runtime não a expuser. Não inventa RAM de buffers ou medições de pools CPU.

## Runtime auditado

Mantido `llama.cpp b12130`, commit `7e42b95f231e508a001b6006fa73abbbbc1da3c2`, sem atualização/downgrade. APIs e flags verificadas no código/README dessa revisão: `--jinja`, `--flash-attn`, batch/ubatch, `/props`, `/apply-template`, `/tokenize`, `/completion`, cache_prompt, slot e SSE de chat com usage/timings. A revisão suporta explicitamente `n_predict=0` para avaliar o prompt sem gerar saída.

## Verificação local

- `npm run prepare:ui`, sintaxe JS e `git diff --check`.
- 22 testes Node passaram, incluindo persistência, validação, seleção por modelo, flags enviadas, recarga, preparação de prefixo, sampling, preservação do limite do classificador, SSE e exclusividade com geração de imagens. Testes HTTP/processos simulados são identificados como tais.
- Electron real Linux/headless: interface inicializada, controles avançados presentes, painel de imagens e persistência, quatro escalas 75/100/125/150 sem comprimir a viewport; nenhum GGUF de usuário carregado nesse smoke.
- **Inferência real**, servidor Linux oficial b12130 com SHA-256 verificado (`cbfc3eee898336e77b6ef68996b78b36f7e04ad09069f298ab0293e5eab81b7e`), usando o minúsculo modelo **aleatório** de `tests/native/make_smollm3_fixture.py`. Preparação de 449 tokens; primeira solicitação de 491 tokens avaliou 42 e reutilizou 449; repetição avaliou 1 e reutilizou 490. Controle frio avaliou os 491 com cache zero. Saída greedy idêntica entre frio e cache.
- Esse modelo sintético comprova o mecanismo, **não qualidade nem velocidade no SmolLM3 3B real ou no PC do usuário**. Não extrapolar seus tempos/tokens por segundo.

Reprodução do teste nativo (numpy e dependências de gguf-py disponíveis):

```sh
python3 tests/native/make_smollm3_fixture.py /tmp/smol-random.gguf
node desktop/test/native-inference.cjs /caminho/llama-server /tmp/smol-random.gguf
```

## Entrega

Build Windows e hash: pendentes da compilação desta revisão. A validação de velocidade e estabilidade com o GGUF real depende do computador do usuário. Vulkan continua opcional e depende do driver; não foi medido neste ambiente.
