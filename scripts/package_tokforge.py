from pathlib import Path
import urllib.request,json,hashlib,concurrent.futures,zipfile
root=Path('delivery/TokForge-SD15-LCM-MNN');root.mkdir(parents=True,exist_ok=True)
rev='aa60a0837fd9823f4cd106e4281b98581e5946ff';items=json.load(urllib.request.urlopen('https://huggingface.co/api/models/darkmaniac7/TokForge-SD15-LCM-MNN/tree/'+rev+'?recursive=true',timeout=30))
def fetch(x):
 name=x['path'];assert '/' not in name and '\\' not in name and name not in ('..','.');p=root/name
 if name=='.gitattributes':return
 expected=x.get('lfs',{}).get('oid')
 def sha(p):
  h=hashlib.sha256()
  with p.open('rb') as f:
   for b in iter(lambda:f.read(1048576),b''):h.update(b)
  return h.hexdigest()
 if not p.exists() or p.stat().st_size!=x['size'] or expected and sha(p)!=expected:
  tmp=p.with_name(p.name+'.part')
  with urllib.request.urlopen('https://huggingface.co/darkmaniac7/TokForge-SD15-LCM-MNN/resolve/'+rev+'/'+name,timeout=120) as src,tmp.open('wb') as out:
   for b in iter(lambda:src.read(1048576),b''):out.write(b)
  assert tmp.stat().st_size==x['size'],name
  if expected:assert sha(tmp)==expected,name
  tmp.replace(p)
 print('VERIFIED',name,p.stat().st_size,flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:list(ex.map(fetch,items))
# Include the authoritative license text and retain all upstream attributions in README.
for filename,url in [('LICENSE-CreativeML-OpenRAIL-M.txt','https://raw.githubusercontent.com/CompVis/stable-diffusion/main/LICENSE'),('LICENSE-LCM-OpenRAIL++.txt','https://raw.githubusercontent.com/Stability-AI/generative-models/main/model_licenses/LICENSE-SDXL1.0')]:
 with urllib.request.urlopen(url,timeout=30) as src:(root/filename).write_bytes(src.read())
(root/'SOURCE.txt').write_text('Original: https://huggingface.co/darkmaniac7/TokForge-SD15-LCM-MNN\nRevision: '+rev+'\nOriginal weights unchanged. Archive packaging does not validate Haruna runtime compatibility.\n')
(root/'SHA256SUMS.txt').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name+'\n' for p in sorted(root.iterdir()) if p.is_file() and p.name!='SHA256SUMS.txt'))
archive=Path('delivery/TokForge-SD15-LCM-MNN.zip')
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=1,allowZip64=True) as z:
 for p in sorted(root.iterdir()):z.write(p,p.name)
with zipfile.ZipFile(archive) as z:assert z.testzip() is None
h=hashlib.sha256()
with archive.open('rb') as f:
 for b in iter(lambda:f.read(1048576),b''):h.update(b)
Path('delivery/TokForge-SD15-LCM-MNN.zip.sha256').write_text(h.hexdigest()+'  '+archive.name+'\n')
print('ZIP_READY',archive.stat().st_size,h.hexdigest(),flush=True)
