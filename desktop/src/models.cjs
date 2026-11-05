'use strict';
const fs=require('node:fs');const fsp=fs.promises;const path=require('node:path');
// Container/shape validation is deliberately separate from native inference.
async function inspectSdxl(file){
 const h=await fsp.open(file,'r');try{
  const {size}=await h.stat();if(size<16)throw Error('Checkpoint incompleto.');
  const head=Buffer.alloc(8);await h.read(head,0,8,0);const length=head.readBigUInt64LE();
  if(length<2n||length>16n*1024n*1024n||length>BigInt(size-8))throw Error('Arquivo safetensors inválido.');
  const bytes=Buffer.alloc(Number(length));const read=await h.read(bytes,0,bytes.length,8);if(read.bytesRead!==bytes.length)throw Error('Cabeçalho incompleto.');
  const data=JSON.parse(bytes.toString('utf8'));const entries=Object.entries(data).filter(([k])=>k!=='__metadata__');
  if(entries.length>100000)throw Error('Checkpoint contém entradas demais.');
  const widths={F16:2,BF16:2,F32:4,F64:8,I64:8,I32:4,I16:2,I8:1,U8:1,BOOL:1};const spans=[];
  for(const [name,t]of entries){
   if(!t||!widths[t.dtype]||!Array.isArray(t.shape)||t.shape.some(n=>!Number.isSafeInteger(n)||n<1)||!Array.isArray(t.data_offsets)||t.data_offsets.length!==2)throw Error('Tensor incompatível no checkpoint.');
   const [start,end]=t.data_offsets;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end>size-8-bytes.length)throw Error('Checkpoint incompleto ou corrompido.');
   const n=t.shape.reduce((a,b)=>a*BigInt(b),BigInt(widths[t.dtype]));if(n!==BigInt(end-start))throw Error('Tamanho de tensor incorreto.');spans.push([start,end]);
  }
  spans.sort((a,b)=>a[0]-b[0]);for(let i=1;i<spans.length;i++)if(spans[i][0]<spans[i-1][1])throw Error('Tensores sobrepostos.');
  const keys=entries.map(([k])=>k);
  if(keys.some(k=>/lora_(up|down)|lora_[AB]/i.test(k)))throw Error('Este arquivo é um LoRA; importe um checkpoint SDXL completo.');
  const has=(part)=>keys.some(k=>k.includes(part));
  const clipL=entries.find(([k])=>/conditioner\.embedders\.0.*token_embedding\.weight$/.test(k));
  const clipG=entries.find(([k])=>/conditioner\.embedders\.1.*token_embedding\.weight$/.test(k));
  if(!has('model.diffusion_model.input_blocks.')||!has('first_stage_model.decoder.')||!clipL||!clipG||clipL[1].shape.length!==2||clipG[1].shape.length!==2||clipL[1].shape[0]!==49408||clipG[1].shape[0]!==49408||clipL[1].shape[1]!==768||clipG[1].shape[1]!==1280||![clipL[1].dtype,clipG[1].dtype].every(d=>['F16','BF16','F32'].includes(d)))throw Error('Requer checkpoint SDXL Base/Illustrious completo com CLIP-L, CLIP-G, UNet e VAE. Pacotes MNN e modelos GGUF de conversa não são compatíveis.');
  return {architecture:'sdxl',bytes:size,tensors:entries.length,metadata:typeof data.__metadata__==='object'?data.__metadata__:{}};
 }finally{await h.close();}
}
async function inspectGguf(file){const h=await fsp.open(file,'r');try{const b=Buffer.alloc(8);await h.read(b,0,8,0);const stat=await h.stat();if(b.toString('ascii',0,4)!=='GGUF'||![2,3].includes(b.readUInt32LE(4))||stat.size<1024)throw Error('Arquivo GGUF inválido.');return{bytes:stat.size,architecture:'gguf'};}finally{await h.close();}}
function atomicJson(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.part';fs.writeFileSync(temp,JSON.stringify(value,null,2),{mode:0o600});fs.renameSync(temp,file);}
function readJson(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}}
module.exports={inspectSdxl,inspectGguf,atomicJson,readJson};
