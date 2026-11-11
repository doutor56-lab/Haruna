'use strict';
const fs=require('node:fs');const fsp=fs.promises;const path=require('node:path');
// Container/shape validation is deliberately separate from native inference.
async function inspectSafetensors(file){
 const h=await fsp.open(file,'r');try{
  const {size}=await h.stat();if(size<16)throw Error('Checkpoint incompleto.');
  const head=Buffer.alloc(8);await h.read(head,0,8,0);const length=head.readBigUInt64LE();
  if(length<2n||length>16n*1024n*1024n||length>BigInt(size-8))throw Error('Arquivo safetensors inválido.');
  const bytes=Buffer.alloc(Number(length));const read=await h.read(bytes,0,bytes.length,8);if(read.bytesRead!==bytes.length)throw Error('Cabeçalho incompleto.');
  const data=JSON.parse(bytes.toString('utf8'));const entries=Object.entries(data).filter(([k])=>k!=='__metadata__');
  if(entries.length>100000)throw Error('Checkpoint contém entradas demais.');
  const widths={F16:2,BF16:2,F32:4,F64:8,F8_E4M3:1,F8_E5M2:1,I64:8,I32:4,I16:2,I8:1,U8:1,BOOL:1};const spans=[];
  for(const [name,t]of entries){
   if(!t||!widths[t.dtype]||!Array.isArray(t.shape)||t.shape.some(n=>!Number.isSafeInteger(n)||n<1)||!Array.isArray(t.data_offsets)||t.data_offsets.length!==2)throw Error('Tensor incompatível no checkpoint.');
   const [start,end]=t.data_offsets;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end>size-8-bytes.length)throw Error('Checkpoint incompleto ou corrompido.');
   const n=t.shape.reduce((a,b)=>a*BigInt(b),BigInt(widths[t.dtype]));if(n!==BigInt(end-start))throw Error('Tamanho de tensor incorreto.');spans.push([start,end]);
  }
  spans.sort((a,b)=>a[0]-b[0]);let cursor=0;for(const span of spans){if(span[0]!==cursor)throw Error('Tensores sobrepostos ou dados não contíguos.');cursor=span[1];}if(cursor!==size-8-bytes.length)throw Error('Checkpoint contém dados extras.');
  return {bytes:size,tensors:entries.length,tensorMap:Object.fromEntries(entries),metadata:typeof data.__metadata__==='object'?data.__metadata__:{}};
 }finally{await h.close();}
}
async function inspectGguf(file){const h=await fsp.open(file,'r');try{const b=Buffer.alloc(8);await h.read(b,0,8,0);const stat=await h.stat();if(b.toString('ascii',0,4)!=='GGUF'||![2,3].includes(b.readUInt32LE(4))||stat.size<1024)throw Error('Arquivo GGUF inválido.');return{bytes:stat.size,architecture:'gguf'};}finally{await h.close();}}
function atomicJson(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.part';fs.writeFileSync(temp,JSON.stringify(value,null,2),{mode:0o600});fs.renameSync(temp,file);}
function readJson(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}}
async function inspectSdxl(file){
 const info=await inspectSafetensors(file),t=info.tensorMap;
 if(Object.keys(t).some(k=>/lora_(up|down)|lora_[AB]/i.test(k)))throw Error('Este arquivo é um LoRA; importe um checkpoint completo.');
 const shape=(suffix,dims)=>Object.entries(t).some(([n,v])=>n.endsWith(suffix)&&JSON.stringify(v.shape)===JSON.stringify(dims)&&['F16','BF16','F32'].includes(v.dtype));
 const vae=shape('first_stage_model.decoder.conv_out.weight',[3,128,3,3]);
 const input=shape('model.diffusion_model.input_blocks.0.0.weight',[320,4,3,3]);
 const l=Object.entries(t).some(([n,v])=>n.startsWith('conditioner.embedders.0.')&&n.endsWith('token_embedding.weight')&&JSON.stringify(v.shape)==='[49408,768]'&&['F16','BF16','F32'].includes(v.dtype));
 const g=Object.entries(t).some(([n,v])=>n.startsWith('conditioner.embedders.1.')&&n.endsWith('token_embedding.weight')&&JSON.stringify(v.shape)==='[49408,1280]'&&['F16','BF16','F32'].includes(v.dtype));
 const xl=input&&vae&&l&&g&&Object.entries(t).some(([n,v])=>n.endsWith('attn2.to_k.weight')&&v.shape.length===2&&v.shape[1]===2048);
 const sd15=input&&vae&&shape('cond_stage_model.transformer.text_model.embeddings.token_embedding.weight',[49408,768])&&shape('cond_stage_model.transformer.text_model.embeddings.position_embedding.weight',[77,768])&&shape('model.diffusion_model.input_blocks.1.1.transformer_blocks.0.attn2.to_k.weight',[320,768])&&shape('first_stage_model.post_quant_conv.weight',[4,4,1,1]);
 if(!xl&&!sd15)throw Error('Requer checkpoint SD1.5 ou SDXL/Illustrious completo; FLUX.1 requer os quatro componentes.');
 const {tensorMap,...result}=info;return {...result,architecture:xl?'sdxl':'sd15'};
}
module.exports={inspectSdxl,inspectSafetensors,inspectGguf,atomicJson,readJson};
