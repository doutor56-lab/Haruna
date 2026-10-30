"""Opt-in per-request lab sampler, serialized in the existing native owner."""
from pathlib import Path
import shutil

def apply_lab_patch():
 root=Path('third_party/llama.cpp/examples/llama.android/lib/src/main')
 for path in ['java/com/arm/aichat/InferenceEngine.kt','java/com/arm/aichat/internal/InferenceEngineImpl.kt']:
  p=root/path;s=p.read_text()
  if 'labConfig: String' not in s:
   if path.endswith('/InferenceEngine.kt'):
    s=s.replace('conversationRevision: Long): Flow<String>','conversationRevision: Long, labConfig: String = ""): Flow<String>')
   else:
    s=s.replace('conversationRevision: Long): Flow<String>','conversationRevision: Long, labConfig: String): Flow<String>')
    s=s.replace('conversationRevision: Long): Int','conversationRevision: Long, labConfig: String): Int')
    s=s.replace('enableThinking, conversationKey, conversationRevision)','enableThinking, conversationKey, conversationRevision, labConfig)')
   p.write_text(s)
 shutil.copyfile('patches/llama-android/haruna_lab.h',root/'cpp/haruna_lab.h')
 p=root/'cpp/ai_chat.cpp';s=p.read_text()
 if '#include "haruna_lab.h"' not in s:s=s.replace('#include "haruna_chat.h"','#include "haruna_lab.h"\n#include "haruna_chat.h"')
 p.write_text(s)

 # Separate DEBUG canonical prompt inspector; never inserted into the scalar DBG report.
 p=root/'cpp/haruna_metrics.h';s=p.read_text()
 if 'hl_snapshot' not in s:
  s=s.replace('static HarunaJson hk_snapshot();','static HarunaJson hk_snapshot();\nstatic HarunaJson hl_snapshot();')
  s=s.replace('return env->NewStringUTF(result.dump().c_str());','return env->NewStringUTF(result.dump(-1, \' \', true).c_str());')
  s=s.replace('    result["stability"]=hs_snapshot();','    result["laboratory"]=hl_snapshot();\n    result["stability"]=hs_snapshot();')
 p.write_text(s)
