// Context creation only. No sampler/template/cache algorithm changes.
#include "haruna_thread_policy.h"
struct HarunaContextConfig {
    bool experimental=false;
    int context=8192,batch=512,ubatch=512,fa=-1,k=0,v=0;
    bool operator==(const HarunaContextConfig & b) const {return experimental==b.experimental&&context==b.context&&batch==b.batch&&ubatch==b.ubatch&&fa==b.fa&&k==b.k&&v==b.v;}
};
static HarunaContextConfig hc_config;
static HarunaJson hc_requested;
static int64_t hc_rebuild_us=0;
static void hc_observe();
static void hl_model_prepared();
static void hc_apply(llama_context_params & p,llama_model * model,bool allow_experiment=true) {
    char arch[80]={};llama_model_meta_val_str(model,"general.architecture",arch,sizeof(arch));
    int allowed=sysconf(_SC_NPROCESSORS_ONLN);cpu_set_t mask;CPU_ZERO(&mask);if(sched_getaffinity(0,sizeof(mask),&mask)==0)allowed=CPU_COUNT(&mask);
    if(haruna_qwen_2b_threads(arch,llama_model_n_params(model),allowed)){p.n_threads=2;p.n_threads_batch=6;}
    if(!allow_experiment||!hc_config.experimental)return;
    p.n_ctx=hc_config.context;p.n_batch=hc_config.batch;p.n_ubatch=hc_config.ubatch;
    p.type_k=hc_config.k?GGML_TYPE_Q8_0:GGML_TYPE_F16;p.type_v=hc_config.v?GGML_TYPE_Q8_0:GGML_TYPE_F16;
    if(hc_config.fa>=0)p.flash_attn_type=hc_config.fa?LLAMA_FLASH_ATTN_TYPE_ENABLED:LLAMA_FLASH_ATTN_TYPE_DISABLED;
}
