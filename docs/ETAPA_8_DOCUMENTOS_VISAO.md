# Etapa 8 — documentos, OCR e visão offline

Base: `feature/safetensors-sd15`, `3b47966c1bb2760c789c9e1985dc7836ca93f929`.
Trabalho isolado: `feature/stage8-documents-vision`, criado nessa base; sem merge na versão estável.
Runtime preservado: llama.cpp `4d71b42fd87db24b8b7c808c151b713aa4459cfd`.

## Implementação

- PDFBox-Android 2.0.27.0: texto por página; Android PdfRenderer: prévia e renderização das páginas que exigem OCR.
- Tesseract4Android 4.9.0: português + inglês oficiais `tessdata_fast`, empacotados com SHA-256 fixado. OCR somente quando a página não apresenta texto extraível suficiente. Uma página/bitmap por vez; cancelamento usa a API HOCR interruptível.
- Mammoth 1.13.0: DOCX em worker local, preservando ordem de títulos/parágrafos/tabelas. ZIP validado por tamanho expandido real, CRC e nomes seguros; limites 32 MiB comprimidos / 64 MiB expandidos. Conteúdo nunca é inserido como HTML.
- TXT/MD/CSV/JSON/LOG: leitura em blocos, BOM/detecção de codificação por juniversalchardet 2.5.0; sem carregar o arquivo completo na RAM. Limite de importação: 512 MiB.
- libmtmd existente no runtime: SmolVLM-500M oficial (GGUF textual + projetor correspondente). Integração JNI real, CPU, sem segundo llama/GGML, sem atualizar runtime. Seleção/importação/download explícito; SHA-256 e tamanho obrigatórios. Pesos não embutidos no APK.
- O owner de processo reutiliza `ImageLease`: descarrega GGUF, confirma liberação, executa visão, libera contexto/modelo/projetor/sampler e restaura o GGUF anterior. Falhas de restauração são informadas; histórico permanece no armazenamento existente.
- Banco SQLite novo e separado, `haruna_documents_v1.db`: páginas, trechos e FTS5 quando disponível, FTS4 como fallback real. Não migra nem limpa IndexedDB/chats antigos.
- Anexos de conversa não são promovidos silenciosamente para o RAG global. A promoção exige importação explícita na biblioteca ou “Salvar conteúdo”/“Ativar”. Excluir um anexo libera cópias/índices não retidos quando não restam vínculos. Documentos retidos no Segundo Cérebro permanecem.
- Biblioteca integrada à área de memória: importar, buscar por nome/conteúdo, visualizar texto/páginas, ativar/pausar, processar, interpretar uma figura/página e remover. Modelo visual em Configurações; operação com progresso real e cancelamento.
- Contexto usa os limites de trechos existentes, elimina duplicatas e carrega nome/página reais. “Trechos enviados ao modelo” não afirma que a resposta foi factual nem que todas as fontes foram utilizadas.
- Orientação de estilo mais direta na regra de comportamento existente, preservando persona e respostas detalhadas solicitadas. Sem novo limite rígido, filtro de saída ou alteração de sampler.

## Verificações realizadas no desenvolvimento

- C++ JNI compilado e ligado com libmtmd/libllama reais do commit fixado.
- Inferência real do par oficial SmolVLM Q8_0 + projetor f16 na imagem pública `tools/mtmd/test-1.jpeg`: produziu descrição textual e EOS. Executada no host, NÃO no Teclast/Android. Não é medida de qualidade nem de performance Android.
- Classes Kotlin novas compiladas contra android.jar API 36 e APIs reais de PDFBox/Tesseract/Exif/charset.
- Parser Mammoth real: título, parágrafo, tabela, ordem e rejeição de DOCX corrompido.
- Tesseract do host com os idiomas oficiais empacotados reconheceu a frase de teste em português/inglês. Não comprova captura/OCR Android.
- Detecção real UTF-8, UTF-16 com BOM e ISO-8859-1 em português.
- SQLite real do host: FTS5/FTS4, acentos, página de origem, isolamento/promover/pausar e remoção de índice.
- Chromium 360×800 / 800×1280: biblioteca, busca, prévia, controles visuais, worker DOCX real, persistência de conversa antiga. Ponte Android simulada.
- Controller real de visão com Android/JNI simulados: unload/restore, falha de restore, exclusão mútua e cancelamento.
- Testes anteriores de controle e interface de geração de imagens passaram. Código dos motores MNN/Nezumi/stable-diffusion.cpp não alterado.

## Limitações e entrega

Build Android completo/APK novo: autorizado pelo usuário em 2026-11-06; workflow desta branch será executado e seu resultado registrado. Nenhum resultado Android físico é presumido.

A assinatura privada anterior não foi localizada. APKs anteriores já mostraram certificados debug diferentes; não gerar uma chave substituta e afirmar atualização compatível. A instalação preservando dados depende da chave correspondente ao APK instalado. Nenhuma desinstalação, limpeza de dados ou migração destrutiva foi executada.

Requer validação no Teclast: extração/renderer de PDF, OCR ARM64, carregamento/cancelamento/restore visual e consumo real de memória. O SmolVLM é pequeno e pode errar em gráficos, detalhes e texto; OCR e interpretação visual são identificados separadamente. DOCX não tem paginação física garantida; imagens incorporadas não são interpretadas automaticamente. A referência preferencial testada no host é Q8_0 + projetor f16; os demais pares oficiais aceitos ainda exigem validação.

Sem alterações no comportamento da geração de imagens, nos modelos GGUF instalados, voz, sampling, cache híbrido ou downloads LLM.
