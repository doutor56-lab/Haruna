# SD1.5 safetensors — implementação experimental Android ARM64

Branch exclusiva `feature/safetensors-sd15`, base/checkpoint recuperável
`2497e3c41f9f7f7a4056123eac16ed6fd5c20acf`. Sem merge ou mudança da estável.

## Motor/API e build

Continua o scaffold existente. stable-diffusion.cpp fixado no mesmo commit
`f5df5f8b84f139f1e80496902da90798a0d92896`, MIT. Seu GGML é o fork obrigatório
`leejet/ggml` @ `135ce1e0e3f2b0693d3de93d4f6b5fa0a1947820`, MIT.
Tarballs com SHA-256 conferido no CMake, sem checkout de latest/submódulos extras.
APIs verificadas no header/código desta revisão: `sd_ctx_params_init`,
`new_sd_ctx`, `sd_get_model_version_name`, `generate_image(ctx,params,&result)`,
`free_sd_image_generation_result`, `sd_cancel_generation(...,SD_CANCEL_ALL)`.
Resultado contém items/count/image e deve ser liberado no mesmo motor.

Problemas corrigidos na integração:
- Projeto STT já define `ggml`. Adicionar SD como subdiretório reutilizaria o
  GGML errado (o SD precisa inclusive de GGML_MAX_NAME=160). Compilação isolada
  pelo task Gradle `buildSafetensorsNative`, antes de preBuild; nenhuma mudança
  nos runtimes/pins/builds de GGUF, Whisper, MNN ou Nezumi.
- Biblioteca única `libharuna_sd_safetensors.so`, dependências estáticas privadas,
  version-script JNI e -Bsymbolic; CPU-only ARM64/NEON, native Release, páginas 16 KiB.
- Cancelamento antigo acessava ctx atômico sem proteger seu lifetime contra free.
  Agora registry por serial + operation/contextAccess, closing e cancelled
  atômicos; retirar ponteiro sob mutex curto e liberar na worker. UI não faz free.
- UTF-16→UTF-8 real (GetStringUTFChars usa UTF-8 modificado); exceções são contidas
  no JNI com mensagens fixas. Callback de log não publica prompt/caminhos.
- Checagem nativa exige nome de versão exato `SD 1.x`, não um substring que também
  aceitava inpaint/pix2pix. Header/shapes são checagem prévia, não prova de inferência.

MNN/Nezumi anteriores e suas licenças permanecem. Novos avisos MIT/BSD/Unicode/
Unlicense acompanham assets/licenses/safetensors. Não há pesos no APK, conversão
para MNN/GGUF ou nova dependência de serviço externo. CPU 4 threads, mmap e CFG
sequencial para evitar duplicar o batch na RAM; nenhum sampler do LLM mudou.

## Importação e estado

Seletor existente aceita o arquivo real pelo content URI. Magic ZIP preserva
instalação MNN/Nezumi; outro arquivo passa pelo parser safetensors limitado a
16 MiB de header antes de copiar pesos. Sem pickle/.ckpt ou execução de código.

SD1.5 monolítico CompVis com UNet 4 canais/contexto 768, CLIP 49408×768/77×768 e
VAE decoder/post_quant_conv; pesos necessários F16/F32. Nomes/shapes excluem SD2,
SDXL, inpaint/pix2pix, LoRA e componentes Diffusers separados. A mesma arquitetura
SD1.x não prova a versão/treinamento exatos dos pesos. Arquivos incompletos,
offsets/tamanhos incorretos, sobreposição, payload extra e limites inválidos são
recusados. Máximo 8 GiB; instalação usa buffer 64 KiB e não carrega inferência.

Cópia integral original com SHA-256, manifesto privado e rename atômico. Sem
substituir escolha existente; nome do provider só é displayName, nunca autoridade
de formato. Falha/cancelamento remove só staging. Restore/load confirma hash e
header; arquivos/chats/modelos existentes não são removidos ou migrados.

Antes de carregar, lease exclusivo existente descarrega GGUF e confirma unload.
Só um motor/modelo de imagem ativo. Requer !lowMemory e ao menos max(3 GiB,
arquivo+512 MiB) disponíveis; não é garantia contra LMK/OOM. Cancelamento de load
é reconhecido antes/depois de new_sd_ctx (API não oferece interrupção dentro do
loader). Durante geração a flag nativa é solicitada e reafirmada no callback;
a revisão upstream reinicia a flag no início da geração. Fronteiras seguras,
não preempção instantânea de cada operação. Um handle cancelado é fechado;
a geração seguinte recebe outro serial/contexto.

Geração usa o mesmo chat/card/salvar/compartilhar/histórico. O motor gera PNG real
via stbi_write_png, sem generation_info privado embutido. Resolução solicitada
256/512 é calculada nativamente neste motor; MNN/Nezumi continuam em 512 com
redução final existente. Etapas/preferências antigas não são redefinidas. Perfis
MNN não se aplicam ao novo motor (controle desativado, parâmetros do SDK próprios).
O callback upstream mistura sampler, bytes de pesos e tiles VAE. Só contamos
o sampler de etapas solicitadas após a fronteira zero; eventos de outros
estágios não viram etapas de denoising. Preparação/decodificação são indeterminadas.

## Validação

- 23 testes JUnit locais: parser/família, instalação, SHA/restore, atomicidade,
  falta de espaço, cancelamento, truncamento, SD2/missing-VAE, MNN/Nezumi legados.
- Controller com Android e motores explicitamente fake: três caminhos, persistência
  da escolha anterior, seleção, load/unload, lease/GGUF, geração/cancelamento/falha.
  Fake não é prova de imagem real ou de reconhecimento no Android.
- Regressão C++ com API SD fake: diferencia sampler/pesos/tiles, cancel/free
  concorrente, destroy idempotente e serial antigo, usando o adaptador real.
- C++/JNI compilou no host Linux com os pins exatos; teste real em andamento
  é registrado no relatório final, sem confundir load/build com geração.
- Sem tablet conectado neste ambiente: geração, memória/LMK, cancelamento durante
  UNet/VAE, galeria/permissões, retomada GGUF/voz exigem Teclast T60 AI físico.

Fixture público para validação local (não incorporado ao APK/CI):
`Comfy-Org/stable-diffusion-v1-5-archive` @
`9cfd069101959ca3828bf9c04a4419870832b74f`,
`v1-5-pruned-emaonly-fp16.safetensors`, 2132696762 bytes,
SHA-256 `e9476a13728cd75d8279f6ec8bad753a66a1957ca375a1464dc63b37db6e3916`.
Licença dos pesos CreativeML OpenRAIL-M. Outros finetunes requerem validação;
modelo F32 de ~4 GiB pode ser instalado mas não caber na RAM do tablet.

## Build e teste no Teclast

JDK17, Gradle8.14.3, SDK36, NDK29.0.13113456, CMake3.31.6.
`gradle :app:assembleDebug` inclui o task nativo separado. Sem Vulkan/OpenCL.
GitHub Actions publica APK experimental sozinho e fontes/relatórios separados.
Resultados, commit e SHA do instalador ficam no relatório final desta branch.

1. Preservar os dados atuais; instalar APK experimental com assinatura compatível.
2. Configurações > Geração de imagens > importar checkpoint .safetensors completo
   FP16. Aguardar cópia/SHA; escolha anterior continua até selecionar o novo.
3. Selecionar e carregar. Confirmar GGUF descarregado, estado pronto ou erro claro.
4. Começar com 256² / 5 etapas e descrição simples; aguardar PNG, abrir/salvar.
   Para qualidade SD1.5 comum testar depois ~20 etapas; cinco não garantem qualidade.
5. Cancelar outra geração; tentar novamente; fechar/reabrir e confirmar seleção,
   histórico e imagens. Voltar ao GGUF pelo fluxo existente. Conferir também
   geração MNN/Nezumi para regressão física. Não apagar modelos para recuperar erro.

Não se afirma geração funcional no Android antes do teste físico. Build e testes
host são evidência de implementação, não garantia do comportamento de ARM/LMK.
