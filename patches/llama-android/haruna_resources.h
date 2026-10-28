// Included after long/short state reset helpers. Only the serialized inference owner calls these.
static void haruna_release_resources() {
    hk_release();
    reset_long_term_states(false); reset_short_term_states();
    if (g_sampler) { auto * owned=g_sampler; g_sampler=nullptr; common_sampler_free(owned); }
    g_chat_templates.reset(); g_batch=common_batch();
    if (g_context) { auto * owned=g_context; g_context=nullptr; llama_free(owned); }
    if (g_model) { auto * owned=g_model; g_model=nullptr; llama_model_free(owned); ++hs_unloads; }
    hs_resources=0; hm_unloaded(); hs_recent.fill(LLAMA_TOKEN_NULL); hs_recent_count=0;
}
extern "C" JNIEXPORT jint JNICALL
Java_com_arm_aichat_internal_InferenceEngineImpl_finishGeneration(JNIEnv *,jobject,jlong ticket) {
    {
        std::lock_guard<std::mutex> guard(hs_mutex);
        if (ticket<=0 || (hs_ticket.load()!=ticket && hs_ticket.load()!=-ticket)) return 1;
    }
    int result=0;
    try {
        const bool cancelled=hs_check_cancel();
        hk_finish_request(hm_reason.load());
        if (cancelled || (hm_reason.load()!=1 && hm_reason.load()!=2)) {
            reset_long_term_states(false); reset_short_term_states();
            if (g_sampler) common_sampler_reset(g_sampler);
        } else hs_logits_observed();
    } catch (...) { haruna_release_resources(); result=2; }
    hs_recent.fill(LLAMA_TOKEN_NULL); hs_recent_count=0;
    { std::lock_guard<std::mutex> guard(hs_mutex); hs_ticket.store(0,std::memory_order_release); }
    return result;
}
