# Integração Nezumi SD1.5 — branch experimental

Base: `feature/nezumi-model-compat` @ `530f11809c981e229c53a1e1406972969533dc94`.
Nenhuma branch estável foi modificada, nenhum merge foi realizado.

## Origem e compatibilidade

Motor `mouse0329/nezumi-ai/mnn-sd-engine` fixado em
`e23719bdf4d74e7ad3cbc5bca467e3f7136eb95b`. Licença raiz LGPL v3;
README com intenção MIT não constitui licença alternativa concedida.
Fontes, avisos e GPL/LGPL completos acompanham o artefato técnico; avisos
ficam também no APK. Modelos têm licenças próprias e não são incorporados.
Veja `app/src/main/cpp/image/nezumi/HARUNA_CHANGES.md` para modificações,
licenciamento e reconstrução/substituição da biblioteca compartilhada.

MNN da Haruna permanece `c95758f4cd4cc4891a89833842dbd681109d3303`.
Nezumi usava `5f44d96c6199c647dbc5b130861a6f5f5f6e370c`; APIs utilizadas
compilaram contra a versão Haruna. A compatibilidade foi exercitada com
modelo real no host, separadamente da validação Android.
Nenhuma alteração em llama.cpp/GGML, GGUF, voz, memória ou histórico.

## Formatos e instalação

ZIP Nezumi SD1.5 com CLIP embedding-input, UNet, VAE decoder e respectivos
`.weight`, `tokenizer.json`, `token_emb.bin`, `pos_emb.bin`; `model.json`
opcional, limitado a SD1.5, dimensão 768 e resolução nativa 512. Aliases
como `clip_v2.mnn`, `unet_asym_block32.mnn` e `vae_decoder_fp16.mnn`
são aceitos. Sem SDXL, GGUF de imagem, safetensors ou conversão implícita.
Pacotes Haruna antigos com manifesto/tokenizer.mtok continuam suportados.

A cópia do ZIP é feita uma vez para staging privado. Verificamos diretório
central/ZIP64, duplicatas, caminhos, symlinks, métodos/criptografia, limites,
CRC de extração, componentes, JSON/embeddings e FlatBuffers sem sessões.
Manifesto SHA-256 por arquivo é persistido; restore/load verifica integridade.
Rename atômico só após validação. Cancelamento/falha limpa staging; namespaces
de staging por processo evitam que recriação de tela apague importação viva.
Instalação não exige RAM de inferência. Requer espaço para ZIP + arquivos
extraídos e margem de 128 MiB. Limite total extraído/ZIP: 8 GiB cada.
CRC/SHA locais detectam corrupção; não autenticam pacotes desconhecidos.
Nomes Anything/CyberRealistic só são atribuídos por SHA oficial conhecido.

Pacotes de referência, verificados por tamanho/SHA-256 antes do teste:
- `Mouserat/Anything-V5-mnn` @ e0291287c2920c6ecc6f95d68f65b20b29ad1b87:
  `Anything-V5-mnn-int8-block32.zip`, 1179971957 bytes,
  SHA256 `99e70f3fb7a33276adec354bf466bfa8b4aa8e6f4131c86a9c17cc1c1e0a1042`.
- `Mouserat/CyberRealistic-mnn` @ a17d80a5a7598d3a5834d5b80dc5fd73ae0580cb:
  `CyberRealistic-mnn-int8-block32.zip`, 1179677172 bytes,
  SHA256 `3fcd7c1bbc2a452a3f52fcae8edd54f3c212836cb8f1189ce422f8e9899bfa5a`.
URLs: https://huggingface.co/Mouserat/Anything-V5-mnn e
https://huggingface.co/Mouserat/CyberRealistic-mnn. Pesos não vão no APK.

## Execução real e ownership

`libharuna_nezumi_image.so` é o adaptador JNI; liga dinamicamente a
`libharuna_nezumi_engine.so` LGPL, substituível. MNN está privado e com símbolos
ocultos; motor Haruna antigo permanece intacto. Só um modelo de imagens ativo
por lease compartilhado com LLM; GGUF é descarregado e confirmado antes do
carregamento de imagem. Recursos liberados após resultado, erro e cancelamento.

Handles numéricos monotônicos + shared_ptr protegem callbacks/cancelamentos
antigos. Operações pesadas serializadas, fora da UI; flag atômica de cancelamento
é reconhecida nas fronteiras de estágio/execução/steps. Não interrompe um kernel
MNN em andamento. RGB nativo tem RAII/free exatamente uma vez. Falhas runSession
não viram imagem bem-sucedida. Mensagens brutas, caminhos e tokens do motor não
são publicados em logs da integração. Estado/progresso não carregam contexto.

Load prepara config/tokenizer/embeddings (JIT); sessões reais CLIP→UNet→VAE
são criadas e liberadas sequencialmente na geração, não simultaneamente.
CPU-only, quatro threads, Precision_Low/Memory_Low do Nezumi. Nenhum Vulkan ou
OpenCL compilado/solicitado. DPM++ 2M, CFG 7.5, seed aleatória no app; teste host
fixou 424242. Etapas 1–50; preferência existente 5. Perfis econômico/equilibrado/
desempenho continuam para motor antigo; campo fica desativado no Nezumi porque
sua configuração CPU é própria, sem fingir aplicar perfil.

Saída nativa real 512² RGB→Bitmap→PNG; preferência 256² reduz o PNG depois,
não o custo da inferência. Cinco etapas não garantem qualidade de SD1.5 comum.
PNG/metadata privados, associação ao chat e salvar/compartilhar usam fluxo
existente. Pré-checagem exige pelo menos 3 GiB disponíveis e !lowMemory após
unload GGUF; não impede LMK/OOM do Android. Nenhuma chamada artificial a GC.

## Testes executados e limites

- Host C++: core real compilado com MNN Haruna; sem runtime alternativo.
- Host JNI real: validação FlatBuffer, load CPU, cancelamento pré-geração,
  destroy idempotente, handle antigo sem afetar novo, unload confirmados.
- Anything V5 real, CPU Linux x86-64: 512², 5 steps, DPM++ 2M, CFG 7.5,
  seed 424242, prompt público de maçã. Retorno 0, RGB 786432 bytes, PNG válido;
  311,27 s, pico RSS 2726372 KiB. Não são métricas do tablet.
- JUnit: testes legados de pacote/formato e novos de staging atômico,
  corrupção, caminho inseguro, symlink, arquitetura inválida, cancelamento,
  falta de espaço e validação nativa recusada.
- Controller com Android/motores fake: lease GGUF, persistência, unload,
  cancelamento, geração após cancelamento e cleanup. Fake não prova inferência.

Build Android ARM64 e evidência final são registrados no relatório de entrega.
Sem dispositivo Android conectado: geração/microfone/chat físico, picos de RAM,
LMK, cancelamento em UNet/VAE, galeria/permissões e desempenho do tablet exigem
validação no dispositivo. Reconhecimento de ZIP/build não prova geração Android.

## Teste curto no tablet

Instale o APK experimental, importe ZIP oficial sem descompactar, selecione
modelo em Configurações > Geração de imagens. Confirmar instalado sem inferência.
Carregar, depois gerar pelo botão existente no chat com uma descrição simples.
Acompanhar steps reais, aguardar PNG; abrir, salvar e compartilhar. Cancelar uma
segunda geração e iniciar outra. Reabrir app para confirmar seleção/integração.
Ao voltar ao texto, carregar GGUF pelo fluxo existente: não há reload automático
nem exclusão de chats/modelos. Reportar erro técnico numérico e estado/progresso;
não enviar prompts privados. Sem promessa de velocidade ou estabilidade absoluta.
