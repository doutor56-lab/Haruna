"""Create a Haruna SD1.5/MNN install package. Does not convert or claim model compatibility."""
import argparse,hashlib,json,zipfile
from pathlib import Path
required={'text_encoder.mnn','unet.mnn','vae_decoder.mnn','tokenizer.mtok'}
allowed=required|{'text_encoder.mnn.weight','unet.mnn.weight','vae_decoder.mnn.weight'}
def package(source,output,name):
 files={p.name:p for p in source.iterdir() if p.is_file() and p.name in allowed}
 if not required<=files.keys():raise ValueError('Missing: '+str(required-files.keys()))
 manifest={'version':1,'architecture':'sd15','engine':'mnn','displayName':name,'files':{}}
 for n,p in files.items():
  if not p.stat().st_size:raise ValueError('Empty component: '+n)
  with p.open('rb') as f:manifest['files'][n]=hashlib.file_digest(f,'sha256').hexdigest()
 with zipfile.ZipFile(output,'x',compression=zipfile.ZIP_STORED,allowZip64=True) as z:
  for n,p in files.items():z.write(p,n)
  z.writestr('haruna-image-model.json',json.dumps(manifest,ensure_ascii=False))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--name',default='SD1.5 MNN');a=p.parse_args();package(a.source,a.output,a.name)
