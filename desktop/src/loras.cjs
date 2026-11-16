"use strict";
const{inspectSafetensors}=require('./models.cjs');
function inspectLoraTensors(t,metadata={}){
 const keys=Object.keys(t),down=/\.(lora_down|lora_A(?:\.default)?)\.weight$/;let pairs=0;
 for(const name of keys){const m=name.match(down);if(!m)continue;const other=name.replace(down,'.'+(m[1]==='lora_down'?'lora_up':m[1].replace('lora_A','lora_B'))+'.weight'),a=t[name],b=t[other];if(!b||![2,4].includes(a.shape.length)||b.shape.length!==a.shape.length||a.shape[0]!==b.shape[1]||![a,b].every(x=>['F16','BF16','F32'].includes(x.dtype)))throw Error('Par LoRA incompleto ou incompatível.');pairs++;}
 if(!pairs||keys.some(k=>!/(?:\.(?:lora_down|lora_up|lora_[AB](?:\.default)?)\.weight|\.alpha)$/.test(k)))throw Error('Use LoRA convencional safetensors; LoHa, LoKr, DoRA e checkpoints completos não são adaptadores compatíveis.');
 const declared=[metadata.ss_base_model_version,metadata['modelspec.architecture']].filter(x=>typeof x==='string').join(' ').toLowerCase(),names=keys.join(' ');
 let family=/anima/.test(declared)||/llm_adapter/.test(names)?'anima':/flux/.test(declared)||/double_blocks|single_blocks/.test(names)?'flux1':/sdxl|stable-diffusion-xl/.test(declared)||/lora_te2/.test(names)?'sdxl':/sd_v1|stable-diffusion-v1|sd1[._-]?5/.test(declared)?'sd15':null;
 if(!family)for(const name of keys.filter(n=>/attn2_to_[kv]\.lora_down/.test(n))){const width=t[name].shape[1];if(width===768)family='sd15';if(width===2048)family='sdxl';}
 if(!family)throw Error('Família do LoRA não identificada com segurança; use um adaptador com metadados de arquitetura.');return{family,pairs};
}
async function inspectLora(file){const info=await inspectSafetensors(file);if(info.bytes>2*1024**3)throw Error('LoRA excede 2 GiB.');return{...inspectLoraTensors(info.tensorMap,info.metadata),bytes:info.bytes};}
const family=architecture=>String(architecture).startsWith('flux1-')?'flux1':architecture;
function selections(items,catalog,architecture){if(!Array.isArray(items)||items.length>4)throw Error('Use até quatro LoRAs.');const seen=new Set();return items.map(x=>{const m=catalog.find(m=>m.id===x.id);if(!m||seen.has(x.id)||m.family!==family(architecture)||!Number.isFinite(x.weight)||x.weight===0||Math.abs(x.weight)>2)throw Error('LoRA ausente, duplicado, incompatível ou força inválida (-2 a 2, exceto zero).');seen.add(x.id);return{id:m.id,weight:x.weight};});}
function rejectedLog(text){return text.split(/\r?\n/).some(raw=>{const line=raw.replace(/\x1b\[[0-9;]*m/g,'');return / --- (?:lora\.hpp|diffusion_engine\.cpp|model_manager\.cpp):\d+$/.test(line)&&/(?:Only \(\d+ \/ \d+\)|\(0 \/ \d+\)) LoRA tensors have been applied|incompatible LoRA tensors have been skipped|LoRA graph execution failed|load lora tensors from .* failed|required lora load failed/.test(line);});}
module.exports={rejectedLog,inspectLora,inspectLoraTensors,selections,family};
