'use strict';
const PRESETS=Object.freeze({
 '3:5':[[768,1280],[840,1400]],'1:1':[[1024,1024],[1280,1280]],
 '9:16':[[720,1280],[864,1536]],'3:4':[[768,1024],[960,1280]],
 '7:9':[[896,1152],[1008,1296]],'2:3':[[832,1248],[960,1440]]
});
const DEFAULTS=Object.freeze({width:1024,height:1024,steps:28,cfg:5,clipSkip:2,sampler:'euler',scheduler:'discrete',seed:-1,negativePrompt:'',backend:'cpu',lowMemory:true,vramBudget:2,autoSave:true});
function validate(input={}){
 const p={...DEFAULTS,...input};
 for(const k of ['width','height'])if(!Number.isInteger(p[k])||p[k]<256||p[k]>2048||p[k]%8)throw Error('Largura e altura devem ser múltiplos de 8, entre 256 e 2048.');
 if(p.width*p.height>4194304)throw Error('A resolução excede 4 megapixels.');
 if(!Number.isInteger(p.steps)||p.steps<1||p.steps>100)throw Error('Use entre 1 e 100 etapas.');
 if(!Number.isFinite(p.cfg)||p.cfg<1||p.cfg>20)throw Error('CFG deve estar entre 1 e 20.');
 if(!Number.isInteger(p.clipSkip)||p.clipSkip<1||p.clipSkip>12)throw Error('Clip skip inválido.');
 if(!Number.isSafeInteger(p.seed)||p.seed< -1||p.seed>2147483647)throw Error('Seed inválida; use -1 para aleatória.');
 if(!['euler','euler_a','dpm++2m'].includes(p.sampler)||!['discrete','karras'].includes(p.scheduler))throw Error('Sampler ou scheduler incompatível.');
 if(!['cpu','vulkan'].includes(p.backend))throw Error('Backend não disponível.');
 if(typeof p.lowMemory!=='boolean'||!Number.isFinite(p.vramBudget)||p.vramBudget<0.5||p.vramBudget>4)throw Error('Limite de memória inválido.');
 if(typeof p.negativePrompt!=='string'||p.negativePrompt.length>8000||typeof p.autoSave!=='boolean')throw Error('Configuração de imagem inválida.');
 return Object.fromEntries(Object.keys(DEFAULTS).map(k=>[k,p[k]]));
}
function preset(ratio,quality='M',orientation='portrait'){
 if(!PRESETS[ratio]||!['M','L'].includes(quality)||!['portrait','landscape'].includes(orientation))throw Error('Proporção inválida.');
 const [w,h]=PRESETS[ratio][quality==='L'?1:0];return orientation==='landscape'?{width:h,height:w}:{width:w,height:h};
}
function nativeSize(p){return {width:Math.ceil(p.width/32)*32,height:Math.ceil(p.height/32)*32};}
function command({model,promptFile,negativeFile,output,settings}){
 const p=validate(settings),native=nativeSize(p);
 return ['--mode','img_gen','--model',model,'--prompt-file',promptFile,'--negative-prompt-file',negativeFile,'--output',output,'--width',String(native.width),'--height',String(native.height),'--steps',String(p.steps),'--cfg-scale',String(p.cfg),'--clip-skip',String(p.clipSkip),'--sampling-method',p.sampler,'--scheduler',p.scheduler,'--seed',String(p.seed),'--backend',p.backend==='cpu'?'cpu':'vulkan0',...(p.lowMemory?(p.backend==='cpu'?['--params-backend','disk']:['--auto-fit','on','--max-vram',String(p.vramBudget)]):[]),'--vae-tiling','--disable-image-metadata','--log-level','info'];
}
module.exports={PRESETS,DEFAULTS,validate,preset,nativeSize,command};
