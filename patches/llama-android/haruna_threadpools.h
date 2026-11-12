// Own upstream GGML pools, never kernels or an additional inference engine.
#include "ggml-cpu.h"
extern "C" LLAMA_API void haruna_detach_owned_threadpools(llama_context *);
static ggml_threadpool_t ht_decode=nullptr,ht_batch=nullptr;
static llama_context * ht_context=nullptr;
static decltype(ggml_threadpool_free) * ht_free=nullptr;
static int ht_threads=0,ht_batch_threads=0;
static uint64_t ht_created=0;
static void ht_observe(){
    std::lock_guard<std::mutex> l(hm_lock);
    hm_runtime["cpuThreadpools"]={{"persistent",ht_context==g_context&&ht_decode!=nullptr},{"decodeThreads",ht_threads},{"batchThreads",ht_batch_threads},{"pairsCreated",ht_created},{"implementation","ggml_pthreads"}};
}
static void ht_release(llama_context * ctx){
    if(!ht_context||ht_context!=ctx)return;
    // CPU backends also hold a pointer to the last pool. Clear it while that pool is alive.
    haruna_detach_owned_threadpools(ctx);
    if(ht_free){if(ht_batch)ht_free(ht_batch);if(ht_decode)ht_free(ht_decode);}
    ht_decode=ht_batch=nullptr;ht_context=nullptr;ht_free=nullptr;ht_threads=ht_batch_threads=0;ht_observe();
}
static void ht_ensure(llama_context * ctx){
    if(!ctx||ctx!=g_context)return;
    const int nd=llama_n_threads(ctx),nb=llama_n_threads_batch(ctx);
    if(ht_context==ctx&&ht_decode&&ht_threads==nd&&ht_batch_threads==nb)return;
    if(ht_context&&ht_context!=ctx)throw std::runtime_error("Threadpool owner not released");
    ht_release(ctx);
    const auto device=ggml_backend_dev_by_type(GGML_BACKEND_DEVICE_TYPE_CPU);
    const auto reg=device?ggml_backend_dev_backend_reg(device):nullptr;
    auto create=reg?reinterpret_cast<decltype(ggml_threadpool_new)*>(ggml_backend_reg_get_proc_address(reg,"ggml_threadpool_new")):nullptr;
    auto release=reg?reinterpret_cast<decltype(ggml_threadpool_free)*>(ggml_backend_reg_get_proc_address(reg,"ggml_threadpool_free")):nullptr;
    if(!create||!release){ht_observe();return;} // Upstream disposable-pool fallback remains functional.
    common_cpu_params gen,batch;gen.n_threads=nd;batch.n_threads=nb;
    auto gp=ggml_threadpool_params_from_cpu_params(gen),bp=ggml_threadpool_params_from_cpu_params(batch);
    ggml_threadpool_t b=nullptr;
    if(!ggml_threadpool_params_match(&gp,&bp)){b=create(&bp);if(!b){ht_observe();return;}gp.paused=true;}
    auto d=create(&gp);
    if(!d){if(b)release(b);ht_observe();return;}
    llama_attach_threadpool(ctx,d,b);
    ht_context=ctx;ht_decode=d;ht_batch=b;ht_free=release;ht_threads=nd;ht_batch_threads=nb;++ht_created;ht_observe();
}
static void ht_set_threads(llama_context * ctx,int nd,int nb){
    if(ctx==ht_context&&(nd!=ht_threads||nb!=ht_batch_threads))ht_release(ctx);
    llama_set_n_threads(ctx,nd,nb);ht_ensure(ctx);
}
