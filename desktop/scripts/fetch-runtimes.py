"""Build-time only: immutable public native releases, mandatory SHA-256, no models."""
import hashlib,json,os,shutil,tempfile,urllib.request,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
PINS={
 'cpu':('leejet/stable-diffusion.cpp','master-1052-f5df5f8','sd-master-f5df5f8-bin-win-cpu-x64.zip','e270ea153b46229aca3db951ea96fd8f8aa3dbdf9bb3c58faa7cf4454263732a'),
 'vulkan':('leejet/stable-diffusion.cpp','master-1052-f5df5f8','sd-master-f5df5f8-bin-win-vulkan-x64.zip','2247d5e17fc9d426dfbe0bdd164ccd557a11049f4e61071caade3a3f069f6f6d'),
 'llama-vulkan':('ggml-org/llama.cpp','b12130','llama-b12130-bin-win-vulkan-x64.zip','200fee57ee0561bf1e875d591e0e307abf68589e6aab3bd4f172d50e3ca15e9d'),
 'llama':('ggml-org/llama.cpp','b12130','llama-b12130-bin-win-cpu-x64.zip','6a6e4de5f649782accd4770ee1651f95d1765af512d96b10f6f99ad3b84c78a7')
}
def main():
 destination=ROOT/'runtimes';destination.mkdir(exist_ok=True)
 assets={
  'silero_vad.int8.onnx':('https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.int8.onnx','c36d490aff5ab924ca6c7aeec4d8f6bd3d22db6fa17611b9c5b17eae58ac3a20'),
  'tessdata/eng.traineddata':('https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/87416418657359cb625c412a48b6e1d6d41c29bd/eng.traineddata','7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2'),
  'tessdata/por.traineddata':('https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/87416418657359cb625c412a48b6e1d6d41c29bd/por.traineddata','c4932b937207a9514b7514d518b931a99938c02a28a5a5a553f8599ed58b7deb')
 }
 for name,(url,sha) in assets.items():
  target=destination/'assets'/name;target.parent.mkdir(parents=True,exist_ok=True)
  if target.exists() and hashlib.file_digest(target.open('rb'),'sha256').hexdigest()==sha:continue
  part=target.with_suffix(target.suffix+'.part')
  try:
   urllib.request.urlretrieve(url,part)
   if hashlib.file_digest(part.open('rb'),'sha256').hexdigest()!=sha:raise ValueError('Asset SHA mismatch: '+name)
   os.replace(part,target)
  finally:part.unlink(missing_ok=True)
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
     if info.filename.lower().endswith('.dll') or info.filename.lower().endswith('.txt') or info.filename.startswith('LICENSE') or info.filename==('llama-server.exe' if kind.startswith('llama') else 'sd-cli.exe'):
      with z.open(info) as source,(stage/info.filename).open('wb') as out:shutil.copyfileobj(source,out)
   if target.exists():shutil.rmtree(target)
   shutil.copytree(stage,target)
   (target/'BUILD_METADATA.json').write_text(json.dumps({'repository':repo,'tag':tag,'archiveSha256':sha,'url':url,'platform':'win32-x64'},indent=2))
   print('Verified native runtime:',kind,tag,flush=True)
if __name__=='__main__':main()
