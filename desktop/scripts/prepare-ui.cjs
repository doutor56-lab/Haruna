'use strict';
const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..'),source=path.resolve(root,'../app/src/main/assets/haruna'),dest=path.join(root,'ui');
if(!fs.existsSync(source))throw Error('Use este diretório no repositório Haruna completo.');
fs.rmSync(dest,{recursive:true,force:true});fs.cpSync(source,dest,{recursive:true});
const write=(name,edit)=>{const p=path.join(dest,name),s=fs.readFileSync(p,'utf8');fs.writeFileSync(p,edit(s));};
write('index.html',s=>s.replace('<link rel="stylesheet" href="style.css">','<link rel="stylesheet" href="style.css"><link rel="stylesheet" href="/desktop/desktop.css">').replace('<script src="theme.js">','<script src="/desktop/entry.js"></script><script src="theme.js">').replace(/<script type="module" src="(?:diagnostics\/panel|speech-ui|voice-chat|voice\/stage6-ui)\.js"><\/script>/g,''));
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
write('image-chat.js',s=>s.replace('button.onclick=()=>{try{','button.onclick=async ()=>{try{').replace("prompt('Descreva a imagem que deseja gerar:')","await window.harunaDesktopPrompt('Descreva a imagem que deseja gerar:')").replaceAll('modelo SD1.5','checkpoint SDXL').replaceAll("button('Compartilhar'", "button('Mostrar no Explorer'").replace("if(j.saveWarning){", "if(j.restoreWarning){const warning=document.createElement('small');warning.textContent=j.restoreWarning;bubble.append(warning)}if(j.saveWarning){"));
fs.writeFileSync(path.join(dest,'image-models.js'),"import '/desktop/image-settings.js';\n");

// Overlay only approved visual styles from the Android UI refresh.
// Keep desktop-specific JS bridges and image-models replacement intact.
const overlays=['settings-workspace.css','memory-workspace.css','library-workspace.css','tablet-landscape.css','approved-pages.css'];
for(const name of overlays)fs.copyFileSync(path.join(root,'ui-updates',name),path.join(dest,name));
write('index.html',s=>s.replace('</head>','<link rel="stylesheet" href="approved-pages.css"></head>'));
// drawer-toggle.js is staged for a separate event-handler compatibility check;
// do not enable it alongside the legacy desktop menu binding.

console.log('Copied Haruna UI with approved Windows visual overlays; Android source unchanged.');
