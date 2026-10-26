# Identidade visual da Haruna

Base: `9c60539513ed8e037bfb154924fe2ea59811ad07`, branch `ui-polish-icons`.

Checkpoint anterior às alterações: `checkpoint/haruna-before-reference-visual-20261026-9c60539`.

## Escopo

Adaptação da referência visual fornecida pelo usuário: símbolo H com faixa lilás, órbita e estrela; fundo escuro azul profundo e tema claro lavanda; controles com ícones de traço; cartões e navegação consistentes.

- `haruna-icon.svg`: identidade compartilhada pelo favicon, cabeçalho, boas-vindas, conversa vazia, avatar e chamada.
- `theme.css`: cores dos dois temas, layout dos controles existentes, tipografia, estados visuais e 35 ícones vetoriais locais. Máscaras ficam nos ícones e nos pseudo-elementos, preservando o fundo e a área de toque dos botões.
- `index.html`: apresentação dos controles, nomes dos temas e referências ao ícone. Todos os IDs existentes são preservados.
- `app.js`: ícones e rótulos de anexos, ações da mensagem, notificações e atalhos das conversas; atributo de apresentação do estado do LLM para colorir o indicador. A lógica das ações permanece igual.
- `speech-ui.js`, `voice-chat.js` e `learning-panel.js`: substituição dos símbolos decorativos nos rótulos/markup. Os motores, a captura, os eventos e os fluxos existentes permanecem iguais.
- `theme.js`: somente atualização das duas cores da tag `theme-color`; mesma persistência e mesma seleção de tema.
- Recursos Android: versão vetorial, foreground adaptativo, ícone monocromático e cor de fundo do launcher. O manifesto aponta para o recurso adaptativo; permissões e configuração da atividade permanecem iguais.

Os SVGs dos controles são incorporados no CSS e o símbolo é um arquivo local. Não há fonte de ícones, CDN, dependência ou download novo. Emojis escritos pelo usuário ou gerados nas respostas não são transformados.

## Funcionalidades preservadas

Sem alteração em `recovery-runtime.js`, `knowledge-store.js`, `attachment-store.js`, `model-library.js`, `llm-engine.js`, `android-bridge.js` ou em qualquer fonte Kotlin. Não há mudança de esquema, migração, modelo, prompt, RAG, exclusão, armazenamento, geração, reconhecimento ou síntese.

Todos os controles existentes continuam disponíveis, inclusive os atalhos de fixar, renomear e salvar conversa. O menu de pressionar e segurar continua sendo o mesmo. A tela de configurações mantém as seções e ações reais existentes; a referência não é usada para introduzir opções sem implementação.

## Conferência

Realizadas conferências de sintaxe JavaScript, XML/SVG, IDs do HTML e comparação dos módulos preservados. O símbolo SVG foi renderizado e inspecionado. Não foram adicionados testes nem executadas suítes ou benchmarks.

A prévia completa no navegador ficou indisponível pelas restrições de execução do ambiente. Ainda é necessário conferir no Android: temas claro/escuro/sistema, ícone do launcher e monocromático, tamanhos de tela, teclado, anexos e menus. Não foi realizado teste no dispositivo nem gerado um novo APK nesta alteração visual.
