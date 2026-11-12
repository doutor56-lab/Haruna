# Overdrive 1.3: instalação de modelos Whisper ONNX

Base `fb99e20`, checkpoint `checkpoint/overdrive-before-stt-installer-fb99e20`, branch `feature/android-overdrive`. Versão 1.3.0-overdrive, versionCode 16.

## Causa reproduzida

A instalação do pacote oficial `sherpa-onnx-whisper-tiny.tar.bz2` falhou antes da correção com `Vocabulário Whisper multilíngue inválido`. O arquivo `tiny-tokens.txt` possui 50257 ranks, 0..50256, e termina em `= 50256`. O validador aceitava apenas símbolos Base64 com conteúdo e rejeitava essa entrada especial oficial. Por isso a instalação nunca chegava ao rename/manifest/seleção.

Os vocabulários reais Tiny, Base e Small foram conferidos: todos têm 816730 bytes e SHA-256 `b34b360dbb493e781e479794586d661700670d65564001f23024971d1f2fa126`, incluindo a mesma entrada final. A alteração aceita `=` somente no rank 50256. Mantém rejeição de ranks ausentes, duplicados, fora da faixa, outros símbolos inválidos e o vocabulário inglês de 50256 entradas. Preserva o formato anterior que contém explicitamente os tokens de português/início.

A tela também escondia todo o trabalho de descompactação em “Preparando reconhecimento…”, sem contagem. O pacote Tiny oficial contém encoder/decoder FP32 e WAVs que não são instalados, mas precisam ser atravessados na leitura sequencial do TAR. O cancelamento antes era observado somente nas fronteiras de entradas e nas leituras dos componentes selecionados.

## Correção mínima

- Corrige a entrada especial do vocabulário, sem mudar fontes de download, nomes/IDs, formatos, motor ou arquivos instalados.
- Extração passa a observar os bytes comprimidos realmente lidos, inclusive ao ignorar componentes FP32. A entrada comprimida fica disponível para cancelamento e verifica o sinal a cada refill; memória adicional é limitada ao buffer de 128 KiB.
- Mostra extração, verificação de hashes e finalização como etapas distintas; a contagem indica MB do pacote lidos ou MB de componentes verificados. Não representa velocidade/tempo estimados e não declara instalação concluída antes do commit.
- Atualizações nativas de progresso são limitadas a 5 Hz, além de troca/fim de fase; os contadores permanecem atuais. A interface identifica o modelo em instalação, mantendo visível a seleção anterior até o novo modelo estar validado.
- Seleção ocorre depois da gravação do manifest e rename. Cancelamento/falhas limpam somente temporários. Não se substitui nem remove um modelo instalado silenciosamente.
- Permanecem todas as verificações de caminho, links, componentes duplicados, tamanhos, hash e espaço. O TAR continua sendo percorrido até o fim das entradas: não se ignora uma entrada perigosa no final para economizar tempo.

Não há mudança em GGUF/llama.cpp, MNN/Nezumi, stable-diffusion.cpp, TTS, perfil de inferência, histórico, memória ou preferências. Whisper CPP/Q5_1 não usa esse vocabulário externo e não foi alterado. A instalação continua independente da disponibilidade de RAM para executar o modelo. Nenhuma inferência é iniciada ao instalar.

## Verificações executadas

- Antes: instalação real do Tiny oficial falhou no validador. Depois: download/install/seleção completaram; 103609903 bytes de componentes reais, hashes conferidos e instalação reconhecida por nova instância do gerenciador.
- O teste usa as bibliotecas Apache efetivas do aplicativo e o pacote oficial real. Substitui somente Context/SharedPreferences/URI e transporte HTTPS do host, roteando o download para os mesmos bytes locais; o SHA-256 oficial do arquivo é exigido. Não faz inferência nem mede desempenho Android.
- Cancelamento enquanto o TAR ignora o encoder FP32 passou, com limpeza de temporários e preservação dos hashes da instalação anterior. Um TAR com entrada `../escape` depois dos componentes obrigatórios foi rejeitado, preservando a instalação anterior.
- JUnit adiciona casos do marcador oficial e vocabulários inválidos. Vocabulários reais Base/Small também foram conferidos, mas seus pacotes completos não foram baixados para este teste.
- UI real em 360x800 e 800x1280 com ponte de estados simulada: nome do alvo, MB reais, fases, bloqueio de ações, cancelamento e retorno ao estado final passaram.
- Testes anteriores de sessões de voz, TTS, cancelamento JNI, fila de fala, streaming e integridade da interface passaram.

Reprodução: `tests/stt/run_installer_host.sh` exige Kotlin, `INSTALLER_CLASSPATH` com os jars já usados no app e `WHISPER_TINY_ARCHIVE` apontando para o pacote oficial. Não baixa modelos. Não houve dispositivo Android conectado.

## Limitação de entrega

O problema de assinatura debug já documentado permanece: a chave privada dos APKs anteriores não está disponível. Não desinstalar nem limpar dados da instalação atual para contornar incompatibilidade de atualização. O resultado do build e o APK verificado serão registrados na entrega. Não se afirma teste físico de instalação/ativação no Samsung ou Teclast.

## APK publicado e conferido

- Código compilado: `f1ca1fba9942dd53914058659cade22f8ecb6899`.
- [GitHub Actions 43311206927](https://github.com/doutor56-lab/Haruna/actions/runs/43311206927): sucesso; `:app:testDebugUnitTest :app:assembleDebug`, `BUILD SUCCESSFUL in 22m 42s`.
- [Artefato ARM64](https://github.com/doutor56-lab/Haruna/actions/runs/43311206927/artifacts/13988580357), retenção até 19/11/2026. ZIP contém `Haruna-Overdrive-ARM64.apk` e `SHA256SUMS.txt`.
- APK: 79324968 bytes; SHA-256 `81a0e79d222e76430b5b58209471f5eb65876ca5fdbbfe08c98b7d4a0bd70148`. Download conferido contra o manifesto de hashes. Bibliotecas do APK exclusivamente `arm64-v8a`; workflow confirmou pacote `com.proxyslabs.haruna.overdrive` e nome Haruna Overdrive.
- Verificação do ELF STT extraído do APK passou: somente os cinco métodos JNI de sessão são exportados, sem dependência dinâmica de ggml/llama/sherpa. Isso não comprova inferência de áudio.
- Certificado SHA-256: `63f2e3877d6cd5235ab59b386dd1d5d2bdcc31be847df527b5bfaf40243bdcd1`, diferente do APK 1.2 (`be1310d2d90ecc1ecd3a11ea22db600becbea5c9f88048db535833fb23d1ec8f`). Portanto este APK **não atualiza a instalação anterior preservando seu sandbox**: é necessário o dono fornecer a chave de assinatura anterior para uma atualização compatível. Não foi mudado o applicationId para contornar a assinatura, nem removidos dados locais.

No aparelho, a validação pendente é concluir a instalação de um pacote ONNX e ativá-lo/transcrever. A tela deve apresentar extração com bytes, verificação e finalização. Base/Small compartilham o vocabulário corrigido, mas não se declara instalação completa ou execução desses modelos em dispositivo real.
