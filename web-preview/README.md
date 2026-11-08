# Haruna Web Preview

Pré-visualização visual da interface Android no navegador do tablet/PC, sem compilar APK.

O script `python3 web-preview/build.py` copia os assets web existentes para `_site/`
e acrescenta uma ponte **apenas visual** para as configurações de imagem.
Não executa GGUF, síntese/reconhecimento de voz, importação nativa ou inferência SDXL.
O indicador PRÉVIA WEB é sempre exibido. Preferências de aparência e de imagem
ficam no armazenamento local **do navegador**, sem afetar o APK.

## GitHub Pages
No repositório, em Settings > Pages, selecione **Build and deployment > Source:
GitHub Actions**. A workflow `Haruna Web Preview (GitHub Pages)` publica mudanças
na branch `refactor/haruna-ui-integracao-20261108`, quando Pages estiver habilitado.

Atenção: uma publicação Pages pode ser **pública mesmo quando o repositório
de origem é privado**. Revise essa configuração antes de habilitar e não publique
segredos ou dados pessoais em assets front-end.
Apenas a cópia estática dos arquivos sob `app/src/main/assets/haruna` é
publicada; código Kotlin, modelos, arquivos de usuário e segredos do repositório
não são copiados.

Para visualizar localmente: `python3 web-preview/build.py`, então
`python3 -m http.server 8000 -d _site` e acesse `http://localhost:8000/`.
Não use o protocolo file:// porque os módulos ES precisam de HTTP.
