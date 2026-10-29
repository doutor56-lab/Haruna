"""Opt-in canonical numerical experiment on the SAME pinned Android binding. OFF by default."""
from pathlib import Path
import shutil
from patch_android_metrics import replace_once


def apply_diag45_patch():
    base=Path('third_party/llama.cpp')
    root=base/'examples/llama.android/lib/src/main'
    for name in ('capture.h','runner.h'):
        shutil.copyfile('patches/diagnostic45/'+name,root/'cpp'/('haruna45_'+name))
    gradle=base/'examples/llama.android/lib/build.gradle.kts'
    text=gradle.read_text()
    if '// Haruna diagnostic 4.5' not in text:
        text=replace_once(text,'                arguments += "-DGGML_LLAMAFILE=OFF"', '''                arguments += "-DGGML_LLAMAFILE=OFF"
                // Haruna diagnostic 4.5: only explicitly requested A/B builds.
                val mode = providers.gradleProperty("harunaDiagnostic45").orElse("OFF").get()
                require(mode in listOf("OFF", "A_CURRENT", "B_CONSERVATIVE"))
                arguments += "-DHARUNA_DIAGNOSTIC_45=$mode"''')
        text=replace_once(text, 'abiFilters += listOf("arm64-v8a", "x86_64")', 'abiFilters += if (providers.gradleProperty("harunaDiagnostic45").orElse("OFF").get() == "OFF") listOf("arm64-v8a", "x86_64") else listOf("arm64-v8a")')
        gradle.write_text(text)
    cmake=root/'cpp/CMakeLists.txt'
    text=cmake.read_text()
    if '# Haruna diagnostic 4.5' not in text:
        text=replace_once(text,'set(LLAMA_SRC ','''# Haruna diagnostic 4.5. Verified options in this exact revision; normal builds untouched.
set(HARUNA_DIAGNOSTIC_45 "OFF" CACHE STRING "OFF, A_CURRENT, B_CONSERVATIVE")
set(HARUNA45_VALUE 0)
if(HARUNA_DIAGNOSTIC_45 STREQUAL "A_CURRENT")
    set(HARUNA45_VALUE 1)
elseif(HARUNA_DIAGNOSTIC_45 STREQUAL "B_CONSERVATIVE")
    if(NOT ANDROID_ABI STREQUAL "arm64-v8a")
        message(FATAL_ERROR "Diagnostic B is ARM64 only")
    endif()
    set(HARUNA45_VALUE 2)
    set(GGML_CPU_KLEIDIAI OFF)
    set(GGML_CPU_REPACK OFF CACHE BOOL "Diagnostic only" FORCE)
    set(GGML_CPU_ALL_VARIANTS OFF CACHE BOOL "Diagnostic only" FORCE)
    set(GGML_CPU_ARM_ARCH "armv8-a" CACHE STRING "Diagnostic only" FORCE)
elseif(NOT HARUNA_DIAGNOSTIC_45 STREQUAL "OFF")
    message(FATAL_ERROR "Invalid diagnostic mode")
endif()
set(LLAMA_SRC ''')
        text+='\ntarget_compile_definitions(${CMAKE_PROJECT_NAME} PRIVATE HARUNA_DIAGNOSTIC_45=${HARUNA45_VALUE})\n'
        cmake.write_text(text)
    # Propagate only to the CPU targets; no normal build feature change.
    cpu=base/'ggml/src/ggml-cpu/CMakeLists.txt'
    text=cpu.read_text()
    if '# Haruna45 counters' not in text:
        text=replace_once(text,'    target_sources(${GGML_CPU_NAME} PRIVATE ${GGML_CPU_SOURCES})', '''    # Haruna45 counters: compiled away when OFF.
    if(HARUNA45_VALUE GREATER 0)
        target_compile_definitions(${GGML_CPU_NAME} PRIVATE HARUNA_DIAGNOSTIC_45=${HARUNA45_VALUE})
    endif()
    target_sources(${GGML_CPU_NAME} PRIVATE ${GGML_CPU_SOURCES})''')
        cpu.write_text(text)
    cpp=base/'ggml/src/ggml-cpu/ggml-cpu.cpp'
    text=cpp.read_text()
    if '// Haruna45 successful extra-traits counters' not in text:
        text='#ifndef HARUNA_DIAGNOSTIC_45\n#define HARUNA_DIAGNOSTIC_45 0\n#endif\n#include <atomic>\n#include <cstring>\n'+text
        needle='static void * ggml_backend_cpu_get_proc_address(ggml_backend_reg_t reg, const char * name) {'
        text=replace_once(text,needle,'''// Haruna45 successful extra-traits counters, not guessed from compiled availability.
#if HARUNA_DIAGNOSTIC_45
static std::atomic<bool> h45_enabled{false};
static std::atomic<uint64_t> h45_counts[3]{};
void haruna45_extra_hit(const char * name) {
    if(!h45_enabled.load(std::memory_order_relaxed))return;
    ++h45_counts[0];
    if(std::strstr(name,"KLEIDIAI"))++h45_counts[1];
    if(std::strstr(name,"REPACK"))++h45_counts[2];
}
static void haruna45_reset(bool enabled) {
    h45_enabled=false;for(auto & n:h45_counts)n=0;h45_enabled=enabled;
}
static uint64_t haruna45_count(int index){return index>=0&&index<3?h45_counts[index].load():0;}
#endif
'''+needle+'''
#if HARUNA_DIAGNOSTIC_45
    if(strcmp(name,"haruna45_reset")==0)return (void *)haruna45_reset;
    if(strcmp(name,"haruna45_count")==0)return (void *)haruna45_count;
#endif''')
        cpp.write_text(text)
    traits=base/'ggml/src/ggml-cpu/traits.cpp'
    text=traits.read_text()
    if '// Haruna45 selected extra buffer' not in text:
        text='#ifndef HARUNA_DIAGNOSTIC_45\n#define HARUNA_DIAGNOSTIC_45 0\n#endif\n#if HARUNA_DIAGNOSTIC_45\nvoid haruna45_extra_hit(const char * name);\n#endif\n'+text
        text=replace_once(text,'            if (tensor_traits && tensor_traits->compute_forward(params, op)) {', '''            if (tensor_traits && tensor_traits->compute_forward(params, op)) {
                // Haruna45 selected extra buffer: one successful call per participating thread.
#if HARUNA_DIAGNOSTIC_45
                haruna45_extra_hit(ggml_backend_buft_name(extra));
#endif''')
        traits.write_text(text)
    api=root/'java/com/arm/aichat/InferenceEngine.kt'
    text=api.read_text()
    if 'runDiagnostic45' not in text:
        text=replace_once(text,'    fun runtimeMetrics(): String','    fun runtimeMetrics(): String\n    suspend fun runDiagnostic45(modelPath: String, directory: String, probes: IntArray): String')
        api.write_text(text)
    impl=root/'java/com/arm/aichat/internal/InferenceEngineImpl.kt'
    text=impl.read_text()
    if 'diagnostic45Native' not in text:
        text=replace_once(text,'    override external fun runtimeMetrics(): String', '''    override external fun runtimeMetrics(): String
    private external fun diagnostic45Native(modelPath: String, directory: String, probes: IntArray): String
    override suspend fun runDiagnostic45(modelPath: String, directory: String, probes: IntArray): String = withContext(llamaDispatcher) {
        check(nativeReady && activeGeneration == 0L && _state.value is InferenceEngine.State.Initialized) {
            "Use a fresh instrumentation process without a loaded model"
        }
        _state.value = InferenceEngine.State.LoadingModel
        try { diagnostic45Native(modelPath, directory, probes) }
        finally { _state.value = InferenceEngine.State.Initialized }
    }''')
        impl.write_text(text)
    cpp=root/'cpp/ai_chat.cpp'
    text=cpp.read_text()
    if '#include "haruna45_capture.h"' not in text:
        text=replace_once(text,'#include "haruna_decision_probe.h"','#include "haruna_decision_probe.h"\n#include "haruna45_capture.h"')
        # Diagnostic process ignores previous DBG CPU preference; no preference writes.
        # The isolated diagnostic application has no legacy DBG preferences; loader stays unchanged.
        text=replace_once(text,'    hd_decision(new_token_id,current_position,','    d45_choice(new_token_id,current_position);\n    hd_decision(new_token_id,current_position,')
        text+='\n#include "haruna45_runner.h"\n'
        cpp.write_text(text)
    chat=root/'cpp/haruna_chat.h'
    text=chat.read_text()
    if 'd45_validate(messages)' not in text:
        text=replace_once(text,'        if (messages.back().role != ROLE_USER)', '        d45_validate(messages);\n        if (messages.back().role != ROLE_USER)')
        text=replace_once(text,'        const auto key=haruna_jstring(env,conversation_key);','        d45_input(tokens);\n        const auto key=haruna_jstring(env,conversation_key);')
        chat.write_text(text)
    print('Patched opt-in canonical diagnostic45: defaults OFF, separate conservative build, successful extra-traits counters.')


if __name__=='__main__':
    apply_diag45_patch()
