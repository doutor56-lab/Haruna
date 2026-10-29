"""Explicit connected-device canonical run; does NOT install/uninstall APKs or delete app data."""
import argparse
import json
from pathlib import Path
import shlex
import subprocess
import sys

PACKAGE='com.proxyslabs.haruna.diagnostic45'
RUNNER=PACKAGE+'.test/com.proxyslabs.haruna.diagnostic45.CanonicalRunner'


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--serial',required=True);p.add_argument('--model',required=True,help='Path relative to app files/, same installed GGUF')
    p.add_argument('--out',required=True);p.add_argument('--probes',default='')
    args=p.parse_args();out=Path(args.out)
    if out.exists():raise SystemExit('Choose a NEW output directory; previous evidence is never overwritten')
    indices=[int(n) for n in args.probes.split(',') if n]
    if len(indices)>2 or any(n<1 or n>512 for n in indices):raise SystemExit('At most two indices in 1..512')
    adb=['adb','-s',args.serial]
    def shell(command):return subprocess.run(adb+['shell',shlex.join(command)],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE).stdout
    # Explicit test command stops only this app; it never clears data or starts the chat Activity.
    shell(['am','force-stop',PACKAGE])
    command=['am','instrument','-w','-r','-e','model',args.model,'-e','probes',args.probes,RUNNER]
    print(shell(command).decode(errors='replace'))
    out.mkdir(parents=True)
    data=subprocess.run(adb+['exec-out','run-as',PACKAGE,'cat','cache/diagnostic45/result.json'],check=True,stdout=subprocess.PIPE).stdout
    (out/'result.json').write_bytes(data)
    result=json.loads(data)
    for name in ['runner.json','metadata.json','input.json','tokens.jsonl']:
        read=subprocess.run(adb+['exec-out','run-as',PACKAGE,'cat','cache/diagnostic45/'+name],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        if read.returncode==0:(out/name).write_bytes(read.stdout)
    if not result.get('ok'):raise SystemExit('Diagnostic failed/incomplete. Preserve evidence; do not compare partial tokens.')
    rows=[json.loads(line) for line in (out/'tokens.jsonl').read_text().splitlines()]
    for row in rows:
        if 'logitsFile' in row:
            name='logits-'+str(row['index'])+'.f32'
            if row['logitsFile']!=name:raise SystemExit('Unexpected diagnostic filename')
            file=subprocess.run(adb+['exec-out','run-as',PACKAGE,'cat','cache/diagnostic45/'+name],check=True,stdout=subprocess.PIPE)
            (out/name).write_bytes(file.stdout)
    lines=[]
    for row in rows:
        text=json.dumps(row.get('pieceText','<fragment bytes '+row['pieceHex']+'>'),ensure_ascii=False)
        lines.append(f'TOKEN {row["index"]:04d} | id={row["id"]} | {text} | pos={row["position"]} | logit={row.get("rawLogit")} | p={row.get("probability")}')
    (out/'tokens.txt').write_text('\n'.join(lines)+'\n')
    print('Saved canonical evidence:',out)


if __name__=='__main__':main()
