#include <nlohmann/json.hpp>
#include <cassert>
#include <mutex>
#include <stdexcept>
#include <cstring>
#include <chrono>
#include <sched.h>
#include <unistd.h>
using HarunaJson=nlohmann::ordered_json;
enum ggml_type{GGML_TYPE_F16,GGML_TYPE_Q8_0};
enum llama_flash_attn_type{LLAMA_FLASH_ATTN_TYPE_AUTO=-1,LLAMA_FLASH_ATTN_TYPE_DISABLED=0,LLAMA_FLASH_ATTN_TYPE_ENABLED=1};
struct ggml_tensor{};static bool hp_callback(ggml_tensor*,bool,void*){return true;}
struct llama_context_params{bool(*cb_eval)(ggml_tensor*,bool,void*)=nullptr;void*cb_eval_user_data=nullptr;int n_threads=4,n_threads_batch=4,n_ctx=8192,n_batch=512,n_ubatch=512;ggml_type type_k=GGML_TYPE_F16,type_v=GGML_TYPE_F16;llama_flash_attn_type flash_attn_type=LLAMA_FLASH_ATTN_TYPE_AUTO;};
struct llama_model{const char * arch="qwen35";uint64_t count=2000000000ULL;bool hybrid=true,recurrent=false;};
static void llama_model_meta_val_str(llama_model*m,const char*,char*b,size_t n){std::strncpy(b,m->arch,n);}
static uint64_t llama_model_n_params(llama_model*m){return m->count;}
static long fake_online(int){return 8;}
static int fake_affinity(int,size_t,cpu_set_t*){return -1;}
#define sysconf fake_online
#define sched_getaffinity fake_affinity
#include "../patches/llama-android/haruna_context_config.h"
#undef sysconf
#undef sched_getaffinity
struct llama_context{llama_context_params p;};
static llama_model model,*g_model=&model;
static llama_context *g_context=nullptr;
struct Batch{llama_context *ctx=nullptr;Batch()=default;explicit Batch(llama_context*c):ctx(c){}};
static Batch g_batch;static int live=0,maximum=0,releases=0,hs_resources=0;static bool fail_create=false,hd_fa_off=false;
static std::mutex hm_lock;static HarunaJson hm_runtime=HarunaJson::object();
static uint32_t llama_n_ctx(llama_context*c){return c->p.n_ctx;}
static uint32_t llama_n_batch(llama_context*c){return c->p.n_batch;}
static uint32_t llama_n_ubatch(llama_context*c){return c->p.n_ubatch;}
static bool llama_model_is_hybrid(llama_model*m){return m->hybrid;}
static bool llama_model_is_recurrent(llama_model*m){return m->recurrent;}
static int haruna_observed_kv_type(llama_context*c,int v){return v?c->p.type_v:c->p.type_k;}
static void hk_release(){++releases;}
static void reset_long_term_states(bool){}static void reset_short_term_states(){}
static Batch common_batch(){return Batch();}static Batch common_batch(llama_context*c){return Batch(c);}
static void llama_free(llama_context*c){assert(g_batch.ctx==nullptr);--live;delete c;}
static int64_t hm_clock(){return std::chrono::steady_clock::now().time_since_epoch().count()/1000;}
static void hm_context(){hm_runtime["flashRequested"]=g_context->p.flash_attn_type;hm_runtime["kvK"]=g_context->p.type_k;hm_runtime["kvV"]=g_context->p.type_v;}
constexpr int DEFAULT_CONTEXT_SIZE=8192;
static llama_context *init_context(llama_model*m,int =8192,bool use_lab_context=false){if(fail_create){fail_create=false;return nullptr;}llama_context_params p;hc_apply(p,m,use_lab_context);++live;maximum=std::max(maximum,live);return new llama_context{p};}
#include "../patches/llama-android/haruna_context_lab.h"
template<class F>static void rejected(F f){bool failed=false;try{f();}catch(...){failed=true;}assert(failed);}
int main(){
 llama_context_params p;hc_apply(p,&model);assert(p.n_threads==2&&p.n_threads_batch==6&&p.n_ctx==8192&&p.n_batch==512&&p.type_k==GGML_TYPE_F16);
 llama_model phi{"phi3",3800000000ULL,false,false};p={};hc_apply(p,&phi);assert(p.n_threads==4&&p.n_threads_batch==4);
 llama_model smol{"smollm3",3000000000ULL,false,false};p={};hc_apply(p,&smol);assert(p.n_threads==6&&p.n_threads_batch==6);
 g_context=init_context(g_model);g_batch=common_batch(g_context);
 auto desired=hc_parse({{"nCtx",2048},{"nBatch",256},{"nUbatch",64},{"flashAttention","off"}});hc_ensure(desired);hc_observe();assert(live==1&&maximum==1&&releases==1&&g_context->p.n_ctx==2048&&g_context->p.n_batch==256&&g_context->p.n_ubatch==64&&g_context->p.flash_attn_type==0);
 hc_ensure(desired);assert(releases==1);
 hc_ensure({});assert(g_context->p.n_ctx==8192&&g_context->p.n_batch==512&&g_context->p.n_ubatch==512&&g_context->p.type_k==GGML_TYPE_F16);
 rejected([]{hc_parse({{"nUbatch",512},{"nBatch",128}});});rejected([]{hc_parse({{"nCtx",3072}});});
 assert(hc_parse({{"typeK","q8_0"}}).k==1);assert(live==1);
 model.hybrid=false;model.recurrent=true;rejected([]{hc_parse({{"typeK","q8_0"}});});model.hybrid=true;model.recurrent=false;
 g_model=&phi;rejected([]{hc_parse({{"typeV","q8_0"},{"flashAttention","off"}});});
 auto quant=hc_parse({{"typeK","q8_0"},{"typeV","q8_0"},{"flashAttention","on"}});hc_ensure(quant);assert(g_context->p.type_k==GGML_TYPE_Q8_0&&g_context->p.type_v==GGML_TYPE_Q8_0);
 hd_fa_off=true;rejected([]{hc_parse({});});assert(hc_parse({{"flashAttention","off"}}).fa==0);hd_fa_off=false;
 fail_create=true;rejected([]{hc_ensure({});});assert(g_context==nullptr&&live==0);hc_ensure({});assert(live==1);
 g_batch=common_batch();llama_free(g_context);g_context=nullptr;assert(live==0&&maximum==1);
}
