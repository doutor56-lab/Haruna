// Runs exclusively in the existing serialized inference owner with the current cancellation ticket.
static HarunaContextConfig hc_parse(const HarunaJson & p){
    HarunaContextConfig c;c.context=p.value("nCtx",8192);c.batch=p.value("nBatch",512);c.ubatch=p.value("nUbatch",512);
    const auto fa=p.value("flashAttention",std::string("auto")),k=p.value("typeK",std::string("f16")),v=p.value("typeV",std::string("f16"));
    if(fa!="auto"&&fa!="on"&&fa!="off")throw std::runtime_error("Invalid FA request");
    c.fa=fa=="auto"?-1:fa=="on"?1:0;
    if((k!="f16"&&k!="q8_0")||(v!="f16"&&v!="q8_0"))throw std::runtime_error("Unsupported KV type");
    c.k=k=="q8_0";c.v=v=="q8_0";
    if((c.context!=1024&&c.context!=2048&&c.context!=4096&&c.context!=8192)||c.batch<32||c.batch>1024||c.ubatch<32||c.ubatch>512||c.ubatch>c.batch||c.batch>c.context)throw std::runtime_error("Invalid context/batch/ubatch");
    if(llama_model_is_recurrent(g_model)&&!llama_model_is_hybrid(g_model)&&(c.k||c.v))throw std::runtime_error("No attention KV type can be confirmed for a purely recurrent model");
    if(c.v&&c.fa!=1)throw std::runtime_error("Q8 V requires explicitly enabled Flash Attention");
    if(hd_fa_off&&c.fa!=0)throw std::runtime_error("Restore legacy FA OFF before using this lab FA setting");
    c.experimental=!(c.context==8192&&c.batch==512&&c.ubatch==512&&c.fa==-1&&!c.k&&!c.v);
    return c;
}
static void hc_ensure(const HarunaContextConfig & requested){
    hc_rebuild_us=0;
    if(g_context&&hc_config==requested)return;
    const auto started=hm_clock();
    hk_release();reset_long_term_states(false);reset_short_term_states();g_batch=common_batch();
    if(g_context){llama_free(g_context);g_context=nullptr;}hs_resources=5;
    {std::lock_guard<std::mutex> lock(hm_lock);for(const auto key:{"nCtx","nBatch","nUbatch","kvActualK","kvActualV","flashEffective"})hm_runtime.erase(key);hm_runtime["contextExperiment"]={{"requested",hc_requested},{"state","recreating"}};}
    hc_config=requested;
    try{
        g_context=init_context(g_model,DEFAULT_CONTEXT_SIZE,true);
        if(!g_context)throw std::runtime_error("Context creation failed; restore defaults");
        if(requested.experimental&&(llama_n_ctx(g_context)!=static_cast<uint32_t>(requested.context)||llama_n_batch(g_context)!=static_cast<uint32_t>(requested.batch)||llama_n_ubatch(g_context)!=static_cast<uint32_t>(requested.ubatch)))throw std::runtime_error("Runtime did not confirm requested context sizes");
        if((requested.k&&haruna_observed_kv_type(g_context,0)!=GGML_TYPE_Q8_0)||(requested.v&&haruna_observed_kv_type(g_context,1)!=GGML_TYPE_Q8_0))throw std::runtime_error("Quantized KV effective type not confirmed for this memory implementation");
        g_batch=common_batch(g_context);hs_resources=15;
    }catch(...){g_batch=common_batch();{std::lock_guard<std::mutex> lock(hm_lock);hm_runtime["contextExperiment"]={{"requested",hc_requested},{"state","error"}};}if(g_context){llama_free(g_context);g_context=nullptr;}hc_config={};throw;}
    hc_rebuild_us=hm_clock()-started;
    hm_context();
}
static void hc_observe(){
    std::lock_guard<std::mutex> lock(hm_lock);
    hm_runtime["contextExperiment"]={{"requested",hc_requested},{"state","ready"},{"recreationUs",hc_rebuild_us},{"configured",{{"nCtx",g_context?llama_n_ctx(g_context):0},{"nBatch",g_context?llama_n_batch(g_context):0},{"nUbatch",g_context?llama_n_ubatch(g_context):0},{"flashAttention",hm_runtime.value("flashRequested",HarunaJson(nullptr))},{"typeK",hm_runtime.value("kvK",HarunaJson(nullptr))},{"typeV",hm_runtime.value("kvV",HarunaJson(nullptr))}}}};
}
