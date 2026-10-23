# Haruna

Assistente local/offline para Android.

Este repositório contém a base Android nativa da Haruna. A interface web atual é preservada dentro do APK e se comunica com o runtime local por `window.HarunaAndroid`.

## Estado

- WebView local
- bridge Android/JavaScript
- seleção de GGUF
- armazenamento privado do modelo
- streaming Android -> JavaScript preparado
- fallback básico preservado
- sem API paga
- sem inferência falsa

Próxima etapa: integrar o runtime Android oficial do llama.cpp e implementar `LlamaCppBackend`.
