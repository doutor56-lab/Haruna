# Etapa 8 — verificações focadas

- `docx_check.cjs fixture.docx`: parser Mammoth real, ordem de título/parágrafo/tabela, rejeição de arquivo corrompido.
- `ui_check.cjs fixture.docx`: Chromium/Playwright, 360×800 e 800×1280, biblioteca/busca/prévia/controles, worker DOCX real, preservação de conversa. Ponte Android simulada, não comprova OCR/visão Android.
- `vision_owner_check.py`: controlador Kotlin real com Android/JNI simulados; libera GGUF antes da visão, restaura em sucesso/falha, informa erro de restore, rejeita owner concorrente/cancelamento. Exige pesos oficiais locais via `HARUNA_VISION_TEST_MODELS`; não baixa modelos.
- `sqlite_check.py`: SQL do esquema/índice em SQLite real do host, FTS5 e FTS4, isolamento de anexos e páginas; não substitui teste Android.
- Os testes de imagens anteriores continuam independentes: `tests/image_controller_check.py`, `tests/image_ui_check.cjs` e unitários Gradle.

O teste de inferência realizado no desenvolvimento compilou `haruna_vision.cpp` com libmtmd/libllama do commit fixado e executou o par oficial Q8_0 + projetor f16, via a mesma classe JNI `VisionNative`. Uma imagem real (`tools/mtmd/test-1.jpeg` do runtime) resultou em texto e EOS. Isso não equivale a validação no ARM64/tablet.

A biblioteca Android e o OCR por página precisam de execução no Teclast. Não executar testes destrutivos sobre conversas ou modelos do usuário.
