"""Sparse structural fixtures ONLY. These are not trained weights and must never run inference."""
import hashlib,json,struct,sys,zipfile
from pathlib import Path
root=Path(sys.argv[1]);root.mkdir(parents=True,exist_ok=True)
def safetensors(name,tensors):
    header={};offset=0
    for key,shape in tensors.items():
        size=2
        for n in shape:size*=n
        header[key]={'dtype':'F16','shape':shape,'data_offsets':[offset,offset+size]};offset+=size
    data=json.dumps(header).encode()
    with (root/name).open('wb') as f:f.write(struct.pack('<Q',len(data)));f.write(data);f.truncate(8+len(data)+offset)
def gguf(name,tensors):
    header=struct.pack('<IIQQ',0x46554747,3,len(tensors),0);offset=0
    for key,shape in tensors.items():
        b=key.encode();kind=2 if shape[-1]%32==0 else 1;block,width=(32,18) if kind==2 else (1,2)
        count=1
        for n in shape:count*=n
        header+=struct.pack('<Q',len(b))+b+struct.pack('<I',len(shape))+b''.join(struct.pack('<Q',n) for n in reversed(shape))+struct.pack('<IQ',kind,offset)
        offset=(offset+count//block*width+31)//32*32
    data=(len(header)+31)//32*32
    with (root/name).open('wb') as f:f.write(header);f.truncate(data+offset)
gguf('diffusion.gguf',{'img_in.weight':[3072,64],'txt_in.weight':[3072,4096],'double_blocks.0.img_attn.qkv.weight':[9216,3072],'double_blocks.18.fixture':[1],'single_blocks.37.fixture':[1]})
safetensors('clip_l.safetensors',{'text_model.embeddings.token_embedding.weight':[49408,768]})
gguf('t5xxl.gguf',{'shared.weight':[32128,4096]})
safetensors('ae.safetensors',{'decoder.conv_in.weight':[512,16,3,3],'decoder.conv_out.weight':[3,128,3,3]})
files={f.name:hashlib.file_digest(f.open('rb'),'sha256').hexdigest() for f in root.iterdir() if f.name.endswith(('.gguf','.safetensors'))}
(root/'haruna-image-model.json').write_text(json.dumps({'version':1,'engine':'stable-diffusion.cpp','format':'sdcpp_components_v1','architecture':'flux1-schnell','files':files}))
with zipfile.ZipFile(root.with_suffix('.zip'),'w',compression=zipfile.ZIP_DEFLATED) as z:
    for f in root.iterdir():z.write(f,f.name)
print('Sparse FLUX container fixtures, no trained weights:',root)
