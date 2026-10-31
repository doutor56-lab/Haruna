// Included inside the pinned Android binding, after its decode helper.
// One authoritative GGUF/Jinja rendering per request; no raw prompt is streamed or logged.
#include <atomic>
#include <stdexcept>

static std::atomic<int> haruna_input_tokens{-1};
static std::atomic<int> haruna_output_tokens{-1};
static std::atomic<int> haruna_history_messages{-1};
static std::atomic<int> haruna_template_from_gguf{-1};
static std::atomic<int> haruna_context_capacity{-1};

static std::string haruna_jstring(JNIEnv * env, jstring value) {
    return hs_from_java(env, value);
}

static llama_tokens haruna_tokenize(const common_chat_prompt & prompt) {
    const auto * vocab = llama_model_get_vocab(g_model);
    llama_tokens tokens;
    // The official formatter removes automatic BOS/EOS from the template.
    // Add each once around the entire sequence, not once per content part.
    if (llama_vocab_get_add_bos(vocab) && llama_vocab_bos(vocab) != LLAMA_TOKEN_NULL)
        tokens.push_back(llama_vocab_bos(vocab));
    for (const auto & part : prompt.parts) {
        // Literal special-token spellings in user/doc/history content remain literal text.
        auto next = common_tokenize(vocab, part.text, false, !part.is_input);
        tokens.insert(tokens.end(), next.begin(), next.end());
    }
    if (llama_vocab_get_add_eos(vocab) && llama_vocab_eos(vocab) != LLAMA_TOKEN_NULL)
        tokens.push_back(llama_vocab_eos(vocab));
    return tokens;
}

// Boundaries are derived from the SAME official template, then proven token-by-token.
static size_t hi_prefix_cut(const llama_tokens&full,const std::vector<common_chat_msg>&messages,bool thinking){
    common_chat_templates_inputs input;input.messages=messages;input.use_jinja=true;input.add_generation_prompt=false;input.enable_thinking=thinking;
    auto t=hm_clock();auto formatted=common_chat_templates_apply(g_chat_templates.get(),input);hm_template+=hm_clock()-t;
    t=hm_clock();const auto prefix=haruna_tokenize(formatted.prompt);hm_tokenize+=hm_clock()-t;
    return std::min(haruna_incremental::Session<llama_token>::common(full,prefix),full.empty()?size_t(0):full.size()-1);
}
static int hi_prefill(const llama_tokens&tokens,size_t reused){
    std::vector<size_t> cuts;
    for(const auto n:{hi_system_boundary,hi_turn_boundary,tokens.size()})if(n>reused&&n<=tokens.size())cuts.push_back(n);
    std::sort(cuts.begin(),cuts.end());cuts.erase(std::unique(cuts.begin(),cuts.end()),cuts.end());
    size_t start=reused;
    for(const auto end:cuts){if(hs_check_cancel())return 5;const int code=decode_tokens_in_batches(g_context,g_batch,tokens,0,end==tokens.size(),static_cast<int>(start),static_cast<int>(end));if(code)return code;
        if(end==hi_system_boundary)hi_capture(0,end);
        if(end==hi_turn_boundary)hi_capture(1,end);
        start=end;
    }
    return 0;
}

extern "C" JNIEXPORT jint JNICALL
Java_com_arm_aichat_internal_InferenceEngineImpl_processChatMessages(
        JNIEnv * env, jobject, jobjectArray roles, jobjectArray contents,
        jint n_predict, jboolean enable_thinking, jstring conversation_key, jlong conversation_revision, jstring lab_config, jstring stable_system) {
    hm_begin();
    haruna_input_tokens = -1; haruna_output_tokens = -1;
    haruna_history_messages = -1; haruna_template_from_gguf = -1; haruna_context_capacity = -1;
    try {
        if (hs_check_cancel()) return 5;
        if (g_model == nullptr || g_context == nullptr || g_sampler == nullptr || !g_chat_templates || roles == nullptr || contents == nullptr)
            throw std::runtime_error("Chat runtime unavailable");
        hl_configure(haruna_jstring(env,lab_config));
        const auto preparation_start=hm_clock();
        const int count = env->GetArrayLength(roles);
        if (count < 2 || count > (hi_eligible()?128:18) || count != env->GetArrayLength(contents))
            throw std::runtime_error("Invalid chat message count");
        std::vector<common_chat_msg> messages;
        for (int i = 0; i < count; ++i) {
            if (hs_check_cancel()) return 5;
            auto role = static_cast<jstring>(env->GetObjectArrayElement(roles, i));
            auto content = static_cast<jstring>(env->GetObjectArrayElement(contents, i));
            common_chat_msg message;
            message.role = haruna_jstring(env, role); message.content = haruna_jstring(env, content);
            env->DeleteLocalRef(role); env->DeleteLocalRef(content);
            if ((i == 0 && message.role != ROLE_SYSTEM) ||
                (i > 0 && message.role != ROLE_USER && message.role != ROLE_ASSISTANT))
                throw std::runtime_error("Invalid chat role");
            messages.push_back(std::move(message));
        }
        if (messages.back().role != ROLE_USER) throw std::runtime_error("Chat must end with a user message");
        const int limit = llama_n_ctx(g_context) - OVERFLOW_HEADROOM;
        const int predict = std::max(16, std::min(1024, static_cast<int>(n_predict)));
        llama_tokens tokens;common_chat_prompt canonical;
        while (true) {
            if (hs_check_cancel()) return 5;
            common_chat_templates_inputs input;
            input.messages = messages;
            input.use_jinja = true;
            input.add_generation_prompt = true;
            input.enable_thinking = enable_thinking;
            // No override: common_chat_templates_init(g_model, "") reads this GGUF's metadata.
            const auto template_start = hm_clock();
            hm_stage = 1;
            auto formatted = common_chat_templates_apply(g_chat_templates.get(), input);
            if(hl_inspector) { std::lock_guard<std::mutex> lock(hl_lock); hl_prompt.clear(); for(const auto & part: formatted.prompt.parts) hl_prompt+=part.text; }
            hm_template += hm_clock() - template_start;
            if (hs_check_cancel()) return 5;
            const auto tokenize_start = hm_clock();
            hm_stage = 2;
            tokens = haruna_tokenize(formatted.prompt);
            hm_tokenize += hm_clock() - tokenize_start;
            if (hs_check_cancel()) return 5;
            if (!tokens.empty() && static_cast<int>(tokens.size()) + predict <= limit){canonical=std::move(formatted.prompt);break;}
            if (messages.size() <= 2) throw std::runtime_error("Chat input exceeds context capacity");
            // Evict only oldest history, never identity, current profile or current user input.
            const size_t remove = messages[1].role == ROLE_USER && messages.size() > 3 &&
                                  messages[2].role == ROLE_ASSISTANT ? 2 : 1;
            messages.erase(messages.begin() + 1, messages.begin() + 1 + remove);
            hm_removed += remove;
        }
        if(hi_enabled&&hi_eligible()){
            const auto stable=haruna_jstring(env,stable_system);
            try{hi_turn_boundary=hi_prefix_cut(tokens,messages,enable_thinking);
                if(messages.back().content.find("<dados_de_referencia>")!=std::string::npos){
                    for(size_t i=canonical.parts.size();i>0;--i)if(canonical.parts[i-1].is_input&&canonical.parts[i-1].text==messages.back().content){
                        auto before=canonical;before.parts.resize(i-1);const auto t=hm_clock();const auto prefix=haruna_tokenize(before);hm_tokenize+=hm_clock()-t;
                        hi_turn_boundary=haruna_incremental::Session<llama_token>::common(tokens,prefix);hi_note("checkpointBeforeTransientInput",true);break;
                    }
                }
            }catch(...){hi_turn_boundary=0;}
            if(!stable.empty()&&messages.front().content.compare(0,stable.size(),stable)==0){
                try{common_chat_msg base;base.role=ROLE_SYSTEM;base.content=stable;hi_system_boundary=hi_prefix_cut(tokens,{base},enable_thinking);}catch(...){hi_system_boundary=0;}
            }
        }
        const auto key=haruna_jstring(env,conversation_key);
        if (key.size()>160) throw std::runtime_error("Invalid conversation identity");
        const size_t reuse=hk_reconcile(tokens,key,conversation_revision,enable_thinking);
        reset_long_term_states(false); reset_short_term_states(); hd_prepare_sampler(); common_sampler_reset(g_sampler);
        hs_sampler_reset_observed();
        hm_input = tokens.size(); hm_stage = 3;
        hi_note("preparationUs",hm_clock()-preparation_start);hi_note("contextRecreated",hc_rebuild_us>0);
        const auto prefill_start = hm_clock();
        const auto prefill_result = hi_active?hi_prefill(tokens,reuse):decode_tokens_in_batches(g_context, g_batch, tokens, 0, true, static_cast<int>(reuse));
        hm_prefill = hm_clock() - prefill_start;
        hi_note("prefillUs",hm_prefill.load());hi_note("tokenizeUs",hm_tokenize.load());
        if (prefill_result != 0) {
            if (hs_check_cancel()) return 5;
            hm_finish(6);
            throw std::runtime_error("Chat input decoding failed");
        }
        if (hs_check_cancel()) return 5;
        hk_prefill_finished();
        chat_msgs = std::move(messages);
        current_position = static_cast<llama_pos>(tokens.size());
        hm_occupied = current_position;
        stop_generation_position = current_position + predict;
        haruna_input_tokens = static_cast<int>(tokens.size()); haruna_output_tokens = 0;
        haruna_history_messages = static_cast<int>(chat_msgs.size()) - 2;
        haruna_template_from_gguf = common_chat_templates_was_explicit(g_chat_templates.get()) ? 1 : 0;
        haruna_context_capacity = llama_n_ctx(g_context);
        hm_context();
        if(hc_config.experimental&&hc_config.fa>=0&&haruna_observed_flash(g_context)!=hc_config.fa)throw std::runtime_error("Effective FA not confirmed");
        hm_stage = 4;
        return 0;
    } catch (...) {
        if (hm_reason.load()!=6 && hm_reason.load()!=5 && hm_reason.load()!=7 && hm_reason.load()!=8 && hm_reason.load()!=9) hm_finish(4);
        // Never propagate a template exception containing message text to Java/logcat.
        try {
            if (g_context != nullptr) { hk_invalidate(HkReason::native_error,true); reset_long_term_states(false); reset_short_term_states(); }
        } catch (...) { hk_ledger.invalidate(HkReason::native_error); hk_publish(); }
        return 3;
    }
}

extern "C" JNIEXPORT jintArray JNICALL
Java_com_arm_aichat_internal_InferenceEngineImpl_chatMetrics(JNIEnv * env, jobject) {
    const jint values[] = {haruna_input_tokens.load(), haruna_output_tokens.load(),
                          haruna_history_messages.load(), haruna_template_from_gguf.load(), haruna_context_capacity.load()};
    auto result = env->NewIntArray(5);
    if (result != nullptr) env->SetIntArrayRegion(result, 0, 5, values);
    return result;
}

extern "C" JNIEXPORT jint JNICALL
Java_com_arm_aichat_internal_InferenceEngineImpl_invalidatePrefix(JNIEnv *,jobject) {
    if (hs_ticket.load()!=0) return 1;
    try {
        hk_invalidate(HkReason::explicit_reset,true);
        reset_long_term_states(false); reset_short_term_states();
        return 0;
    } catch (...) { haruna_release_resources(); return 2; }
}

