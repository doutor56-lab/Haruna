'use strict';
// Generated from the current Android identity by prepare:ui.
const RULES=require('./identity-rules.json');
function systemPrompt(file){return RULES+'\nArquivo GGUF carregado (identificador do arquivo, não prova de origem/arquitetura): '+JSON.stringify(String(file).replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,180));}
module.exports={systemPrompt,RULES};
