'use strict';
const fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),crypto=require('node:crypto');
const {Readable,Transform}=require('node:stream');const {pipeline}=require('node:stream/promises');
const tar=require('tar-stream'),bzip=require('unbzip2-stream');
const {atomicJson,readJson}=require('./models.cjs');
const TTS_FILES=['duration_predictor.int8.onnx','text_encoder.int8.onnx','vector_estimator.int8.onnx','vocoder.int8.onnx','tts.json','unicode_indexer.bin','voice.bin','LICENSE'];
const catalog=['tiny','base','small'].map((family,i)=>({id:`whisper-${family}-int8`,family,name:`Whisper ${family[0].toUpperCase()+family.slice(1)}`,engine:'sherpa',bytes:[116204861,207557382,639387718][i],...(i===0?{sha:'c46116994e539aa165266d96b325252728429c12535eb9d8b6a2b10f129e66b1'}:{}),url:`https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-${family}.tar.bz2`,files:[`${family}-encoder.int8.onnx`,`${family}-decoder.int8.onnx`,`${family}-tokens.txt`]}));
const tts={id:'supertonic-3-int8',bytes:128774318,sha:'82fa96f91c4ef8abaae3a14a3f4153facf88bed821d1f7331cec2700f432c427',url:'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/sherpa-onnx-supertonic-3-tts-int8-2026-05-11.tar.bz2',files:TTS_FILES};
function hasPortuguese(tokens){
 const lines=tokens.split(/\r?\n/);
 if((tokens.includes('<|pt|>')||lines.some(l=>l.split(' ')[0]==='PHxwdHw+'))&&(tokens.includes('<|startoftranscript|>')||tokens.includes('PHxzdGFydG9mdHJhbnNjcmlwdHw+')))return true;
 const ids=new Uint8Array(50257);let count=0;
 for(const line of lines){if(!line.trim())continue;const symbol=line.slice(0,line.indexOf(' ')),raw=line.slice(line.lastIndexOf(' ')+1);if(!/^\d+$/.test(raw))return false;const rank=Number(raw);if(rank>=ids.length||ids[rank]||!((rank===50256&&symbol==='=')||/^[A-Za-z0-9+/]+={0,2}$/.test(symbol)))return false;ids[rank]=1;count++;}
 return count===ids.length;
}
function installedBytes(root,spec){if(!installed(root,spec))return 0;const data=readJson(path.join(root,spec.id,'installed.json'),{});return spec.files.reduce((n,name)=>n+data.files[name].bytes,0);}
async function hash(file,signal){const h=crypto.createHash('sha256');for await(const b of fs.createReadStream(file)){signal?.throwIfAborted();h.update(b);}return h.digest('hex');}
function installed(root,spec){const data=readJson(path.join(root,spec.id,'installed.json'),{});return spec.files.every(n=>{try{return fs.statSync(path.join(root,spec.id,n)).size===data.files?.[n]?.bytes&&data.files[n].sha?.length===64;}catch{return false;}});}
async function verify(root,spec){if(!installed(root,spec))throw Error('Modelo de voz incompleto. Importe-o novamente.');const data=readJson(path.join(root,spec.id,'installed.json'),{});for(const n of spec.files)if(await hash(path.join(root,spec.id,n))!==data.files[n].sha)throw Error('Modelo de voz corrompido. Importe-o novamente.');}
async function install(root,spec,inputFile,signal,progress){
 await fsp.mkdir(root,{recursive:true});const stage=path.join(root,'.install-'+crypto.randomUUID()),archive=stage+'.tar.bz2';await fsp.mkdir(stage);let count=0;
 try{
  const free=await fsp.statfs(root,{bigint:true});if(free.bavail*free.bsize<BigInt(spec.bytes*4+134217728))throw Error('Espaço insuficiente para instalar a voz.');
  const input=inputFile?fs.createReadStream(inputFile):(await fetch(spec.url,{signal}).then(r=>{if(!r.ok)throw Error('Não foi possível baixar o modelo de voz.');return Readable.fromWeb(r.body);}));
  input.on('data',b=>{count+=b.length;if(count>spec.bytes)input.destroy(Error('Pacote de voz incompatível.'));progress(inputFile?'importing':'downloading',count,spec.bytes);});
  await pipeline(input,fs.createWriteStream(archive,{flags:'wx',mode:0o600}),{signal});if(count!==spec.bytes||spec.sha&&await hash(archive,signal)!==spec.sha)throw Error('Pacote de voz incompleto ou incompatível.');
  const extract=tar.extract(),seen=new Set(),files={};let expanded=0,entries=0;
  extract.on('entry',(header,source,next)=>{
   // Do not follow links, paths or special tar members. Only known model files survive.
   const parts=header.name.replace(/\/$/,'').split('/');
   if(++entries>128||parts.some(n=>!n||n==='.'||n==='..'||n.includes('\\')||n.includes(':'))||!['file','directory'].includes(header.type)){source.resume();extract.destroy(Error('Pacote de voz inseguro.'));return;}
   expanded+=header.size;if(expanded>spec.bytes*8){source.resume();extract.destroy(Error('Pacote excede o limite seguro de descompressão.'));return;}const name=parts.at(-1);if(header.type==='directory'||!spec.files.includes(name)){source.resume();source.on('end',next);return;}
   if(seen.has(name)||header.size<=0){source.resume();extract.destroy(Error('Pacote de voz incompatível.'));return;}seen.add(name);
   pipeline(source,fs.createWriteStream(path.join(stage,name),{flags:'wx',mode:0o600}),{signal}).then(next,e=>extract.destroy(e));
  });progress('extracting',0,count);let compressed=0;const meter=new Transform({transform(chunk,encoding,next){compressed+=chunk.length;progress('extracting',compressed,count);next(null,chunk);}});await pipeline(fs.createReadStream(archive),meter,bzip(),extract,{signal});
  progress('validating',0,null);
  for(const name of spec.files){const p=path.join(stage,name);const stat=await fsp.stat(p);files[name]={bytes:stat.size,sha:await hash(p,signal)};}
  if(spec.family){const tokens=await fsp.readFile(path.join(stage,`${spec.family}-tokens.txt`),'utf8');if(!hasPortuguese(tokens))throw Error('Whisper multilíngue incompatível.');}
  signal.throwIfAborted();progress('finalizing',0,null);atomicJson(path.join(stage,'installed.json'),{files});const target=path.join(root,spec.id),backup=target+'.backup';await fsp.rm(backup,{recursive:true,force:true});
  if(fs.existsSync(target))await fsp.rename(target,backup);
  try{await fsp.rename(stage,target);}catch(e){if(fs.existsSync(backup))await fsp.rename(backup,target);throw e;}await fsp.rm(backup,{recursive:true,force:true});
 }finally{await fsp.rm(stage,{recursive:true,force:true});await fsp.rm(archive,{force:true});}
}
module.exports={catalog,tts,installed,installedBytes,hasPortuguese,verify,install,hash};
