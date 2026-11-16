# Windows 0.5.6 / Android 1.4.2

Fonte compilada: `8b99cf558596268264af5f8769e09019f1a850ee`.
Branch: `feature/android-overdrive`.
Checkpoint: `checkpoint/before-release-lora-anima-8493835`.

Inclui identidade compartilhada Proxys Labs, créditos/licenças offline, limpeza de comandos iniciais de imagem, LoRAs convencionais safetensors e componentes Anima. Veja [integração e limites](../IMAGE_LORA_ANIMA_INTEGRATION.md). Preserva chat, GGUF, voz, documentos, MNN/Nezumi, imagens, histórico, configurações e diretórios existentes.

## Windows — concluído

- [Workflow](https://github.com/doutor56-lab/Haruna/actions/runs/43784749887): sucesso.
- [Download do ZIP com EXE](https://github.com/doutor56-lab/Haruna/actions/runs/43784749887/artifacts/14190216155).
- Executável: `Haruna-Windows-0.5.6-x64.exe`.
- SHA-256: `13f026a449727e90d700ab428f69e52db7b853b5ed1d19886e68167f990e6f37`.
- [Relatório](https://github.com/doutor56-lab/Haruna/actions/runs/43784749887/artifacts/14189819287): commit, revisões nativas, hashes e smoke verificados.
- 33 testes Node passaram. EXE empacotado abriu no Windows x64; smoke confirmou lote 100 persistido, escalas 75–150%, transporte PCM, isolamento do processo de voz e dois ciclos VAD nativos. Não houve inferência real de imagem com Anima/LoRA no CI.
- Extrair o ZIP e abrir o EXE; dados permanecem em `%APPDATA%\Haruna Windows`.

## Android — compilado; atualização da instalação anterior bloqueada pela assinatura

- [Workflow](https://github.com/doutor56-lab/Haruna/actions/runs/43785383909): sucesso; testes unitários e assembleDebug concluídos.
- [APK ARM64](https://github.com/doutor56-lab/Haruna/actions/runs/43785383909/artifacts/14190906381).
- Arquivo: `Haruna-Overdrive-ARM64.apk`, 79.387.825 bytes.
- SHA-256: `2a0079c1c5cfb874b4c0d6e1b20da846e45b0d75522bf9fbe3b90a8cfc508e3c`.
- Certificado SHA-256: `a8e24f6060ea94c51a589fe104c1fa98adcb3e027df9d788fa2d1f05dc3f3eb1`.
- ZIP baixado e hash conferido. Assets LoRA, imagens e identidade correspondem byte a byte ao fonte atual. DEX contém `configureLoras` e `loadAnima`; ELF exporta os JNI `loadAnima`, `loadFlux`, `loadSd15` e `generatePng`. Dependências privadas da biblioteca safetensors e ausência de Vulkan no APK verificadas. Voz, MNN/Nezumi, visão e OCR continuam incluídos.
- Certificado diferente do APK 1.4.1: este APK não atualiza aquela instalação no mesmo sandbox sem a chave original. É instalável onde não exista uma instalação conflitante; não houve instalação física nesta tarefa. Nenhum aplicativo ou dado foi removido, e o package não foi alterado para contornar a verificação do Android.
- Versão preparada: `1.4.2-overdrive`, código 21, ARM64 CPU.
- Pacote preservado: `com.proxyslabs.haruna.overdrive`; nome Haruna Overdrive.
- O workflow atual usa assinatura debug do SDK, sem chave persistente configurada. A chave privada da versão anterior não está disponível neste ambiente; a consulta de secrets pelo token da integração retornou 403, e não há chave nos fontes ou caches consultados. Não se pode reconstruir a chave privada a partir do certificado público do APK.
- A assinatura deverá ser comparada com a versão 1.4.1 (`45e285dfdf382d7eceeeb711ed3aec9135a3a6c249f3ae83ec7c9b0e536316d0`). Certificados diferentes impedem atualização no mesmo sandbox sem a chave original. Não desinstalar nem limpar dados para contornar incompatibilidade.

## Limites da validação

Compilar, inspecionar assets/símbolos e abrir a interface não demonstram geração real, qualidade, RAM ou velocidade. Validação de Anima/LoRA com pesos treinados no PC/tablet permanece pendente. Nenhum peso de Anima, LoRA ou outro modelo de imagens/LLM de conversação foi baixado ou incluído. Os assets de VAD/OCR que já integravam o aplicativo permanecem. A integração não aceita todo formato do Civitai.

O verificador legado `tests/consolidated_static_check.py` falhou na regra de tipografia para um seletor CSS já existente no código-base. Não é utilizado pelo workflow Overdrive atual; os verificadores ativos de UI, intenção, voz e orbe passaram. CSS e esse verificador não foram alterados nesta entrega para contornar o resultado.
