"""Full-state hybrid continuation; explicit boundaries, no KV-only rollback."""
from pathlib import Path
import shutil

def apply_incremental_patch():
 root=Path('third_party/llama.cpp/examples/llama.android/lib/src/main')
 for name in ['haruna_preparation.h','haruna_incremental_state.h','haruna_incremental_native.h','haruna_op_profile.h','haruna_accelerator.h']:
  shutil.copyfile(Path('patches/llama-android')/name,root/'cpp'/name)
 for name in ['InferenceEngine.kt','internal/InferenceEngineImpl.kt']:
  p=root/'java/com/arm/aichat'/name;s=p.read_text()
  if "systemCachePrefix: String" not in s:s=s.replace('labConfig: String = ""','labConfig: String = "", systemCachePrefix: String = ""')
  s=s.replace('labConfig: String)', 'labConfig: String, systemCachePrefix: String)')
  s=s.replace('conversationRevision, labConfig)', 'conversationRevision, labConfig, systemCachePrefix)')
  s=s.replace('roles.size in 2..18','roles.size in 2..128')
  p.write_text(s)
 p=root/'cpp/ai_chat.cpp';s=p.read_text()
 if '#include "haruna_op_profile.h"' not in s:s=s.replace('#include "haruna_strings.h"','#include "haruna_op_profile.h"\n#include "haruna_strings.h"')
 if '#include "haruna_accelerator.h"' not in s:
  s=s.replace('#include "haruna_prefix_cache.h"','#include "haruna_prefix_cache.h"\n#include "haruna_accelerator.h"')
  s=s.replace('llama_backend_init(); hs_backend_ready = true;', 'llama_backend_init(); hs_backend_ready = true;ha_refresh();')
  s=s.replace('llama_model_params model_params = llama_model_default_params();','llama_model_params model_params = llama_model_default_params();\n    model_params.n_gpu_layers=ha_pending.exchange(0);ha_loaded_request=model_params.n_gpu_layers;\n    static ggml_backend_dev_t cpu_only[]={nullptr};if(model_params.n_gpu_layers==0)model_params.devices=cpu_only;')

 if 'const int token_end = -1' not in s:
  s=s.replace('const int token_offset = 0) {','const int token_offset = 0, const int token_end = -1) {')
  s=s.replace('    for (int i = token_offset;', '    const int token_stop=token_end<0?static_cast<int>(tokens.size()):std::min(token_end,static_cast<int>(tokens.size()));\n    for (int i = token_offset;',1)
  s=s.replace('i < (int) tokens.size(); i += llama_n_batch(context)', 'i < token_stop; i += llama_n_batch(context)')
  s=s.replace('std::min((int) tokens.size() - i, (int)llama_n_batch(context))','std::min(token_stop - i, (int)llama_n_batch(context))')
 # Preserve native return codes and observe only the existing prefill helper.
 if 'hprep_decode(' not in s:
  begin=s.index('static int decode_tokens_in_batches(')
  end=s.index('\n#include ',begin)
  helper=s[begin:end]
  anchors={
   '        batch.clear();':'        hprep_set(HprepStage::batch_build);\n        batch.clear();',
   'const int decode_result = llama_process(context, LLAMA_PROCESS_TYPE_DECODE, batch.get());':'const int decode_result = hprep_decode(start_pos+i,cur_batch_size,[&] { return llama_process(context, LLAMA_PROCESS_TYPE_DECODE, batch.get()); });',
   '            hk_confirm_prefill(tokens,':'            hprep_set(HprepStage::prefill_commit);\n            hk_confirm_prefill(tokens,',
   '            return 1;':'            return decode_result;'}
  for old,new in anchors.items():
   if helper.count(old)!=1:raise SystemExit('Unsupported preparation diagnostic anchor: '+old)
   helper=helper.replace(old,new,1)
  s=s[:begin]+helper+s[end:]
 p.write_text(s)
 p=root/'cpp/haruna_metrics.h';s=p.read_text()
 if 'hi_snapshot' not in s:
  s=s.replace('static HarunaJson hk_snapshot();','static HarunaJson hk_snapshot();\nstatic HarunaJson hp_snapshot();\nstatic HarunaJson ha_snapshot();')
  s=s.replace('static HarunaJson hk_snapshot();','static HarunaJson hk_snapshot();\nstatic HarunaJson hi_snapshot();')
  s=s.replace('    result["stability"]=hs_snapshot();','    result["opProfile"]=hp_snapshot();\n    result["accelerator"]=ha_snapshot();\n    result["stability"]=hs_snapshot();')
  s=s.replace('    result["prefix"]=hk_snapshot();','    result["prefix"]=hk_snapshot();\n    result["incremental"]=hi_snapshot();')
 p.write_text(s)
 p=root/'cpp/haruna45_runner.h';s=p.read_text().replace('512,true,key,0);','512,true,key,0,nullptr,nullptr);');p.write_text(s)

 # Actual successful extra-traits counters; disabled branch only in production.
 cpu=Path('third_party/llama.cpp/ggml/src/ggml-cpu')
 for name in ['ggml-cpu.cpp','traits.cpp']:
  p=cpu/name;s=p.read_text().replace('#if HARUNA_DIAGNOSTIC_45\n','#if HARUNA_DIAGNOSTIC_45 || defined(HARUNA_INFERENCE_PROFILE)\n');p.write_text(s)
 p=cpu/'CMakeLists.txt';s=p.read_text()
 if 'PRIVATE HARUNA_INFERENCE_PROFILE=1' not in s:s=s.replace('    target_sources(${GGML_CPU_NAME} PRIVATE ${GGML_CPU_SOURCES})','    target_compile_definitions(${GGML_CPU_NAME} PRIVATE HARUNA_INFERENCE_PROFILE=1)\n    target_sources(${GGML_CPU_NAME} PRIVATE ${GGML_CPU_SOURCES})')
 p.write_text(s)
 p=root/'cpp/haruna_resources.h';s=p.read_text().replace('hk_finish_request(hm_reason.load());','hk_finish_request(hm_reason.load());hp_end();');p.write_text(s)
 # Existing owner serializes unload -> configure -> reload.
 api=root/'java/com/arm/aichat/InferenceEngine.kt';s=api.read_text()
 if 'fun configureOffload' not in s:s=s.replace('    fun runtimeMetrics(): String','    fun runtimeMetrics(): String\n    suspend fun configureOffload(layers: Int)')
 api.write_text(s)
 p=root/'java/com/arm/aichat/internal/InferenceEngineImpl.kt';s=p.read_text()
 if 'external fun setOffloadLayers' not in s:s=s.replace('    override external fun runtimeMetrics(): String','''    override external fun runtimeMetrics(): String
    private external fun setOffloadLayers(layers: Int): Int
    override suspend fun configureOffload(layers: Int) = withContext(llamaDispatcher) {
        check(activeGeneration==0L) { "Runtime ocupado" }
        check(setOffloadLayers(layers)==0) { "Vulkan indisponível ou runtime ainda carregado" }
    }''')
 p.write_text(s)
 # Optional Vulkan backend uses the SAME core and existing CPU fallbacks.
 p=root/'cpp/CMakeLists.txt';s=p.read_text()
 if 'HARUNA_VULKAN_EXPERIMENT' not in s:s=s.replace('set(LLAMA_SRC ','''option(HARUNA_VULKAN_EXPERIMENT "Explicit optional Vulkan test" OFF)
if(HARUNA_VULKAN_EXPERIMENT)
    set(GGML_VULKAN ON CACHE BOOL "Experimental build only" FORCE)
    set(Vulkan_GLSLC_EXECUTABLE "/usr/bin/glslc" CACHE FILEPATH "Host glslc, build-only")
    set(Vulkan_INCLUDE_DIR "$ENV{HARUNA_VULKAN_HEADERS}/include" CACHE PATH "Isolated Vulkan headers")
    if(ANDROID_ABI STREQUAL "arm64-v8a")
        set(HARUNA_VULKAN_TRIPLE "aarch64-linux-android")
    elseif(ANDROID_ABI STREQUAL "x86_64")
        set(HARUNA_VULKAN_TRIPLE "x86_64-linux-android")
    else()
        message(FATAL_ERROR "Vulkan experiment supports only existing arm64-v8a/x86_64 build targets")
    endif()
    set(Vulkan_LIBRARY "${ANDROID_NDK}/toolchains/llvm/prebuilt/linux-x86_64/sysroot/usr/lib/${HARUNA_VULKAN_TRIPLE}/33/libvulkan.so" CACHE FILEPATH "Android Vulkan loader")
    set(SPIRV-Headers_DIR "/usr/share/cmake/SPIRV-Headers" CACHE PATH "Build-only SPIRV package")
    include_directories("$ENV{HARUNA_VULKAN_HEADERS}/include")
endif()
set(LLAMA_SRC ''')
 p.write_text(s)
 p=root.parents[1]/'build.gradle.kts';s=p.read_text()
 if '-DHARUNA_VULKAN_EXPERIMENT=' not in s:s=s.replace('arguments += "-DGGML_NATIVE=OFF"','arguments += "-DHARUNA_VULKAN_EXPERIMENT=" + if (providers.gradleProperty("harunaVulkan").orElse("false").get().toBoolean()) "ON" else "OFF"\n                arguments += "-DGGML_NATIVE=OFF"')
 p.write_text(s)

 p=Path('third_party/llama.cpp/src/llama-context.cpp');s=p.read_text()
 if 'haruna_observed_node_backend' not in s:s+='''\nextern "C" LLAMA_API const char * haruna_observed_node_backend(const llama_context * ctx,ggml_tensor * tensor){auto b=ggml_backend_sched_get_tensor_backend(ctx->get_sched(),tensor);return b?ggml_backend_name(b):"unknown";}\n'''
 p.write_text(s)

