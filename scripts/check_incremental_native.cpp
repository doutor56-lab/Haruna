// Actual pinned llama.cpp, tiny RANDOM Qwen35 test fixture, never a performance/model-quality result.
#include "llama.h"
#include "ggml.h"
#include "../patches/llama-android/haruna_incremental_state.h"
#include <cassert>
#include <cmath>
#include <iostream>
#include <vector>
using S=haruna_incremental::Session<llama_token>;
static void decode(llama_context*c,const std::vector<llama_token>&ids,int begin,int end){auto b=llama_batch_init(end-begin,0,1);for(int i=begin;i<end;i++){int j=i-begin;b.token[j]=ids[i];b.pos[j]=i;b.n_seq_id[j]=1;b.seq_id[j][0]=0;b.logits[j]=i==end-1;}b.n_tokens=end-begin;assert(llama_decode(c,b)==0);llama_batch_free(b);}
static std::vector<float> logits(llama_context*c,int n){const auto*p=llama_get_logits_ith(c,-1);return {p,p+n};}
static void equal(const std::vector<float>&a,const std::vector<float>&b){double err=0,power=0;for(size_t i=0;i<a.size();i++){assert(std::isfinite(a[i])&&std::isfinite(b[i]));err+=std::pow(double(a[i])-b[i],2);power+=double(a[i])*a[i];}double nmse=err/std::max(power,1e-30);std::cout<<"fixture logits NMSE="<<nmse<<"\n";assert(nmse<1e-5);}
int main(int argc,char**argv){assert(argc==2);llama_backend_init();auto mp=llama_model_default_params();mp.n_gpu_layers=0;auto*m=llama_model_load_from_file(argv[1],mp);assert(m&&llama_model_is_hybrid(m));auto cp=llama_context_default_params();cp.n_ctx=256;cp.n_batch=128;cp.n_ubatch=128;cp.n_threads=cp.n_threads_batch=2;cp.flash_attn_type=LLAMA_FLASH_ATTN_TYPE_DISABLED;auto*c=llama_init_from_model(m,cp);auto*r=llama_init_from_model(m,cp);assert(c&&r);int vocab=llama_vocab_n_tokens(llama_model_get_vocab(m));
 std::vector<llama_token> ids;for(int i=0;i<96;i++)ids.push_back(2+(i*17)%(vocab-4));S s;haruna_incremental::Owner o{"first",1,1,c,(void*)1,false,2,2};auto mem=llama_get_memory(c);auto frontier=[&]{return llama_memory_seq_pos_max(mem,0);};
 auto clear=[&]{llama_memory_clear(mem,false);};auto restore=[&](const auto&data,size_t n){return llama_state_seq_set_data_ext(c,data.data(),data.size(),0,LLAMA_STATE_SEQ_FLAGS_NONE)==data.size()&&frontier()==int(n)-1;};
 std::vector<llama_token> input(ids.begin(),ids.begin()+32);s.plan(o,input,frontier(),true,restore,clear);decode(c,input,0,16);assert(s.append(0,input.begin(),input.begin()+16,frontier()));assert(s.capture(0,16,frontier(),[&]{return llama_state_seq_get_size_ext(c,0,LLAMA_STATE_SEQ_FLAGS_NONE);},[&](auto&v){return llama_state_seq_get_data_ext(c,v.data(),v.size(),0,LLAMA_STATE_SEQ_FLAGS_NONE);}));decode(c,input,16,32);assert(s.append(16,input.begin()+16,input.end(),frontier()));assert(s.capture(1,32,frontier(),[&]{return llama_state_seq_get_size_ext(c,0,LLAMA_STATE_SEQ_FLAGS_NONE);},[&](auto&v){return llama_state_seq_get_data_ext(c,v.data(),v.size(),0,LLAMA_STATE_SEQ_FLAGS_NONE);}));
 input.assign(ids.begin(),ids.begin()+64);auto p=s.plan(o,input,frontier(),false,restore,clear);assert(p.direct&&p.reused==32);decode(c,input,32,64);assert(s.append(32,input.begin()+32,input.end(),frontier()));decode(r,input,0,64);equal(logits(c,vocab),logits(r,vocab));
 auto altered=input;altered[40]=(altered[40]+1)%vocab;p=s.plan(o,altered,frontier(),false,restore,clear);assert(p.restored&&p.reused==32&&p.checkpoint==1);decode(c,altered,32,64);assert(s.append(32,altered.begin()+32,altered.end(),frontier()));llama_memory_clear(llama_get_memory(r),false);decode(r,altered,0,64);equal(logits(c,vocab),logits(r,vocab));
 auto second=o;second.conversation="second";p=s.plan(second,input,frontier(),false,restore,clear);assert(p.restored&&p.checkpoint==0&&p.reused==16);decode(c,input,16,64);llama_memory_clear(llama_get_memory(r),false);decode(r,input,0,64);equal(logits(c,vocab),logits(r,vocab));
 std::cout<<"PASS REAL hybrid fixture: append, complete KV+recurrent/convolution turn restore, isolated system restore and finite cold-equivalent logits. Not phone/2B/TTFT benchmark.\n";llama_free(r);llama_free(c);llama_model_free(m);llama_backend_free();}
