#include <cmath>
#include <stdexcept>
static std::mutex hl_lock;
static std::string hl_prompt;
static HarunaJson hl_snapshot() { std::lock_guard<std::mutex> lock(hl_lock); return {{"canonicalFormattedPrompt",hl_prompt}}; }
// Lab settings only arrive from the DEBUG-only canonical benchmark owner.
static bool hl_sampler=false, hl_inspector=false;
static int hl_threads=0, hl_threads_batch=0;
static void hl_configure(const std::string & json) {
    { std::lock_guard<std::mutex> lock(hl_lock); hl_prompt.clear(); }
    hl_inspector=false;
    const bool inspect_only=!json.empty() && HarunaJson::parse(json).value("inspectOnly",false);
    if (json.empty() || inspect_only) {
        hl_inspector=inspect_only;
        if (hl_sampler) { if(g_context&&hl_threads>0)llama_set_n_threads(g_context,hl_threads,hl_threads_batch);auto * old=g_sampler;g_sampler=new_sampler(DEFAULT_SAMPLER_TEMP);common_sampler_free(old);hl_sampler=false; }
        return;
    }
    hl_inspector=true;
    if(hd_fixed_seed||hd_fa_off||hd_sampler_fixed)throw std::runtime_error("Restore previous DBG experiment before lab");
    const auto p=HarunaJson::parse(json);
    if(!hl_sampler){hl_threads=llama_n_threads(g_context);hl_threads_batch=llama_n_threads_batch(g_context);}
    const int nt=p.value("threads",0),nb=p.value("threadsBatch",0);
    if(nt<0||nt>16||nb<0||nb>16)throw std::runtime_error("Invalid lab threads");
    common_params_sampling s;
    s.temp=p.at("temperature").get<float>();s.top_k=p.at("topK").get<int>();
    s.top_p=p.at("topP").get<float>();s.min_p=p.at("minP").get<float>();
    s.penalty_present=p.at("presence").get<float>();s.penalty_freq=p.at("frequency").get<float>();
    s.penalty_repeat=p.at("repeat").get<float>();s.seed=p.at("seed").get<uint32_t>();
    if (!std::isfinite(s.temp)||s.temp<0||s.temp>2||s.top_k<0||s.top_k>1000||
        !std::isfinite(s.top_p)||s.top_p<=0||s.top_p>1||!std::isfinite(s.min_p)||s.min_p<0||s.min_p>1||
        !std::isfinite(s.penalty_present)||std::abs(s.penalty_present)>2||
        !std::isfinite(s.penalty_freq)||std::abs(s.penalty_freq)>2||
        !std::isfinite(s.penalty_repeat)||s.penalty_repeat<0.5||s.penalty_repeat>2)throw std::runtime_error("Invalid lab sampler");
    auto * replacement=common_sampler_init(g_model,s);
    if (!replacement)throw std::runtime_error("Lab sampler allocation failed");
    auto * old=g_sampler;g_sampler=replacement;common_sampler_free(old);hl_sampler=true;
    llama_set_n_threads(g_context,nt?nt:hl_threads,nb?nb:hl_threads_batch);
    hd_sampler_observed(s,g_sampler);
    if (!p.at("cache").get<bool>()) hk_invalidate(HkReason::legacy_reset,true);
}
