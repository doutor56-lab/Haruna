// Included after baseline metric helpers. One generation, positive ticket; cancelled ticket is negative.
#include <array>
#include <limits>
#include <cmath>
static void haruna_release_resources();
static std::atomic<int64_t> hs_ticket{0};
static std::mutex hs_mutex;
struct HarunaControlObservation {
    int64_t ticket=0, requested=-1, acknowledged=-1;
    int reason=0, phase=0;
    uint32_t seed=0;
    bool seed_valid=false, sampler_reset=false;
};
static HarunaControlObservation hs_control;
static std::atomic<int> hs_resources{0}; // model=1, context=2, sampler=4, batch=8
static std::atomic<bool> hs_backend_ready{false};
static bool hs_registry_loaded=false; // libraries/registry survive llama_backend_free()
static std::atomic<int64_t> hs_loads{0}, hs_unloads{0}, hs_stale_cancel{0};
static std::array<llama_token,16> hs_recent{}; // internal transient window, never exported
static int hs_recent_count=0, hs_run=0;
static std::atomic<int> hs_max_run{0}, hs_period2{0}, hs_logit_checks{0}, hs_nan{0}, hs_inf{0};
static std::atomic<int64_t> hs_logit_us{0};
static float hs_logit_min=0, hs_logit_max=0;

static bool hs_check_cancel() {
    const auto ticket=hs_ticket.load(std::memory_order_acquire);
    if (ticket>=0) return false;
    std::lock_guard<std::mutex> guard(hs_mutex);
    if (hs_ticket.load()!=ticket) return false;
    if (hs_control.acknowledged<0) {
        hs_control.acknowledged=hm_clock(); hs_control.phase=hm_stage.load();
    }
    hm_finish(hs_control.reason);
    return true;
}
static bool hs_abort(void *) { return hs_check_cancel(); }

extern "C" JNIEXPORT jint JNICALL
Java_com_arm_aichat_internal_InferenceEngineImpl_reserveGeneration(JNIEnv *,jobject,jlong ticket) {
    if (ticket<=0) return 1;
    std::lock_guard<std::mutex> guard(hs_mutex);
    if (hs_ticket.load()!=0) return 2;
    hs_control=HarunaControlObservation{}; hs_control.ticket=ticket;
    hm_stage=0; hm_reason=0;
    hs_max_run=0; hs_period2=0; hs_logit_checks=0; hs_nan=0; hs_inf=0; hs_logit_us=0;
    hs_recent.fill(LLAMA_TOKEN_NULL); hs_recent_count=0; hs_run=0;
    hs_ticket.store(ticket,std::memory_order_release);
    return 0;
}
extern "C" JNIEXPORT jboolean JNICALL
Java_com_arm_aichat_internal_InferenceEngineImpl_cancelGeneration(JNIEnv *,jobject,jlong ticket,jint reason) {
    std::lock_guard<std::mutex> guard(hs_mutex);
    if (ticket<=0 || (hs_ticket.load()!=ticket && hs_ticket.load()!=-ticket)) { ++hs_stale_cancel; return false; }
    if (hs_ticket.load()==-ticket) return true;
    if (hm_stage.load()==5) return false;
    hs_control.requested=hm_clock();
    hs_control.reason=(reason==7 || reason==8 || reason==9) ? reason : 5;
    hs_ticket.store(-ticket,std::memory_order_release);
    return true;
}
extern "C" JNIEXPORT jint JNICALL
Java_com_arm_aichat_internal_InferenceEngineImpl_nativeStopCode(JNIEnv *,jobject) { return hm_reason.load(); }

static void hs_sampler_reset_observed() {
    std::lock_guard<std::mutex> guard(hs_mutex);
    hs_control.seed=common_sampler_get_seed(g_sampler); hs_control.seed_valid=true; hs_control.sampler_reset=true;
}
static void hs_token_observed(llama_token token) {
    // Count generic runs and lag-2 matches. No decisions, filters or exported token IDs.
    const int count=hs_recent_count;
    hs_run=count>0 && hs_recent[(count-1)%16]==token ? hs_run+1 : 1;
    hs_max_run=std::max(hs_max_run.load(),hs_run);
    if (count>=2 && hs_recent[(count-2)%16]==token) ++hs_period2;
    hs_recent[count%16]=token; ++hs_recent_count;
}
static void hs_logits_observed() {
    if (!g_context || !g_model || hs_logit_checks.load()>=2) return;
    const auto started=hm_clock();
    const auto * logits=llama_get_logits_ith(g_context,-1);
    if (!logits) return;
    int nan=0,inf=0; float low=std::numeric_limits<float>::max(), high=-low;
    const int n=llama_vocab_n_tokens(llama_model_get_vocab(g_model));
    for (int i=0;i<n;++i) {
        if (std::isnan(logits[i])) ++nan;
        else if (!std::isfinite(logits[i])) ++inf;
        else { low=std::min(low,logits[i]); high=std::max(high,logits[i]); }
    }
    { std::lock_guard<std::mutex> guard(hs_mutex); hs_logit_min=low; hs_logit_max=high; }
    hs_nan+=nan; hs_inf+=inf; ++hs_logit_checks; hs_logit_us+=hm_clock()-started;
}
static HarunaJson hs_snapshot() {
    HarunaControlObservation c; float low,high;
    { std::lock_guard<std::mutex> guard(hs_mutex); c=hs_control; low=hs_logit_min; high=hs_logit_max; }
    HarunaJson r={{"requestSerial",c.ticket},{"activeTicket",std::abs(hs_ticket.load())},
        {"backendInitialized",hs_backend_ready.load()},
        {"cancelRequested",c.requested>=0},{"cancelAcknowledged",c.acknowledged>=0},
        {"cancelPhase",c.phase},{"requestedReason",c.reason},{"resources",hs_resources.load()},
        {"modelsLoaded",hs_loads.load()},{"modelsReleased",hs_unloads.load()},
        {"staleCancelIgnored",hs_stale_cancel.load()},{"samplerReset",c.sampler_reset},
        {"maxTokenRun",hs_max_run.load()},{"lag2Matches",hs_period2.load()},
        {"logitProbes",hs_logit_checks.load()},{"nanLogits",hs_nan.load()},
        {"infiniteLogits",hs_inf.load()},{"logitProbeUs",hs_logit_us.load()}};
    if (c.requested>=0 && c.acknowledged>=c.requested) r["cancelLatencyUs"]=c.acknowledged-c.requested;
    if (c.seed_valid) r["samplerSeed"]=c.seed;
    if (hs_logit_checks.load()>0 && low<=high) { r["logitMin"]=low; r["logitMax"]=high; }
    return r;
}
