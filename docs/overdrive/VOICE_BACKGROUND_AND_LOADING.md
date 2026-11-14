# Carregamento e voz — alterações sem compilação

Base `26d3faa`, branch `feature/android-overdrive`, checkpoint `checkpoint/overdrive-before-background-voice-26d3faa`. Solicitação de 14/11/2026: **não compilar nem iniciar workflows**. Não foi alterado o versionCode/package, nem gerado APK. Commits desta entrega usam `[skip ci]` e não contêm `[build approved]`.

## Carregamento do GGUF

Novo cartão no chat com animação leve, dicas curtas, nome do modelo, fase e tempo decorrido. As fases vêm do backend: inicialização, carregamento do modelo (inclui criação do contexto) e preparo estático da primeira resposta quando aplicável. Usa `<progress>` indeterminado: não há porcentagem/ETA simulados. O rascunho e as mensagens não são substituídos nem persistidos como parte do cartão. Respeita movimento reduzido e temas; atualização de 1 s somente enquanto carrega e está visível, removida ao concluir. O estado é lido de campos Kotlin, sem inspecionar o contexto nativo em mutação.

A restauração já começa no executor em `onCreate` e reutiliza um GGUF ainda ativo no processo. O cabeçalho GGUF é lido para validação; não há hash integral a cada abertura. O llama.cpp mantém seu padrão mmap, CPU e otimizações existentes. O aquecimento SmolLM3 pode processar até 512 tokens antes de liberar o chat: retirá-lo anteciparia o estado pronto, mas cobraria esse trabalho na primeira mensagem. Foi preservado. Não se alterou sampler, threads, contexto, Flash Attention, runtime, cache híbrido ou prompt. **Não há ganho de velocidade física medido ou declarado**; as fases permitem identificar o custo na próxima validação autorizada.

## Downloads de reconhecimento e voz

- `SpeechRuntime` mantém um SttManager/TtsManager por processo, com applicationContext e listeners removíveis. As pontes deixam de destruir a instalação ao fechar/recriar a Activity. Continua usando instaladores, checksums, verificações de espaço, seleção, manifestos e arquivos privados existentes.
- `SpeechDownloadService` é um foreground service `dataSync`, iniciado apenas por download/importação solicitado pelo usuário. A notificação acompanha as fases, permite cancelar os downloads e abre a seção de voz correta. Há aviso de conclusão/falha e encerramento quando não existem trabalhos. Não inicia modelos nem inferência ao instalar.
- STT/TTS podem ter instalações independentes; o cancelamento do item no app afeta apenas aquele motor. A ação da notificação cancela todos os downloads de voz. A instalação permanece ocupada até liberar seu registro no serviço, protegendo a próxima solicitação. Cancelamentos anteriores ao início do worker não são apagados.
- Saída para outro app e fechamento do painel não cancelam arquivos. O cancelamento agora é uma ação explícita. Serviço e managers não dependem de callbacks JavaScript para concluir a instalação. O serviço respeita o timeout do Android e não usa reinício sticky, boot receiver ou novas dependências.
- Supertonic passa a mostrar bytes comprimidos realmente lidos na extração e permite cancelar também ao atravessar entradas ignoradas do TAR. Validação/finalização continuam separadas; SHA-256 e proteções de caminho/links/tamanho permanecem. Publicações de progresso são limitadas a aproximadamente 5 Hz.
- Painéis de voz não modais, botão X/Escape e navegação livres, ação primária visível inclusive em paisagem, importação em seção recolhível e indicador compacto de downloads. Fechar não significa cancelar. A interface inicial de download/importação de GGUF (`model-library.js`, catálogo e onboarding) não foi redesenhada.

## Chamada ao alternar aplicativos

A chamada já utilizava foreground service de microfone/mediaPlayback e wake lock com limite de uma hora. Foram corrigidos: TTS que parava indiscriminadamente em `visibilitychange`; verificação de Activity visível em cada novo turno, mesmo com serviço ativo; e janela entre solicitar o serviço e ele publicar `running`. O próximo turno de uma chamada oculta não depende do timer da WebView. Encerrar pela notificação/serviço continua parando microfone, áudio e resposta. Orbe não anima com a página oculta.

O serviço precisa ser iniciado explicitamente com a Haruna visível e permissões concedidas. Trocar para Chrome/WhatsApp deve manter uma chamada ativa; tomar o microfone/foco de áudio em outro app pode pausá-la. Encerrar a Activity/tarefa encerra a chamada: não foi reescrito o orquestrador do chat em um segundo motor nativo. Políticas de bateria/memória, encerramento forçado e restrições de segundo plano do Android continuam aplicáveis. Downloads não têm retomada persistente após force-stop/reboot; o instalador limpa temporários e preserva instalações válidas.

## Verificações locais

- `tests/background_voice_ui_check.cjs`: 360×800, 800×1280 e 800×360 (inclui tema claro), fases/tempo/rascunho, progresso sem porcentagem falsa, painéis não modais, X/Escape, navegação livre, cancelamento por motor, acesso às configurações de voz e TTS oculto durante chamada.
- `tests/voice_call_exit_ui_check.cjs`: telefone/tablet em claro/escuro; mantém as verificações anteriores e cobre resposta→novo turno com `document.hidden`, encerramento por evento de serviço e descarte de resposta tardia.
- Regressões `tests/stt/installer_ui_check.cjs`, `tests/overdrive_ui_check.cjs`, intenção de imagens, segmentos de voz e integridade da interface passaram.
- Sintaxe JavaScript, XML do Manifest e `git diff --check` conferidos. Screenshots locais revisados.

As pontes de inferência/serviço são simuladas nos testes de navegador. **Nenhuma compilação Kotlin/NDK/Gradle, workflow, inferência de áudio ou teste físico foi executado nesta entrega.** APIs do serviço/permissionamento e execução Android permanecem pendentes de compilação e validação quando autorizadas. Depois: um download de voz com a Haruna minimizada e um ciclo de chamada em Chrome/WhatsApp, incluindo retorno e Encerrar da notificação. A visibilidade das notificações depende da permissão do Android. Não se promete sobrevivência a force-stop, morte do processo ou encerramento da Activity da chamada.
