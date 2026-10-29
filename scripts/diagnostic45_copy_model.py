"""Explicit one-time byte copy from debug Haruna into isolated diagnostic sandbox. No deletion."""
import argparse
import shlex
import subprocess
from pathlib import PurePosixPath


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--serial',required=True);parser.add_argument('--source-model',required=True)
    args=parser.parse_args();path=PurePosixPath(args.source_model)
    if path.is_absolute() or '..' in path.parts or path.parts[0]!='files' or path.suffix.lower()!='.gguf':
        raise SystemExit('Provide a relative files/...gguf path from the ORIGINAL app')
    adb=['adb','-s',args.serial];package='com.proxyslabs.haruna.diagnostic45'
    target='files/diagnostic45.gguf'
    check=subprocess.run(adb+['shell',shlex.join(['run-as',package,'test','-e',target])],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    def digest(package_name, file_name):
        command=shlex.join(['run-as',package_name,'sha256sum',file_name])
        value=subprocess.run(adb+['exec-out',command],check=True,stdout=subprocess.PIPE).stdout.decode().split()[0]
        if len(value)!=64 or any(c not in '0123456789abcdef' for c in value):raise SystemExit('Invalid SHA-256 output')
        return value
    expected=digest('com.proxyslabs.haruna',str(path))
    if check.returncode==0:
        if digest(package,target)!=expected:raise SystemExit('Existing diagnostic GGUF differs. No files overwritten; use the correct sandbox copy.')
        print('Reusing byte-identical diagnostic GGUF. No second copy. SHA-256:',expected)
        return
    # No shell interpolation of model paths, and no model bytes retained in host RAM.
    source=subprocess.Popen(adb+['exec-out',shlex.join(['run-as','com.proxyslabs.haruna','cat',str(path)])],stdout=subprocess.PIPE)
    command='mkdir -p files && cat > files/diagnostic45.gguf.part'
    dest=subprocess.run(adb+['shell','-T',shlex.join(['run-as',package,'sh','-c',command])],stdin=source.stdout)
    source.stdout.close();source_code=source.wait()
    if source_code or dest.returncode:raise SystemExit('Copy failed. Original app untouched; diagnostic .part is incomplete.')
    subprocess.run(adb+['shell',shlex.join(['run-as',package,'mv','files/diagnostic45.gguf.part',target])],check=True)
    if digest(package,target)!=expected:raise SystemExit('Copied SHA-256 differs; do not run or compare this file.')
    print('Byte-identical copy only to diagnostic sandbox. Original GGUF/data unchanged. SHA-256:',expected)


if __name__=='__main__':main()
