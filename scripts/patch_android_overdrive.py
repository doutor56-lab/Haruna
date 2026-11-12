"""Extend the existing serialized binding, without introducing a second native owner."""
from pathlib import Path
import shutil

def apply_overdrive_patch():
    root=Path('third_party/llama.cpp/examples/llama.android/lib/src/main')
    for name in ['InferenceEngine.kt','internal/InferenceEngineImpl.kt']:
        p=root/'java/com/arm/aichat'/name;s=p.read_text()
        if 'inferenceConfig: String' not in s:
            s=s.replace('systemCachePrefix: String = ""', 'systemCachePrefix: String = "", inferenceConfig: String = ""')
            s=s.replace('systemCachePrefix: String)', 'systemCachePrefix: String, inferenceConfig: String)')
            s=s.replace('conversationRevision, labConfig, systemCachePrefix)', 'conversationRevision, labConfig, systemCachePrefix, inferenceConfig)')
        p.write_text(s)
    cpp=root/'cpp'
    shutil.copyfile('patches/llama-android/haruna_inference_settings.h',cpp/'haruna_inference_settings.h')
    p=cpp/'ai_chat.cpp';s=p.read_text()
    if '#include "haruna_inference_settings.h"' not in s:
        s=s.replace('#include "haruna_lab.h"','#include "haruna_inference_settings.h"\n#include "haruna_lab.h"')
    p.write_text(s)
    p=cpp/'haruna_lab.h';s=p.read_text()
    if 'ho_model_prepared();' not in s:
        s=s.replace('static void hl_model_prepared(){','static void hl_model_prepared(){\n    ho_model_prepared();')
    if 'ho_apply()' not in s:
        s=s.replace('hc_requested=HarunaJson::object();hc_ensure(HarunaContextConfig{});hc_observe();',
                    'if(ho_apply()){hl_sampler=false;return;}\n        hc_requested=HarunaJson::object();hc_ensure(HarunaContextConfig{});hc_observe();')
    p.write_text(s)
    p=cpp/'haruna45_runner.h';s=p.read_text().replace('512,true,key,0,nullptr,nullptr);','512,true,key,0,nullptr,nullptr,nullptr);');p.write_text(s)
    # Stable metadata identity; do not infer the runtime architecture from a filename.
    p=cpp/'haruna_metrics.h';s=p.read_text()
    if 'value["modelName"]' not in s:
        s=s.replace('char arch[128] = {}, description[192] = {};','char arch[128] = {}, description[192] = {}, model_name[192] = {};\n    if(llama_model_meta_val_str(g_model,"general.name",model_name,sizeof(model_name))>0)value["modelName"]=hm_identifier(model_name);')
    p.write_text(s)
