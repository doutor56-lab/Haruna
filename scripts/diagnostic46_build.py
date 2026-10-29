"""Collect actual build evidence and certify primary isolation. No inference or model access."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import zipfile
from diagnostic46_profiles import BASE,CHANGES,BUILT,DEPENDENCY,INITIAL,LLAMA,expected

NATIVE=Path('third_party/llama.cpp/examples/llama.android/lib')
INVARIANTS=['harunaCommit','llamaCommit','abi','androidPlatform','compilerId','compilerVersion','compiler',
            'buildType','cFlags','cxxFlags','cFlagsRelease','cxxFlagsRelease','GGML_NATIVE','GGML_BACKEND_DL','GGML_OPENMP','GGML_LLAMAFILE']


def sha(path):
    digest=hashlib.sha256()
    with Path(path).open('rb') as file:
        for block in iter(lambda:file.read(1048576),b''):digest.update(block)
    return digest.hexdigest()


def cache_values(path):
    values={}
    for line in Path(path).read_text().splitlines():
        match=re.match(r'([^/#][^:]*):([^=]+)=(.*)',line)
        if match:values[match[1]]={'type':match[2],'value':match[3]}
    return values


def collect(mode,root):
    dest=root/mode;dest.mkdir(parents=True,exist_ok=False)
    candidates=[]
    for path in (NATIVE/'.cxx').rglob('haruna46_effective.json'):
        value=json.loads(path.read_text())
        if value['variant']==mode and value['harunaCommit']==os.environ['HARUNA_SOURCE_REVISION']:candidates.append((path,value))
    if len(candidates)!=1:raise ValueError('Expected one exact matching CMake configuration, found '+str(len(candidates)))
    effective_path,effective=candidates[0];builddir=effective_path.parent
    if {key:effective[key] for key in BASE}!=expected(mode):raise ValueError('Effective primary flags do not match isolated profile')
    shutil.copyfile(builddir/'CMakeCache.txt',dest/'CMakeCache.txt')
    shutil.copyfile(effective_path,dest/'effective_config.json')
    commands=json.loads((builddir/'compile_commands.json').read_text())
    representative={}
    for command in commands:
        text=command.get('command') or shlex.join(command['arguments'])
        target=re.search(r'CMakeFiles/(ggml-cpu[^ /]*|ai-chat|llama-common)\.dir',text)
        if not target:continue
        lang='CXX' if command['file'].endswith(('.cpp','.cc','.cxx')) else 'C'
        key=target[1]+':'+lang
        # Use CPU dispatcher / traits and a representative C unit, preserving resolved target flags.
        if key not in representative or command['file'].endswith('/ggml-cpu.cpp'):representative[key]=command
    if not any(k.startswith('ggml-cpu') for k in representative):raise ValueError('No CPU compile commands found')
    shutil.copyfile('app/build/outputs/apk/debug/app-debug.apk',dest/'app-debug.apk')
    shutil.copyfile('app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk',dest/'app-debug-androidTest.apk')
    tools=Path(os.environ['ANDROID_HOME'])/'build-tools/36.0.0'
    signatures=[];packages={};native_hashes={}
    for file in (dest/'app-debug.apk',dest/'app-debug-androidTest.apk'):
        badging=subprocess.check_output([str(tools/'aapt'),'dump','badging',str(file)],text=True)
        package=re.search(r"package: name='([^']+)'",badging)[1];packages[file.name]=package
        signature=subprocess.check_output([str(tools/'apksigner'),'verify','--print-certs',str(file)],text=True)
        signatures.append(next(line for line in signature.splitlines() if 'certificate SHA-256 digest:' in line).split(': ',1)[1])
    if packages!={'app-debug.apk':'com.proxyslabs.haruna.diagnostic45','app-debug-androidTest.apk':'com.proxyslabs.haruna.diagnostic45.test'}:
        raise ValueError('Incorrect sandbox package IDs')
    if len(set(signatures))!=1:raise ValueError('APK/test signing identities differ')
    tree=subprocess.check_output([str(tools/'aapt'),'dump','xmltree',str(dest/'app-debug.apk'),'AndroidManifest.xml'],text=True)
    activities=re.findall(r'E: activity\b.*?(?=\n[ \t]*E:|\Z)',tree,re.S)
    if not any('com.proxyslabs.haruna.MainActivity' in a and re.search(r'android:enabled[^\n]*\(type 0x12\)0x0+\b',a) for a in activities):raise ValueError('Diagnostic Activity is not disabled')
    with zipfile.ZipFile(dest/'app-debug.apk') as apk:
        libs=sorted(n for n in apk.namelist() if n.startswith('lib/arm64-v8a/libggml-cpu'))
        if any(n.lower().endswith('.gguf') for n in apk.namelist()):raise ValueError('Model embedded in APK')
        for name in libs:native_hashes[name]=hashlib.sha256(apk.read(name)).hexdigest()
    if effective['GGML_CPU_ALL_VARIANTS']=='ON':
        if 'lib/arm64-v8a/libggml-cpu-android_armv8.2_2.so' not in libs:raise ValueError('Expected current CPU variants')
    elif libs!=['lib/arm64-v8a/libggml-cpu.so']:raise ValueError('Expected only generic CPU backend')
    meta={'variant':mode,'commit':effective['harunaCommit'],'llamaCommit':LLAMA,'effective':effective,
          'cmakeOptions':cache_values(dest/'CMakeCache.txt'),'compilerCommands':representative,
          'compilerVersionOutput':subprocess.check_output([effective['compiler'],'--version'],text=True),
          'hashes':{p.name:sha(p) for p in (dest/'app-debug.apk',dest/'app-debug-androidTest.apk')},
          'nativeLibraryHashes':native_hashes,'packages':packages,'signingCertificateSha256':signatures[0],
          'build_result':'SUCCESS','inferenceExecuted':False}
    (dest/'build_metadata.json').write_text(json.dumps(meta,indent=2)+'\n')
    (dest/'APK_SHA256SUMS.txt').write_text(''.join(value+'  '+name+'\n' for name,value in meta['hashes'].items()))
    print('COLLECTED',mode,meta['hashes'])


def finalize(root):
    loaded={mode:json.loads((root/mode/'build_metadata.json').read_text()) for mode in BUILT}
    baseline=loaded['A_CURRENT'];entries=[]
    certificates={m['signingCertificateSha256'] for m in loaded.values()}
    if len(certificates)!=1:raise ValueError('Matrix APKs do not share a signing identity')
    for mode,meta in loaded.items():
        a=baseline['effective'];b=meta['effective']
        delta={key:{'before':a[key],'after':b[key]} for key in BASE if a[key]!=b[key]}
        invariant_diff={key:{'before':a[key],'after':b[key]} for key in INVARIANTS if a[key]!=b[key]}
        expected_delta={key:{'before':BASE[key],'after':value} for key,value in CHANGES[mode].items()}
        extra=[]
        ac=baseline['cmakeOptions'];bc=meta['cmakeOptions']
        for key in sorted(set(ac)|set(bc)):
            av=ac.get(key);bv=bc.get(key)
            if av==bv or key in BASE:continue
            if key.startswith(('GGML_','LLAMA_','KLEIDIAI_','FETCHCONTENT_')):
                derived=not (key.startswith(('GGML_','LLAMA_')) and any(v and v['type']=='BOOL' for v in (av,bv)))
                extra.append({'key':key,'before':av,'after':bv,'derivedOrAvailability':derived})
                if not derived:invariant_diff['cache:'+key]={'before':av,'after':bv}
        valid=delta==expected_delta and not invariant_diff
        status=('CONTROL' if mode in ('A_CURRENT','B_CONSERVATIVE') else 'ISOLATED_VALID') if valid else 'ISOLATION_INVALID'
        row={'name':mode,'baseline':'A_CURRENT','modified_variables':delta,'expected_changes':expected_delta,
             'other_differences_detected':extra,'unexpected_differences':invariant_diff,
             'derived_consequences':{'cpuLibraries':sorted(meta['nativeLibraryHashes']),
                 'compileCommandsFile':mode+'/build_metadata.json','note':'ISA/defines/links and available backend files derive from the single primary switch; they are recorded, not extra independent inputs.'},
             'commit':meta['commit'],'llamaCommit':LLAMA,'build_result':'SUCCESS','isolation_status':status,'hashes':meta['hashes']}
        entries.append(row)
    folder=root/'F_ARMV8A_ONLY';folder.mkdir(exist_ok=True)
    log=folder/'CONFIGURATION_FAILURE.log'
    if not log.exists() or 'Cannot use both GGML_CPU_ARM_ARCH and GGML_CPU_ALL_VARIANTS' not in log.read_text(errors='replace'):
        raise ValueError('Missing actual upstream F incompatibility proof')
    for partial in (NATIVE/'.cxx').rglob('CMakeCache.txt'):
        if 'HARUNA_DIAGNOSTIC_45:STRING=F_ARMV8A_ONLY' in partial.read_text():shutil.copyfile(partial,folder/'CMakeCache.partial.txt')
    f={'name':'F_ARMV8A_ONLY','baseline':'A_CURRENT','modified_variables':{'GGML_CPU_ARM_ARCH':{'before':'','after':'armv8-a'}},
       'requested_controls':expected('F_ARMV8A_ONLY'),'other_differences_detected':[],
       'commit':baseline['commit'],'llamaCommit':LLAMA,'build_result':'CONFIGURATION_REJECTED',
       'isolation_status':'ISOLATION_INVALID','reason':DEPENDENCY,'hashes':{},'apksAvailable':False}
    (folder/'build_metadata.json').write_text(json.dumps(f,indent=2)+'\n');entries.append(f)
    matrix={'schema':46,'initial_commit':INITIAL,'final_commit':baseline['commit'],'llamaCommit':LLAMA,
            'artifact':'HARUNA_DIAGNOSTIC_46_ARM_ISOLATION','variants':entries,'inferenceExecutedInCI':False,
            'normalApplicationModified':False,'signingCertificateSha256':next(iter(certificates))}
    (root/'BUILD_MATRIX.json').write_text(json.dumps(matrix,indent=2)+'\n')
    report=(root/'ETAPA_4_6A_RELATORIO.txt').read_text(encoding='utf-8')
    report+='\nBUILD REAL — MATRIZ FINAL\nCommit inicial: '+INITIAL+'\nCommit final: '+baseline['commit']+'\nllama.cpp: '+LLAMA+'\n'
    for row in entries:
        report+='\n'+row['name']+': '+row['build_result']+' / '+row['isolation_status']+'\n'+json.dumps(row['modified_variables'],ensure_ascii=False)+'\n'
        for name,digest in row['hashes'].items():report+=digest+'  '+row['name']+'/'+name+'\n'
    report+='\nWorkflow/run: '+os.environ.get('GITHUB_SERVER_URL','https://github.com')+'/'+os.environ['GITHUB_REPOSITORY']+'/actions/runs/'+os.environ['GITHUB_RUN_ID']+'\n'
    report+='Artifact: HARUNA_DIAGNOSTIC_46_ARM_ISOLATION (mesmo run). Nenhuma inferência executada. F impossível isoladamente; sem APK fictício.\n'
    report+='\nETAPA 4.6A PREPARADA — AGUARDANDO EXECUÇÃO REAL NO DISPOSITIVO\n'
    (root/'ETAPA_4_6A_RELATORIO.txt').write_text(report,encoding='utf-8')
    if any(e['isolation_status']=='ISOLATION_INVALID' for e in entries if e['name']!='F_ARMV8A_ONLY'):
        raise ValueError('Unexpected isolation failure; consult BUILD_MATRIX.json')
    print('PASS: real builds/hashes, A/B controls, isolated C/D/E, explicit impossible F; no inference simulated.')


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('operation',choices=['collect','finalize']);p.add_argument('--variant',choices=BUILT);p.add_argument('--root',required=True)
    a=p.parse_args();root=Path(a.root)
    if a.operation=='collect':collect(a.variant,root)
    else:finalize(root)


if __name__=='__main__':main()
