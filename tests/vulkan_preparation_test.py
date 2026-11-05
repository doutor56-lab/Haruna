"""Run after patch_android_loader.py. Compile the actual generated batch helper with fake decode results."""
from pathlib import Path
import subprocess, tempfile
source=Path('third_party/llama.cpp/examples/llama.android/lib/src/main/cpp/ai_chat.cpp').read_text()
a=source.index('static int decode_tokens_in_batches(')
b=source.index('\n#include ',a)
helper=source[a:b]
header=Path('patches/llama-android/haruna_preparation.h').resolve()
program=r'''
#include <vector>
#include <algorithm>
#include <cassert>
#include <stdexcept>
#include "HEADER"
using llama_token=int;using llama_pos=int;using llama_tokens=std::vector<int>;
struct llama_context{} context;static llama_context * g_context=&context;
struct common_batch { void clear(){} void add(int,int,int,bool){} void * get(){return nullptr;} } batch;
static std::atomic<int> hm_stage{3},hm_prefill_tokens{0},hm_occupied{0};
static bool cancel=false;static int calls=0,failed_call=0,code=0,exception=0,confirmed=0;
static bool hs_check_cancel(){return cancel;}
static int llama_n_batch(llama_context *){return 512;}
static int llama_n_ctx(llama_context *){return 8192;}
constexpr int OVERFLOW_HEADROOM=64,LLAMA_PROCESS_TYPE_DECODE=0;
static void shift_context(){assert(false);}
static void hk_confirm_prefill(const llama_tokens &,size_t,size_t n){confirmed+=n;}
static int llama_process(llama_context *,int,void *){
 ++calls;if(calls==failed_call){if(exception==1)throw std::bad_alloc();
 if(exception==2)throw std::system_error(std::make_error_code(std::errc::not_enough_memory),"private text");
 if(exception==3)throw std::runtime_error("Shared memory size too small for matrix multiplication.");
 if(exception==4)throw std::runtime_error("private prompt must never be retained");
 return code;}return 0;
}
#define LOGd(...) ((void)0)
#define LOGw(...) ((void)0)
#define LOGe(...) ((void)0)
HELPER
static void reset(){hprep_reset();calls=0;failed_call=0;code=0;exception=0;confirmed=0;hm_prefill_tokens=0;cancel=false;}
int main(){
 llama_tokens tokens(600,1);reset();assert(decode_tokens_in_batches(g_context,batch,tokens,0,true)==0);
 assert(calls==2&&confirmed==600&&hprep_completed==2&&hprep_return==0);
 for(int rc:{1,2,-1,-2,-3}){reset();failed_call=1;code=rc;assert(decode_tokens_in_batches(g_context,batch,tokens,0,true)==rc);assert(confirmed==0&&hm_prefill_tokens==0&&hprep_return==rc&&hprep_is_prefill_failure());}
 reset();failed_call=2;code=-2;assert(decode_tokens_in_batches(g_context,batch,tokens,0,true)==-2);assert(confirmed==512&&hprep_offset==512&&hprep_count==88&&hprep_completed==1);
 for(int kind:{1,2,3,4}){reset();failed_call=1;exception=kind;bool caught=false;
 try{decode_tokens_in_batches(g_context,batch,tokens,0,true);}catch(...){caught=true;hprep_exception();}
 assert(caught&&hprep_is_prefill_failure()&&hprep_return==INT_MAX&&confirmed==0);
 assert(hprep_kind==(kind==4?3:kind));if(kind==2)assert(hprep_category==3&&hprep_system_code!=0);if(kind==3)assert(hprep_hint==1);if(kind==4)assert(hprep_hint==0);}
 reset();cancel=true;assert(decode_tokens_in_batches(g_context,batch,tokens,0,true)==5&&calls==0);
 reset();hprep_set(HprepStage::chat_template);try{throw std::runtime_error("private");}catch(...){hprep_exception();}assert(!hprep_is_prefill_failure());
 assert(std::strcmp(hprep_name(static_cast<int>(HprepStage::prefill_decode)),"prefill_decode")==0);
 reset();assert(hprep_failed==0&&hprep_kind==0&&hprep_return==INT_MAX);
}
'''.replace('HEADER',str(header)).replace('HELPER',helper)
with tempfile.TemporaryDirectory() as d:
 p=Path(d)/'test.cpp';p.write_text(program);binary=Path(d)/'test'
 subprocess.run(['g++','-std=c++17','-Wall','-Wextra','-Werror','-Wno-sign-compare',str(p),'-o',str(binary)],check=True)
 subprocess.run([str(binary)],check=True)
print('PASS: generated helper success, partial batch failure, exact native codes, allocation/system/unknown exceptions, cancellation, reset; no model/device inference simulated.')
