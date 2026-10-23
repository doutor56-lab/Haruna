# Haruna Android v0.3

Assistente local/offline para Android. A interface web conversa com `HarunaAndroidBridge`; `LlamaCppBackend` usa o binding Android oficial de llama.cpp (`AiChat` / `InferenceEngine`) para carregar um GGUF do armazenamento privado e transmitir tokens de volta à UI.

## Dependência nativa
O projeto espera o repositório oficial `ggml-org/llama.cpp` em `third_party/llama.cpp` (submódulo Git). Clone com submódulos antes de abrir no Android Studio.

## Primeiro alvo
CPU arm64-v8a, GGUF pequeno, inferência totalmente local. Sem API de IA e sem permissão INTERNET no app.

O fluxo esperado é: abrir Haruna → selecionar `.gguf` → Android copia para `filesDir/models` → `InferenceEngine.loadModel()` → chat envia prompt → tokens retornam progressivamente à interface.
