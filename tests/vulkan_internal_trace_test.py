from pathlib import Path
import tempfile, subprocess
with tempfile.TemporaryDirectory() as d:
 p=Path(d)/'test.cpp';p.write_text(r'''
#include "haruna-vulkan-trace.h"
#include <cassert>
#include <cstdarg>
#include <stdexcept>
static int logs=0;
extern "C" void ggml_log_internal(enum ggml_log_level,const char *,...){++logs;}
int main(){int64_t v[8]{};
 {HarunaVkRequest request(false);HV_SCOPE(20);}assert(logs==0);
 try{HarunaVkRequest request(true);HV_SCOPE(10);{HV_SCOPE(30);throw std::out_of_range("PRIVATE");}}catch(...){}
 haruna_vk_trace_snapshot(v);assert(v[1]==0&&v[4]==30&&v[2]==30);
 {HarunaVkRequest request(true);for(int i=0;i<600;i++){HV_OP_SCOPE(150,42);}HV_ERROR(110,-2);}
 haruna_vk_trace_snapshot(v);assert(v[4]==110&&v[1]==0&&v[5]==42&&v[6]>384);
 assert(logs<410);assert(v[7]>0);
}
''')
 inc=Path('third_party/llama.cpp/ggml/include').resolve();src=Path('third_party/llama.cpp/ggml/src').resolve();exe=Path(d)/'test'
 subprocess.run(['g++','-std=c++17','-DHARUNA_VULKAN_TRACE=1','-I'+str(inc),'-I'+str(src),str(p),'patches/llama-android/haruna_vulkan_trace.cpp','-o',str(exe)],check=True)
 subprocess.run([str(exe)],check=True)
print('PASS: internal trace disabled path, nested throw origin, bounded detail, retained failure and snapshot, no private exception text logged.')
