"""Reproduce the existing reference ZIP; download/verify data only, never infer."""
import argparse,concurrent.futures,hashlib,json,shutil,time,urllib.request,zipfile
from pathlib import Path
HERE=Path(__file__).resolve().parent
META=json.loads((HERE/'package-metadata.json').read_text())
MANIFEST=HERE/'haruna-image-model.json'

def sha(path):
    with path.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()

def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path);p.add_argument('--output',type=Path,default=Path('out'));a=p.parse_args();a.output.mkdir(parents=True,exist_ok=True)
    assets=a.output/'components';assets.mkdir(exist_ok=True)
    manifest=json.loads(MANIFEST.read_text());assert manifest['engine']=='mnn' and manifest['architecture']=='sd15'
    def fetch(name):
        spec=META['files'][name]
        if name=='tokenizer.mtok':path=HERE/name
        elif a.source:path=a.source/name
        else:
            path=assets/name
            for attempt in range(3):
                try:
                    req=urllib.request.Request(META['baseUrl']+'/'+name,headers={'User-Agent':'Haruna-model-delivery'})
                    with urllib.request.urlopen(req,timeout=120) as r,path.open('wb') as out:shutil.copyfileobj(r,out,1024*1024)
                    break
                except Exception:
                    path.unlink(missing_ok=True)
                    if attempt==2:raise
                    time.sleep(2*(attempt+1))
        assert path.stat().st_size==spec['size'] and sha(path)==manifest['files'][name],f'Integrity mismatch: {name}'
        print('Verified:',name,flush=True)
        return name,path
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:files=dict(pool.map(fetch,manifest['files']))
    assert sha(MANIFEST)==META['manifestSha256']
    dest=a.output/'SD15-MNN-CPU-referencia.zip'
    with zipfile.ZipFile(dest,'w',compression=zipfile.ZIP_STORED,allowZip64=True) as z:
        for e in META['entries']:
            name=e['filename'];path=MANIFEST if name=='haruna-image-model.json' else files[name]
            info=zipfile.ZipInfo(name,tuple(e['date_time']))
            for key in ['compress_type','create_system','create_version','extract_version','internal_attr','external_attr']:setattr(info,key,e[key])
            info.file_size=path.stat().st_size
            with path.open('rb') as src,z.open(info,'w') as out:shutil.copyfileobj(src,out,1024*1024)
    with zipfile.ZipFile(dest) as z:assert len(z.namelist())==8 and z.testzip() is None
    actual=sha(dest);assert dest.stat().st_size==META['size'] and actual==META['sha256'],'Package bytes differ from the checked reference'
    (a.output/'MODEL_SHA256.txt').write_text(actual+'  '+dest.name+'\n')
    print('PACKAGE VERIFIED:',dest.name,dest.stat().st_size,actual,flush=True)
if __name__=='__main__':main()
