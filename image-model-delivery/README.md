Arquivos experimentais da Etapa 9B, separados para download.

- **Haruna-9B-debug.apk**: APK já compilado e verificado no run 41978257995; não foi recompilado nem alterado para esta entrega.
- **SD15-MNN-CPU-referencia.zip**: aproximadamente 1,15 GB. Importe o próprio ZIP em Configurações → Geração de imagens → Adicionar modelo. Não extraia esse ZIP e não use o seletor de GGUF/STT.
- **SHA256SUMS.txt**: hashes dos dois arquivos.

O pacote usa os pesos originais 8-bit de `taobao-mnn/stable-diffusion-v1-5-mnn-general` @ `56c93a62ac9d6b5d18605632b85e25f87281f317`, com tokenizer.mtok exportado pelo MNN. Licenças completas e fontes estão no manifesto dentro do ZIP. Não houve conversão/requantização dos pesos. A integridade de todos os componentes e do ZIP foi conferida.

**Atenção: nenhum PNG real completo foi demonstrado.** O carregamento JNI foi validado no host, mas a execução do UNet excedeu a memória do host CPU FP32. Não há teste físico Android nem garantia de geração no aparelho. Esta pré-release não é uma versão estável nem comprovação de geração funcional.

Código do APK: `197b9a97d0aa0d9ee06f9cd0a8ea5c7831a0f764`. Branch estável e PR #4 não foram modificados/mesclados por esta publicação. O workflow apenas baixa dados públicos fixados, verifica hashes, reproduz o pacote e publica os arquivos; não executa inferência.
