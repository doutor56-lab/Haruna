"""Bounded internal markers, enabled ONLY by the existing experimental Vulkan CMake option."""
from pathlib import Path
import shutil

def apply_vulkan_trace_patch():
 base=Path('third_party/llama.cpp');inc=base/'ggml/include';src=base/'ggml/src'
 shutil.copyfile('patches/llama-android/haruna_vulkan_trace.h',inc/'haruna-vulkan-trace.h')
 shutil.copyfile('patches/llama-android/haruna_vulkan_trace.cpp',src/'haruna-vulkan-trace.cpp')
 p=src/'CMakeLists.txt';s=p.read_text()
 if 'target_sources(ggml-base PRIVATE haruna-vulkan-trace.cpp)' not in s:s+='\nif(HARUNA_VULKAN_TRACE)\n target_sources(ggml-base PRIVATE haruna-vulkan-trace.cpp)\nendif()\n'
 p.write_text(s)
 p=base/'examples/llama.android/lib/src/main/cpp/CMakeLists.txt';s=p.read_text();anchor='if(HARUNA_VULKAN_EXPERIMENT)'
 if 'set(HARUNA_VULKAN_TRACE ON)' not in s:s=s.replace(anchor,anchor+'\n    set(HARUNA_VULKAN_TRACE ON)\n    add_compile_definitions(HARUNA_VULKAN_TRACE=1)',1)
 p.write_text(s)
 def edit(path,changes,functions):
  p=base/path;s=p.read_text()
  if '#include "haruna-vulkan-trace.h"' in s:return
  s='#include "haruna-vulkan-trace.h"\n'+s
  for old,new in changes:
   if s.count(old)<1:raise SystemExit('Missing trace anchor: '+old[:100])
   s=s.replace(old,new)
  for name,stage in functions:
   # Locate actual definition, allowing multiline argument lists; no parameter/type guessing.
   import re
   matches=list(re.finditer(r'\b'+re.escape(name)+r'\([^;{}]*\)\s*\{',s))
   if len(matches)!=1:raise SystemExit('Trace function must be unique: '+name)
   at=matches[0].end();s=s[:at]+'\n    HV_SCOPE('+str(stage)+');'+s[at:]
  p.write_text(s)
 edit('src/llama-context.cpp',[
 ('int32_t llama_process(llama_context * ctx, llama_process_type type, llama_batch_ext * batch) {','int32_t llama_process(llama_context * ctx, llama_process_type type, llama_batch_ext * batch) {\n#ifdef HARUNA_VULKAN_TRACE\n    HarunaVkRequest hv_request_scope(type==LLAMA_PROCESS_TYPE_DECODE && batch && batch->tokens.size()>1);\n#endif'),
 ('gf = model.build_graph(gparams);','gf = HV_CALL(20,model.build_graph(gparams));'),
 ('if (!ggml_backend_sched_alloc_graph(sched.get(), gf))','if (!HV_CALL(30,ggml_backend_sched_alloc_graph(sched.get(), gf)))'),
 ('res->set_inputs(&ubatch);','HV_CALL(40,res->set_inputs(&ubatch));'),
 ('auto status = ggml_backend_sched_graph_compute_async(sched.get(), gf);','auto status = HV_CALL(50,ggml_backend_sched_graph_compute_async(sched.get(), gf));\n    if(status!=GGML_STATUS_SUCCESS)HV_ERROR(50,static_cast<int>(status));')],
 [('llama_context::process_ubatch',10),('llama_context::synchronize',60)])
 edit('ggml/src/ggml-vulkan/ggml-vulkan.cpp',[
 ('static vk_pipeline ggml_vk_op_get_pipeline(ggml_backend_vk_context * ctx, const ggml_tensor * src0, const ggml_tensor * src1, const ggml_tensor * src2, const ggml_tensor * dst, ggml_op op) {','static vk_pipeline ggml_vk_op_get_pipeline(ggml_backend_vk_context * ctx, const ggml_tensor * src0, const ggml_tensor * src1, const ggml_tensor * src2, const ggml_tensor * dst, ggml_op op) {\n    HV_OP_SCOPE(150,op);'),
 ('    } catch (const vk::SystemError& e) {\n        return nullptr;','    } catch (const vk::SystemError& e) {\n        HV_ERROR(110,e.code().value());\n        return nullptr;')],
 [('ggml_vk_create_pipeline_func',100),('ggml_backend_vk_buffer_type_alloc_buffer',110),('ggml_backend_vk_buffer_set_tensor',120),('ggml_backend_vk_buffer_get_tensor',121),('ggml_vk_submit',130),('ggml_backend_vk_graph_compute',140),('ggml_backend_vk_synchronize',160)])
