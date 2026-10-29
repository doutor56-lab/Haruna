"""Single-input build variants + additive provenance on the unchanged 4.5 fixture. No kernel edits."""
from pathlib import Path
import shutil
from patch_android_metrics import replace_once

MODES=['OFF','A_CURRENT','B_CONSERVATIVE','C_NO_KLEIDIAI','D_NO_REPACK','E_NO_ALL_VARIANTS','F_ARMV8A_ONLY']


def apply_diag46_patch():
    base=Path('third_party/llama.cpp/examples/llama.android/lib')
    root=base/'src/main/cpp'
    for name in ('matrix.cmake','metadata.cmake'):
        shutil.copyfile('patches/diagnostic46/'+name,root/('haruna46_'+name))
    gradle=base/'build.gradle.kts';text=gradle.read_text()
    if '// Haruna diagnostic 4.6' not in text:
        text=replace_once(text,'require(mode in listOf("OFF", "A_CURRENT", "B_CONSERVATIVE"))',
            'require(mode in listOf('+', '.join('"'+m+'"' for m in MODES)+'))')
        text=replace_once(text,'arguments += "-DHARUNA_DIAGNOSTIC_45=$mode"', '''arguments += "-DHARUNA_DIAGNOSTIC_45=$mode"
                // Haruna diagnostic 4.6 provenance only; not an inference parameter.
                val source = providers.environmentVariable("HARUNA_SOURCE_REVISION").orElse("UNRECORDED").get()
                arguments += "-DHARUNA46_SOURCE_COMMIT=$source"''')
        gradle.write_text(text)
    cmake=root/'CMakeLists.txt';text=cmake.read_text()
    if '# Haruna46 single-variable matrix' not in text:
        text=replace_once(text,'elseif(NOT HARUNA_DIAGNOSTIC_45 STREQUAL "OFF")',
            'elseif(HARUNA_DIAGNOSTIC_45 MATCHES "^(C_NO_KLEIDIAI|D_NO_REPACK|E_NO_ALL_VARIANTS|F_ARMV8A_ONLY)$")\n    # Initialized by the independent matrix below.\nelseif(NOT HARUNA_DIAGNOSTIC_45 STREQUAL "OFF")')
        text=replace_once(text,'set(LLAMA_SRC ', '# Haruna46 single-variable matrix\ninclude(${CMAKE_CURRENT_LIST_DIR}/haruna46_matrix.cmake)\nset(LLAMA_SRC ')
        text=replace_once(text,'add_subdirectory(${LLAMA_SRC} build-llama)',
            'add_subdirectory(${LLAMA_SRC} build-llama)\ninclude(${CMAKE_CURRENT_LIST_DIR}/haruna46_metadata.cmake)')
        text+='\ntarget_include_directories(${CMAKE_PROJECT_NAME} PRIVATE ${CMAKE_CURRENT_BINARY_DIR})\n'
        cmake.write_text(text)
    runner=root/'haruna45_runner.h';text=runner.read_text()
    if 'metadata["build46"]' not in text:
        text='#include "haruna46_build.h"\n'+text
        text=replace_once(text,'            if(HARUNA_DIAGNOSTIC_45==2 &&',
            '            const auto build46=HarunaJson::parse(HARUNA46_BUILD_JSON);\n            for (const auto & item : std::vector<std::pair<std::string,std::string>>{{"GGML_CPU_KLEIDIAI","KLEIDIAI"},{"GGML_CPU_REPACK","REPACK"}})\n                if(build46.value(item.first,std::string(""))=="OFF" && flags.value(item.second,std::string("0"))=="1")\n                    throw std::runtime_error("Runtime backend violates isolated build flags");\n            if(HARUNA_DIAGNOSTIC_45==2 &&')
        text=replace_once(text,'metadata["testMode"]=HARUNA_DIAGNOSTIC_45==1?"A_CURRENT":"B_CONSERVATIVE";',
            'metadata["build46"]=build46;\n            metadata["testMode"]=metadata["build46"]["variant"];')
        runner.write_text(text)
    print('Patched diagnostic46 one-variable C/D/E and explicitly unsupported isolated F; canonical arithmetic untouched.')


if __name__=='__main__':apply_diag46_patch()
