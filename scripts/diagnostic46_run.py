"""Runs ONLY the installed diagnostic sandbox; mandatory GGUF and APK identity gates. No copy/install/download."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shlex
import subprocess
import uuid
from diagnostic46_profiles import BUILT

PACKAGE='com.proxyslabs.haruna.diagnostic45'
RUNNER=PACKAGE+'.test/com.proxyslabs.haruna.diagnostic45.CanonicalRunner'


def expected_identity(args):
    if args.reference45:
        identity=json.loads((Path(args.reference45)/'runner.json').read_text(encoding='utf-8'))
        digest=identity['modelSha256'];size=identity['modelBytes']
        if args.expected_sha256 and args.expected_sha256.lower()!=digest.lower():raise ValueError('Reference and supplied SHA differ')
        if args.expected_bytes and args.expected_bytes!=size:raise ValueError('Reference and supplied size differ')
    else:digest=args.expected_sha256 or '';size=args.expected_bytes or 0
    if not re.fullmatch('[0-9a-fA-F]{64}',digest) or size<=1024*1024:
        raise ValueError('Known expected SHA-256 and size (>1 MiB), or reference45 runner.json, required')
    return digest.lower(),size


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--serial',required=True);parser.add_argument('--variant',required=True,choices=BUILT)
    parser.add_argument('--bundle',required=True,help='Extracted artifact with BUILD_MATRIX.json')
    parser.add_argument('--out',required=True);parser.add_argument('--probes',default='')
    parser.add_argument('--expected-sha256');parser.add_argument('--expected-bytes',type=int);parser.add_argument('--reference45')
    args=parser.parse_args();out=Path(args.out)
    if out.exists():raise SystemExit('New output directory required; previous evidence never overwritten')
    digest,size=expected_identity(args)
    probes=[int(i) for i in args.probes.split(',') if i]
    if len(probes)>2 or any(i<1 or i>512 for i in probes):raise SystemExit('At most two capture indices in 1..512')
    matrix=json.loads((Path(args.bundle)/'BUILD_MATRIX.json').read_text(encoding='utf-8'))
    entry=next(e for e in matrix['variants'] if e['name']==args.variant)
    if entry['build_result']!='SUCCESS' or entry['isolation_status']=='ISOLATION_INVALID':raise SystemExit('Variant not a validated build')
    adb=['adb','-s',args.serial]
    def shell(command):return subprocess.run(adb+['shell',shlex.join(command)],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE).stdout
    # Text-only preflight; no binary transport or shell redirection. Phone repeats these gates before loading native code/model.
    observed_size=int(shell(['run-as',PACKAGE,'stat','-c','%s','files/diagnostic45.gguf']).decode('ascii').strip())
    observed_sha=shell(['run-as',PACKAGE,'sha256sum','files/diagnostic45.gguf']).decode('utf-8').split()[0].lower()
    if observed_size!=size or observed_sha!=digest:raise SystemExit(f'GGUF SIZE/SHA MISMATCH: expected {size} bytes / {digest}; observed {observed_size} bytes / {observed_sha}. No inference, copy or replacement requested.')
    installed=shell(['pm','path',PACKAGE]).decode('utf-8').strip().splitlines()
    if len(installed)!=1 or not installed[0].startswith('package:'):raise SystemExit('Unexpected APK/split layout')
    remote_apk=installed[0][8:]
    apk_sha=shell(['run-as',PACKAGE,'sha256sum',remote_apk]).decode('utf-8').split()[0].lower()
    if apk_sha!=entry['hashes']['app-debug.apk']:raise SystemExit('Installed APK does not match requested variant/artifact')
    out.mkdir(parents=True,exist_ok=False);run_id='r46_'+uuid.uuid4().hex
    (out/'request.json').write_text(json.dumps({'variant':args.variant,'runId':run_id,'expectedSha256':digest,'expectedBytes':size,'apkSha256':apk_sha},indent=2)+'\n',encoding='utf-8')
    shell(['am','force-stop',PACKAGE])
    command=['am','instrument','-w','-r','-e','model','diagnostic45.gguf','-e','expectedSha256',digest,
        '-e','expectedBytes',str(size),'-e','runId',run_id,'-e','probes',args.probes,RUNNER]
    execution=subprocess.run(adb+['shell',shlex.join(command)],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    (out/'instrumentation.txt').write_bytes(execution.stdout+execution.stderr)
    remote='cache/diagnostic46/'+run_id+'/'
    # subprocess stdout -> binary file handle: Windows-safe, no PowerShell/text-mode conversion.
    def export(name):
        with (out/name).open('xb') as file:
            result=subprocess.run(adb+['exec-out',shlex.join(['run-as',PACKAGE,'cat',remote+name])],stdout=file,stderr=subprocess.PIPE)
        if result.returncode:(out/name).unlink();return False
        return True
    for name in ('result.json','runner.json','metadata.json','input.json','tokens.jsonl'):export(name)
    for point in probes:export('logits-'+str(point)+'.f32')
    if not (out/'result.json').exists():raise SystemExit('No final result. Partial evidence preserved; no retry or deletion on phone.')
    result=json.loads((out/'result.json').read_text(encoding='utf-8'))
    if not result.get('ok'):raise SystemExit('Run failed; partial evidence retained. Do not classify as completed inference.')
    identity=json.loads((out/'runner.json').read_text(encoding='utf-8'))
    meta=json.loads((out/'metadata.json').read_text(encoding='utf-8'))
    if identity['modelSha256']!=digest or identity['modelBytes']!=size:raise SystemExit('Phone model identity mismatch')
    if identity['apkSha256']!=entry['hashes']['app-debug.apk'] or identity['testApkSha256']!=entry['hashes']['app-debug-androidTest.apk']:
        raise SystemExit('Runtime APK identity mismatch')
    if meta['testMode']!=args.variant or meta['build46']['harunaCommit']!=entry['commit']:raise SystemExit('Runtime build provenance mismatch')
    rows=[json.loads(line) for line in (out/'tokens.jsonl').read_text(encoding='utf-8').splitlines() if line]
    text=[]
    for row in rows:
        piece=json.dumps(row.get('pieceText','<bytes '+row['pieceHex']+'>'),ensure_ascii=False)
        text.append(f'TOKEN {row["index"]:04d} | id={row["id"]} | {piece} | pos={row["position"]} | logit={row.get("rawLogit")} | p={row.get("probability")}')
    (out/'tokens.txt').write_text('\n'.join(text)+'\n',encoding='utf-8')
    print('Saved verified',args.variant,'evidence to',out,'; original Haruna and older evidence untouched.')


if __name__=='__main__':main()
