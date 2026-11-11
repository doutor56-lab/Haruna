'use strict';
const fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),crypto=require('node:crypto');
const {Readable}=require('node:stream');const {pipeline}=require('node:stream/promises');
const tar=require('tar-stream'),bzip=require('unbzip2-stream');
const {atomicJson,readJson}=require('./models.cjs');
const TTS_FILES=['duration_predictor.int8.onnx','text_encoder.int8.onnx','vector_estimator.int8.onnx','vocoder.int8.onnx','tts.json','unicode_indexer.bin','voice.bin','LICENSE'];
const catalog=['tiny','base','small'].map((family,i)=>({id:`whisper-${family}-int8`,family,name:`Whisper ${family[0].toUpperCase()+family.slice(1)}`,engine:'sherpa',bytes:[116204861,207557382,639387718][i],url:`https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-${family}.tar.bz2`,files:[`${family}-encoder.int8.onnx`,`${family}-decoder.int8.onnx`,`${family}-tokens.txt`]}));
const tts={id:'supertonic-3-int8',bytes:128774318,sha:'82fa96f91c4ef8abaae3a14a3f4153facf88bed821d1f7331cec2700f432c427',url:'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/sherpa-onnx-supertonic-3-tts-int8-2026-05-11.tar.bz2',files:TTS_FILES};
async function hash(file,signal){const h=crypto.createHash('sha256');for await(const b of fs.createReadStream(file)){signal?.throwIfAborted();h.update(b);}return h.digest('hex');}
function installed(root,spec){const data=readJson(path.join(root,spec.id,'installed.json'),{});return spec.files.every(n=>{try{return fs.statSync(path.join(root,spec.id,n)).size===data.files?.[n]?.bytes&&data.files[n].sha?.length===64;}catch{return false;}});}
async function verify(root,spec){if(!installed(root,spec))throw Error('Modelo de voz incompleto. Importe-o novamente.');const data=readJson(path.join(root,spec.id,'installed.json'),{});for(const n of spec.files)if(await hash(path.join(root,spec.id,n))!==data.files[n].sha)throw Error('Modelo de voz corrompido. Importe-o novamente.');}
async function install(root,spec,inputFile,signal,progress){
 await fsp.mkdir(root,{recursive:true});const stage=path.join(root,'.install-'+crypto.randomUUID()),archive=stage+'.tar.bz2';await fsp.mkdir(stage);let count=0;
 try{
  const free=await fsp.statfs(root,{bigint:true});if(free.bavail*free.bsize<BigInt(spec.bytes*4+134217728))throw Error('Espaço insuficiente para instalar a voz.');
  const input=inputFile?fs.createReadStream(inputFile):(await fetch(spec.url,{signal}).then(r=>{if(!r.ok)throw Error('Não foi possível baixar o modelo de voz.');return Readable.fromWeb(r.body);}));
  input.on('data',b=>{count+=b.length;if(count>spec.bytes)input.destroy(Error('Pacote de voz incompatível.'));progress(inputFile?'importing':'downloading',count,spec.bytes);});
  await pipeline(input,fs.createWriteStream(archive,{flags:'wx',mode:0o600}),{signal});if(count!==spec.bytes||spec.sha&&await hash(archive)!==spec.sha)throw Error('Pacote de voz incompleto ou incompatível.');
  const extract=tar.extract(),seen=new Set(),files={};let expanded=0,entries=0;
  extract.on('entry',(header,source,next)=>{
   // Do not follow links, paths or special tar members. Only known model files survive.
   const parts=header.name.replace(/\/$/,'').split('/');
   if(++entries>128||parts.some(n=>!n||n==='.'||n==='..'||n.includes('\\')||n.includes(':'))||!['file','directory'].includes(header.type)){source.resume();extract.destroy(Error('Pacote de voz inseguro.'));return;}
   expanded+=header.size;if(expanded>spec.bytes*8){source.resume();extract.destroy(Error('Pacote excede o limite seguro de descompressão.'));return;}const name=parts.at(-1);if(header.type==='directory'||!spec.files.includes(name)){source.resume();source.on('end',next);return;}
   if(seen.has(name)||header.size<=0){source.resume();extract.destroy(Error('Pacote de voz incompatível.'));return;}seen.add(name);
   pipeline(source,fs.createWriteStream(path.join(stage,name),{flags:'wx',mode:0o600}),{signal}).then(next,e=>extract.destroy(e));
  });progress('extracting',0,null);await pipeline(fs.createReadStream(archive),bzip(),extract,{signal});
  for(const name of spec.files){const p=path.join(stage,name);const stat=await fsp.stat(p);files[name]={bytes:stat.size,sha:await hash(p)};}
  if(spec.family){const tokens=await fsp.readFile(path.join(stage,`${spec.family}-tokens.txt`),'utf8');if(!tokens.includes('<|pt|>')&&!tokens.includes('PHxwdHw+')&&tokens.trim().split('\n').length!==50257)throw Error('Whisper multilíngue incompatível.');}
  signal.throwIfAborted();atomicJson(path.join(stage,'installed.json'),{files});const target=path.join(root,spec.id),backup=target+'.backup';await fsp.rm(backup,{recursive:true,force:true});
  if(fs.existsSync(target))await fsp.rename(target,backup);
  try{await fsp.rename(stage,target);}catch(e){if(fs.existsSync(backup))await fsp.rename(backup,target);throw e;}await fsp.rm(backup,{recursive:true,force:true});
 }finally{await fsp.rm(stage,{recursive:true,force:true});await fsp.rm(archive,{force:true});}
}
module.exports={catalog,tts,installed,verify,install,hash};
