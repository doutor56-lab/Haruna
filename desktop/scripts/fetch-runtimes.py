"""Build-time only: immutable public native releases, mandatory SHA-256, no models."""
import hashlib,json,os,shutil,tempfile,urllib.request,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
PINS={
 'cpu':('leejet/stable-diffusion.cpp','master-1052-f5df5f8','sd-master-f5df5f8-bin-win-cpu-x64.zip','e270ea153b46229aca3db951ea96fd8f8aa3dbdf9bb3c58faa7cf4454263732a'),
 'vulkan':('leejet/stable-diffusion.cpp','master-1052-f5df5f8','sd-master-f5df5f8-bin-win-vulkan-x64.zip','2247d5e17fc9d426dfbe0bdd164ccd557a11049f4e61071caade3a3f069f6f6d'),
 'llama':('ggml-org/llama.cpp','b12130','llama-b12130-bin-win-cpu-x64.zip','6a6e4de5f649782accd4770ee1651f95d1765af512d96b10f6f99ad3b84c78a7')
}
def main():
 destination=ROOT/'runtimes';destination.mkdir(exist_ok=True)
 for kind,(repo,tag,name,sha) in PINS.items():
  target=destination/kind
  with tempfile.TemporaryDirectory(prefix='haruna-runtime-') as tmp:
   archive=Path(tmp)/name;url=f'https://github.com/{repo}/releases/download/{tag}/{name}'
   urllib.request.urlretrieve(url,archive)
   if hashlib.file_digest(archive.open('rb'),'sha256').hexdigest()!=sha:raise ValueError('Native runtime SHA mismatch: '+kind)
   stage=Path(tmp)/'stage';stage.mkdir()
   with zipfile.ZipFile(archive) as z:
    for info in z.infolist():
     parts=Path(info.filename).parts
     if len(parts)!=1 or '..' in parts or info.is_dir() or info.file_size>300*1024*1024:raise ValueError('Unsafe release entry')
     if info.filename.lower().endswith('.dll') or info.filename.lower().endswith('.txt') or info.filename.startswith('LICENSE') or info.filename==('llama-server.exe' if kind=='llama' else 'sd-cli.exe'):
      with z.open(info) as source,(stage/info.filename).open('wb') as out:shutil.copyfileobj(source,out)
   if target.exists():shutil.rmtree(target)
   shutil.copytree(stage,target)
   (target/'BUILD_METADATA.json').write_text(json.dumps({'repository':repo,'tag':tag,'archiveSha256':sha,'url':url,'platform':'win32-x64'},indent=2))
   print('Verified native runtime:',kind,tag,flush=True)
if __name__=='__main__':main()
