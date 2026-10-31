from pathlib import Path
import subprocess
BASE='3fd5a79f8ed0b8185bd53042a1d2450c40b26742'
allowed={
'app/src/main/java/com/proxyslabs/haruna/diagnostics/DiagnosticBridge.kt',
'app/src/main/assets/haruna/diagnostics/panel.js','app/src/main/assets/haruna/diagnostics/panel.css',
'app/src/main/assets/haruna/diagnostics/lab.js','app/src/main/assets/haruna/diagnostics/experiment.js',
'app/src/main/assets/haruna/diagnostics/lab-view.js','app/src/main/assets/haruna/diagnostics/runtime-state.js',
'scripts/check_lab_browser.mjs','scripts/check_dbg_ui.mjs','scripts/check_dbg_ui_scope.py',
'docs/DBG_UI_RELATORIO.md','docs/DBG_UI_FILES.txt'}
changed=set(subprocess.check_output(['git','diff','--name-only',BASE,'HEAD'],text=True).splitlines())
assert changed<=allowed, 'Unexpected scope: '+str(changed-allowed)
def original(path):return subprocess.check_output(['git','show',BASE+':'+path],text=True)
bridge='app/src/main/java/com/proxyslabs/haruna/diagnostics/DiagnosticBridge.kt'
s=Path(bridge).read_text();start=s.index('    /** Scalar-only fresh view');end=s.index('    @JavascriptInterface fun labModel()',start)
assert s[:start]+s[end:]==original(bridge),'Only the scalar DBG getter may be added to Kotlin'
method=s[start:end]
assert 'backend.runtimeMetrics()' in method and 'BuildConfig.DEBUG' in method
assert not any(x in method for x in ['configureDiagnostic(', 'loadModel(', 'stop(', 'getMemoryInfo('])
lab='app/src/main/assets/haruna/diagnostics/lab.js';a=original(lab);b=Path(lab).read_text()
def block(text,start,end):return text[text.index(start):text.index(end,text.index(start))].strip()
assert block(a,'async function prepare()','function next()')==block(b,'async function prepare()','function next()'),'RAG/timers/fixture preparation must not change'
assert block(a,"button('Exportar JSON sem respostas'","button('Limpar histórico Debug'")==block(b,"button('Exportar JSON sem respostas'","button('Limpar histórico Debug'"),'JSON export body must not change'
for expression in ["Array.from({length:n},()=>[{name:'A',config:bank.A},{name:'B',config:bank.B}]).flat()","Array.from({length:n},()=>({name:preset.value,config:read()}))","{...e.detail,arm:root.dataset.runName,batch:serial}"]:
 assert expression in a and expression in b
assert block(a,'if(bank.A.seed===4294967295','prepare().catch')==block(b,'if(bank.A.seed===4294967295','prepare().catch')
print('PASS DBG UI scope: baseline native/LLM/JNI/cache/voice/chat/config/metrics/core unchanged; Kotlin addition is scalar-only; preparation, seed, A/B order and export unchanged.')
