'use strict';
const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..'),source=path.resolve(root,'../app/src/main/assets/haruna'),dest=path.join(root,'ui');
if(!fs.existsSync(source))throw Error('Use este diretório no repositório Haruna completo.');
fs.rmSync(dest,{recursive:true,force:true});fs.cpSync(source,dest,{recursive:true});
const write=(name,edit)=>{const p=path.join(dest,name),s=fs.readFileSync(p,'utf8');fs.writeFileSync(p,edit(s));};
write('index.html',s=>s.replace('<link rel="stylesheet" href="style.css">','<link rel="stylesheet" href="style.css"><link rel="stylesheet" href="/desktop/desktop.css">').replace('<script src="theme.js">','<script src="/desktop/entry.js"></script><script src="theme.js">').replace(/<script type="module" src="(?:diagnostics\/panel)\.js"><\/script>/g,''));
// Electron has no synchronous window.prompt. Adapt only the desktop copy.
write('app.js',s=>s.replace('function renameChat(c){const next=prompt(', 'async function renameChat(c){const next=await window.harunaDesktopPrompt(').replace('const reviewed=prompt(', 'const reviewed=await window.harunaDesktopPrompt('));
// Windows imports reference existing GGUF files; they are not copied or deleted.
write('model-library.js',s=>s
 .replace('Copiando para o armazenamento privado da Haruna','Registrando o arquivo GGUF local, sem duplicar o modelo')
 .replace("del.textContent='Excluir'","del.textContent='Remover da lista'")
 .replace('Excluir ${m.name}?','Remover ${m.name} da lista? O arquivo original será preservado.')
 .replace('Nenhum modelo instalado ainda.','Nenhum modelo GGUF importado ainda.')
);
// LocalStorage can reach its quota during long streamed chats. Keep the
// conversation usable and warn instead of aborting message rendering.
write('app.js',s=>s
 .replace("localStorage.setItem(CHATS_KEY,JSON.stringify(chats));localStorage.setItem(MEMORY_KEY,JSON.stringify(memories.slice(-200)));", "try{localStorage.setItem(CHATS_KEY,JSON.stringify(chats));localStorage.setItem(MEMORY_KEY,JSON.stringify(memories.slice(-200)))}catch(error){window.harunaDesktopStorageWarning?.(error)}")
 .replace("localStorage.setItem(CHATS_KEY,JSON.stringify(chats))}});", "try{localStorage.setItem(CHATS_KEY,JSON.stringify(chats))}catch(error){window.harunaDesktopStorageWarning?.(error)}}});")
);
write('learning-panel.js',s=>s.replace('next=prompt(', 'next=await window.harunaDesktopPrompt('));
// Desktop uses the same image composer and dimensions panel as the known-good Android UI.
write('image-chat.js',s=>{
 const oldPrompt="const text=original??(chat.state().draft.trim()||prompt('Descreva a imagem que deseja gerar:')||'').trim();if(!text)return;";
 if(!s.includes(oldPrompt))throw Error('Image prompt UI anchor not found');
 return s.replace(oldPrompt,"const text=String(original??chat.state().draft).trim();if(!text)throw Error('Escreva a descrição no campo de mensagem para gerar a imagem.');")
  .replace('Compartilhar\x27,()=>api?.open','Mostrar no Explorer\x27,()=>api?.open');
});
// The image module can evaluate before the chat's dependency graph finishes.
// Mount it after chat initialization, without changing Android sources.
write('app.js',s=>{
 const anchor='window.__HARUNA_CHAT_READY__=true;';
 if(!s.includes(anchor))throw Error('Haruna chat-ready anchor not found.');
 return s.replace(anchor,anchor+"window.dispatchEvent(new Event('haruna-chat-ready'));");
});
write('image-chat.js',s=>{
 const replace=(oldText,newText)=>{if(!s.includes(oldText))throw Error('Image bridge anchor not found: '+oldText);s=s.replace(oldText,newText);};
 replace('const api=window.HarunaImages,chat=window.harunaChatImages;','const api=window.HarunaImages;');
 replace('if(api&&chat){',"function mountImageChat(){const chat=window.harunaChatImages;if(!api||!chat||document.getElementById('generateImage'))return false;");
 if(!/\}\s*$/.test(s))throw Error('Image bridge closing block not found.');
 return s.replace(/\}\s*$/,"return true;\n}\nif(window.__HARUNA_CHAT_READY__)mountImageChat();\nelse window.addEventListener('haruna-chat-ready',mountImageChat,{once:true});\n");
});
// Keep all approved styles, image controls, and navigation from the functional
// Android revision. Only labels and platform bridges differ in the desktop copy.
write('image-models.js',s=>s
 .replace('function update(){if(document.hidden)return;try{','function update(){if(document.hidden && !window.HarunaDesktop)return;try{')
 .replace('Importe um pacote ZIP SD1.5 MNN Haruna ou Nezumi SD1.5 (Anything V5 / CyberRealistic). Ou importe um checkpoint SD1.5 completo .safetensors (experimental, CPU). SDXL Base/Illustrious completo também pode ser importado (experimental; CPU, pesos em disco, CLIP-L + CLIP-G + VAE). SD2, LoRA e componentes separados não são suportados. Para SD1.5 convencional, prefira cerca de 20 etapas; cinco servem como teste rápido.',
 'No Windows, importe checkpoints SD1.5 ou SDXL/Illustrious completos, ou adicione os quatro componentes FLUX.1. CPU e Vulkan dependem dos runtimes e da memória. Pacotes MNN Android e LoRA isolado não são executados pelo motor Windows.')
 .replace('Excluir este modelo de imagens do dispositivo?','Remover este modelo da lista? Originais externos serão preservados; componentes copiados pela Haruna serão excluídos.')
 .replace('Excluir este modelo de imagens','Remover este checkpoint da lista')
 // Windows loads the SDXL checkpoint only when a generation starts.
 .replace(']]){const b=document.createElement(\'button\');b.type=\'button\';b.textContent=label;', ']]){if(window.HarunaDesktop&&(label===\'Carregar\'||label===\'Descarregar\'))continue;const b=document.createElement(\'button\');b.type=\'button\';b.textContent=label;')
 .replace('Motor nativo indisponível. Instalação não implica que o modelo possa ser carregado.','Motor Windows CPU/Vulkan indisponível. A seleção não garante carregamento.'));
write('image-controls.js',s=>s.replace('pode ser lenta no tablet','pode ser lenta no computador'));
write('local-models.js',s=>s.replace('Dados do Android','Monitoramento do Windows indisponível nesta versão'));
write('index.html',s=>{
 const anchor='</body>';
 if(!s.includes(anchor))throw Error('Desktop image backend anchor not found');
 return s.replace(anchor,'<script type="module" src="/desktop/voice.js"></script><script type="module" src="/desktop/vulkan-settings.js"></script>'+anchor);
});
console.log('Copied the known-good Android UI for Windows with CPU/Vulkan platform adapters; Android remains unchanged.');

// One identity source for both platforms. Never maintain a second persona by hand.
const javaRoot=path.resolve(root,'../app/src/main/java/com/proxyslabs/haruna');
const rules=['HarunaIdentity.kt','HarunaBehaviorProfile.kt'].map(name=>{
 const text=fs.readFileSync(path.join(javaRoot,name),'utf8');
 const match=text.match(/val RULES = \"\"\"([\s\S]*?)\"\"\"\.trimIndent\(\)/);
 if(!match)throw Error('Missing Android identity anchor: '+name);
 const rows=match[1].replace(/^\n|\n\s*$/g,'').split('\n');const indent=Math.min(...rows.filter(r=>r.trim()).map(r=>r.match(/^ */)[0].length));
 return rows.map(r=>r.slice(indent)).join('\n');
}).join('\n');
fs.writeFileSync(path.join(root,'src/identity-rules.json'),JSON.stringify(rules)+'\n');

write('documents/ui.js',s=>s.replace("const q=prompt(","const q=await window.harunaDesktopPrompt("));
