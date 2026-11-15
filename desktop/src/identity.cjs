'use strict';
const CONFIG=require('../ui/identity/config.json');
const COMMON_RULES=require('./identity-rules.json');
const expand=text=>text.replaceAll('{name}',CONFIG.name).replaceAll('{developer}',CONFIG.developer);
const RULES=expand(CONFIG.identityInstruction)+'\n'+COMMON_RULES;
function systemPrompt(file,metadata={}){return RULES+'\nArquivo GGUF carregado (identificador do arquivo, não prova de origem/arquitetura): '+JSON.stringify(String(file).replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,180))+'\nMetadados GGUF declarados (origem não verificada): '+JSON.stringify(metadata);}
module.exports={systemPrompt,RULES,CONFIG};
