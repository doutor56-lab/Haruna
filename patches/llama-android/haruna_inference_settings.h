// Trusted normal preferences arrive through the serialized owner, independently of labConfig.
static HarunaJson ho_settings;
static void ho_model_prepared() {
    HarunaJson supported=nullptr;
    try { if(g_chat_templates)supported=common_chat_templates_support_enable_thinking(g_chat_templates.get()); }
    catch(...) { /* A capability probe must never prevent an otherwise valid model from loading. */ }
    std::lock_guard<std::mutex>l(hm_lock);hm_runtime["thinkingSupported"]=supported;
}
static void ho_configure(const std::string & json) {
    ho_settings = json.empty() ? HarunaJson() : HarunaJson::parse(json);
}
static bool ho_apply() {
    if (ho_settings.is_null()) return false; // Preserve canonical lab/legacy behavior.
    const auto & p=ho_settings;
    const int nt=p.at("threads").get<int>(), nb=p.at("threadsBatch").get<int>();
    if(nt<0||nt>16||nb<0||nb>16)throw std::runtime_error("Invalid inference threads");
    common_params_sampling s;
    s.temp=p.at("temperature").get<float>();s.top_k=p.at("topK").get<int>();
    s.top_p=p.at("topP").get<float>();s.min_p=p.at("minP").get<float>();
    s.penalty_repeat=p.at("repeat").get<float>();s.penalty_present=p.at("presence").get<float>();s.penalty_freq=p.at("frequency").get<float>();
    const int64_t seed=p.at("seed").get<int64_t>();
    if(!std::isfinite(s.temp)||s.temp<0||s.temp>2||s.top_k<0||s.top_k>1000||!std::isfinite(s.top_p)||s.top_p<=0||s.top_p>1||
       !std::isfinite(s.min_p)||s.min_p<0||s.min_p>1||!std::isfinite(s.penalty_repeat)||s.penalty_repeat<0.5||s.penalty_repeat>2||
       !std::isfinite(s.penalty_present)||std::abs(s.penalty_present)>2||!std::isfinite(s.penalty_freq)||std::abs(s.penalty_freq)>2||seed< -1||seed>=UINT32_MAX)
        throw std::runtime_error("Invalid inference sampler");
    s.seed=seed<0?LLAMA_DEFAULT_SEED:static_cast<uint32_t>(seed);
    // Reuse the audited context recreation path and its confirmation of effective sizes.
    auto context=hc_parse(p);hc_requested={{"nCtx",context.context},{"nBatch",context.batch},{"nUbatch",context.ubatch},{"flashAttention",p.at("flashAttention")}};
    hc_ensure(context);hc_observe();
    auto * replacement=common_sampler_init(g_model,s);
    if(!replacement)throw std::runtime_error("Inference sampler allocation failed");
    auto * old=g_sampler;g_sampler=replacement;common_sampler_free(old);
    llama_context_params base=llama_context_default_params();
    const int automatic=std::max(N_THREADS_MIN,std::min(N_THREADS_MAX,static_cast<int>(sysconf(_SC_NPROCESSORS_ONLN))-N_THREADS_HEADROOM));
    base.n_threads=base.n_threads_batch=automatic;hc_apply(base,g_model,false);
    llama_set_n_threads(g_context,nt?nt:base.n_threads,nb?nb:base.n_threads_batch);
    hd_sampler_observed(s,g_sampler);hm_context();
    {std::lock_guard<std::mutex>l(hm_lock);hm_runtime["normalInference"]={{"profile",p.value("profile",std::string("custom"))},{"requested",p},{"jinja",true},{"mmapRequested",true}};}
    return true;
}
