'use strict';
const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..'),source=path.resolve(root,'../app/src/main/assets/haruna'),dest=path.join(root,'ui');
if(!fs.existsSync(source))throw Error('Use este diretório no repositório Haruna completo.');
fs.rmSync(dest,{recursive:true,force:true});fs.cpSync(source,dest,{recursive:true});
const write=(name,edit)=>{const p=path.join(dest,name),s=fs.readFileSync(p,'utf8');fs.writeFileSync(p,edit(s));};
write('index.html',s=>s.replace('<link rel="stylesheet" href="style.css">','<link rel="stylesheet" href="style.css"><link rel="stylesheet" href="/desktop/desktop.css">').replace('<script src="theme.js">','<script src="/desktop/entry.js"></script><script src="theme.js">').replace(/<script type="module" src="(?:diagnostics\/panel|speech-ui|voice-chat|voice\/stage6-ui)\.js"><\/script>/g,''));
// Electron has no synchronous window.prompt. Adapt only the desktop copy.
write('app.js',s=>s.replace('function renameChat(c){const next=prompt(', 'async function renameChat(c){const next=await window.harunaDesktopPrompt(').replace('const reviewed=prompt(', 'const reviewed=await window.harunaDesktopPrompt('));
write('learning-panel.js',s=>s.replace('next=prompt(', 'next=await window.harunaDesktopPrompt('));
write('image-chat.js',s=>s.replace('button.onclick=()=>{try{','button.onclick=async ()=>{try{').replace("prompt('Descreva a imagem que deseja gerar:')","await window.harunaDesktopPrompt('Descreva a imagem que deseja gerar:')").replaceAll('modelo SD1.5','checkpoint SDXL').replaceAll("button('Compartilhar'", "button('Mostrar no Explorer'").replace("if(j.saveWarning){", "if(j.restoreWarning){const warning=document.createElement('small');warning.textContent=j.restoreWarning;bubble.append(warning)}if(j.saveWarning){"));
fs.writeFileSync(path.join(dest,'image-models.js'),"import '/desktop/image-settings.js';\n");
console.log('Copied current Haruna UI with desktop-only adapters; Android source unchanged.');
