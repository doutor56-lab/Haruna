// Volatile, model-owned STATIC instructions only. Never cache a user's profile/documents here.
static haruna_prefix::Owner hw_owner;
static llama_tokens hw_tokens;
static std::vector<uint8_t> hw_state;
static int hw_threads=0,hw_batch_threads=0;
static void hw_release(){
    llama_tokens().swap(hw_tokens);std::vector<uint8_t>().swap(hw_state);hw_owner={};hw_threads=hw_batch_threads=0;
    std::lock_guard<std::mutex>l(hm_lock);hm_runtime["startup"]={{"status","not_prepared"},{"systemPrefixTokens",0},{"snapshotBytes",0},{"restoredForRequest",false}};
}
static bool hw_eligible(){
    char arch[64]={};if(!g_model||!g_context||!llama_get_memory(g_context))return false;
    llama_model_meta_val_str(g_model,"general.architecture",arch,sizeof(arch));
    return std::string(arch)=="smollm3"&&!llama_model_is_hybrid(g_model)&&!llama_model_is_recurrent(g_model)&&!llama_model_has_encoder(g_model)&&!llama_model_is_diffusion(g_model);
}
static void hw_result(const char*status,int64_t elapsed,size_t tokens=0,size_t bytes=0){
    std::lock_guard<std::mutex>l(hm_lock);hm_runtime["startup"]={{"status",status},{"preparationUs",elapsed},{"systemPrefixTokens",tokens},{"snapshotBytes",bytes},{"chargedTo","model_loading"},{"restoredForRequest",false},{"labPrefixReuse",false}};
}
static int hw_prime(const std::string&system,const std::string&config,uint64_t max_bytes){
    const auto begin=hm_clock();hw_release();
    if(!hw_eligible()){hw_result("not_applicable",hm_clock()-begin);return 0;}
    if(max_bytes<1024*1024||system.empty()){hw_result("skipped_memory_margin",hm_clock()-begin);return 0;}
    try{
        // Apply the same per-model context/threads that the first user request will use.
        ho_configure(config);hl_configure("");ht_ensure(g_context);
        common_chat_msg msg;msg.role=ROLE_SYSTEM;msg.content=system;
        common_chat_templates_inputs input;input.messages={msg};input.use_jinja=true;input.add_generation_prompt=false;input.enable_thinking=false;
        const auto formatted=common_chat_templates_apply(g_chat_templates.get(),input);
        auto tokens=haruna_tokenize(formatted.prompt);
        if(tokens.size()<48){hw_result("skipped_short_prefix",hm_clock()-begin);return 0;}
        // Exclude the system terminator/tail. Later extensions still need exact token equality.
        tokens.resize(std::min<size_t>(512,tokens.size()-16));
        hk_invalidate(HkReason::explicit_reset,true);
        for(size_t at=0;at<tokens.size();at+=llama_n_batch(g_context)){
            common_batch batch(g_context);const size_t end=std::min(tokens.size(),at+llama_n_batch(g_context));
            for(size_t i=at;i<end;++i)batch.add(tokens[i],i,{0},i+1==tokens.size());
            const int code=llama_process(g_context,LLAMA_PROCESS_TYPE_DECODE,batch.get());
            if(code!=0)throw std::runtime_error("Static prefix decode failed");
        }
        llama_synchronize(g_context);
        const auto bytes=llama_state_seq_get_size_ext(g_context,0,LLAMA_STATE_SEQ_FLAGS_NONE);
        const size_t budget=std::min<uint64_t>(max_bytes,64ULL*1024*1024);
        if(bytes&&bytes<=budget){
            std::vector<uint8_t> state(bytes);
            if(llama_state_seq_get_data_ext(g_context,state.data(),state.size(),0,LLAMA_STATE_SEQ_FLAGS_NONE)!=bytes)throw std::runtime_error("Static prefix capture failed");
            hw_tokens=std::move(tokens);hw_state=std::move(state);
            hw_owner={"",0,static_cast<uint64_t>(hs_loads.load()),g_context,g_chat_templates.get(),false};
            hw_threads=llama_n_threads(g_context);hw_batch_threads=llama_n_threads_batch(g_context);
        }
        // Saved state is restored explicitly: do not pretend the live conversation already owns it.
        llama_memory_clear(llama_get_memory(g_context),true);llama_synchronize(g_context);llama_perf_context_reset(g_context);
        hk_ledger.invalidate(HkReason::explicit_reset);hk_publish();
        hw_result(hw_state.empty()?"skipped_snapshot_budget":"static_prefix_ready",hm_clock()-begin,hw_tokens.size(),hw_state.size());
        return 0;
    }catch(const std::bad_alloc&){
        hw_release();if(!g_context){hw_result("failed",hm_clock()-begin);return 1;}
        llama_memory_clear(llama_get_memory(g_context),true);hk_ledger.invalidate(HkReason::explicit_reset);hk_publish();
        hw_result("skipped_allocation",hm_clock()-begin);return 0;
    }catch(...){hw_release();if(g_context)llama_memory_clear(llama_get_memory(g_context),true);hk_ledger.invalidate(HkReason::native_error);hk_publish();hw_result("failed",hm_clock()-begin);return 1;}
}
static void hw_try_restore(const llama_tokens &tokens,const haruna_prefix::Owner &owner){
    {std::lock_guard<std::mutex>l(hm_lock);if(hm_runtime.contains("startup"))hm_runtime["startup"]["restoredForRequest"]=false;}
    // All canonical lab/diagnostic requests omit normal config, even when the model was primed.
    if(ho_settings.is_null()||!hw_eligible()||hw_state.empty()||hw_tokens.size()>=tokens.size()||owner.conversation.empty())return;
    if(owner.model!=hw_owner.model||owner.context!=hw_owner.context||owner.chat_template!=hw_owner.chat_template||owner.thinking!=hw_owner.thinking||llama_n_threads(g_context)!=hw_threads||llama_n_threads_batch(g_context)!=hw_batch_threads)return;
    if(!std::equal(hw_tokens.begin(),hw_tokens.end(),tokens.begin()))return;
    const auto &old=hk_ledger.owner;
    const bool same=old.model==owner.model&&old.context==owner.context&&old.chat_template==owner.chat_template&&old.thinking==owner.thinking&&old.conversation==owner.conversation&&old.revision==owner.revision;
    if(same&&hk_ledger.valid&&hk_bounds(hk_ledger.confirmed.size())){
        size_t common=0;while(common<std::min(hk_ledger.confirmed.size(),tokens.size())&&hk_ledger.confirmed[common]==tokens[common])++common;
        if(common>=hw_tokens.size())return; // Keep the longer valid conversation prefix.
    }
    const auto begin=hm_clock();hk_clear_memory();
    const auto n=llama_state_seq_set_data_ext(g_context,hw_state.data(),hw_state.size(),0,LLAMA_STATE_SEQ_FLAGS_NONE);
    if(n!=hw_state.size()||!hk_bounds(hw_tokens.size())){hk_clear_memory();hk_ledger.invalidate(HkReason::memory_mismatch);hw_release();return;}
    hk_ledger.owner=owner;hk_ledger.confirmed=hw_tokens;hk_ledger.valid=true;hk_ledger.tracking=true;hk_publish();
    std::lock_guard<std::mutex>l(hm_lock);hm_runtime["startup"]["restoredForRequest"]=true;hm_runtime["startup"]["restoreUs"]=hm_clock()-begin;
}
extern "C" JNIEXPORT jint JNICALL
Java_com_arm_aichat_internal_InferenceEngineImpl_primeSystemNative(JNIEnv *env,jobject,jstring system,jstring config,jlong max_bytes){
    if(hs_ticket.load()!=0||!g_model||!g_context)return 1;
    try{return hw_prime(haruna_jstring(env,system),haruna_jstring(env,config),max_bytes>0?static_cast<uint64_t>(max_bytes):0);}
    catch(...){return 1;}
}
