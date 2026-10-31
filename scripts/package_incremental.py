from pathlib import Path
import hashlib,json,os,shutil,subprocess,zipfile
flavor=os.environ.get('HARUNA_FLAVOR','cpu');gpu=flavor=='vulkan'
name='Haruna-incremental'+('-Vulkan' if gpu else '-CPU')+'.apk'
out=Path('incremental-install');tech=Path('incremental-technical');out.mkdir(exist_ok=True);tech.mkdir(exist_ok=True)
apk=out/name;shutil.copyfile('app/build/outputs/apk/debug/app-debug.apk',apk)
sha=hashlib.sha256(apk.read_bytes()).hexdigest()
app_id='com.proxyslabs.haruna.incremental'+('.vulkan' if gpu else '')
tools=Path(os.environ['ANDROID_HOME'])/'build-tools/36.0.0'
badging=subprocess.check_output([str(tools/'aapt'),'dump','badging',str(apk)],text=True)
assert "package: name='"+app_id+"'" in badging
with zipfile.ZipFile(apk) as z:
 names=z.namelist();assert sum(n.endswith('/libllama.so') for n in names)==1
 assert ('lib/arm64-v8a/libggml-vulkan.so' in names)==gpu
 assert 'lib/arm64-v8a/libggml-cpu-android_armv8.2_2.so' in names
 assert 'lib/arm64-v8a/libharuna_whisper_stt.so' in names
 assert not any(n.lower().endswith(('.gguf','.onnx','.tar.bz2')) for n in names)
 assert '<h1>Haruna</h1>' in z.read('assets/haruna/index.html').decode()
 assert z.read('assets/haruna/recovery-runtime.js')==Path('app/src/main/assets/haruna/recovery-runtime.js').read_bytes()
run=f"https://github.com/{os.environ['GITHUB_REPOSITORY']}/actions/runs/{os.environ['GITHUB_RUN_ID']}"
metadata={'baseCommit':'be5f3d353e0a877b69d55f93567195f6c60eabd7','sourceCommit':os.environ['HARUNA_SOURCE_REVISION'],'llamaCommit':os.environ['LLAMA_CPP_REVISION'],'checkpoint':'checkpoint/haruna-before-incremental-be5f3d3','run':run,'flavor':flavor,'apk':name,'sha256':sha,'applicationId':app_id,'build':'SUCCESS','deviceTestsExecuted':False,'real2BModelInferenceExecuted':False,'syntheticHybridFixtureInferenceExecuted':True,'physicalTTFTMs':None,'targetMet':False,'vulkanCompiled':gpu,'offloadDefault':0,'baselinePackagesUnmodified':True}
for path in ['docs/INFERENCIA_INCREMENTAL_RELATORIO.txt','docs/INFERENCIA_INCREMENTAL_FILES.json']:
 shutil.copyfile(path,tech/Path(path).name)
for path in ['stage6-tests','stage6-browser','dbg-ui-browser']:
 if Path(path).exists():shutil.copytree(path,tech/path,dirs_exist_ok=True)
caches=[];src=Path('third_party/llama.cpp/examples/llama.android/lib')
for p in src.glob('.cxx/**/CMakeCache.txt'):
 d=tech/'runtime-cmake'/p.relative_to(src);d.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,d);caches.append(str(d))
assert caches
metadata['cmakeCaches']=caches
(tech/'BUILD_METADATA.json').write_text(json.dumps(metadata,indent=2)+'\n')
(tech/'SHA256SUMS.txt').write_text(sha+'  '+name+'\n')
report=tech/'INFERENCIA_INCREMENTAL_RELATORIO.txt'
with report.open('a') as f:
 f.write('\nRESULTADO VERIFICADO DO BUILD\n'+json.dumps(metadata,indent=2,ensure_ascii=False)+'\n')
 f.write('APK completo e androidTest compilados; testes automáticos passaram. Inferência real no Samsung e TTFT <=5 s NÃO demonstrados.\n')
print(json.dumps(metadata,indent=2))
