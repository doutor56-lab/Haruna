// Included after baseline/control/string helpers; only the serialized inference owner reads KV.
#include "haruna_prefix_ledger.h"
using HkReason = haruna_prefix::Reason;
static haruna_prefix::Ledger<llama_token> hk_ledger;
static std::mutex hk_lock;
struct HkObservation {
    int64_t input=0, reused=0, common=0, before=0, reconciled=0, after_prefill=0, after=0,
        pruned=0, cleanup_pruned=0, reconcile_us=0, confirmed_cancel=0, prefill_cancel=0;
    uint64_t conversation=0;
    bool supported=false, full_match=false, started=false, planned=false;
    HkReason reason=HkReason::empty, invalidation=HkReason::empty;
};
static HkObservation hk_observation;
static uint64_t hk_conversation_serial=0;
static std::atomic<int> hk_confirmed{0};
static std::atomic<bool> hk_valid{false};
static bool hk_prepared_request=false, hk_prefill_complete=false;
static size_t hk_prompt_boundary=0;

static int64_t hk_memory_count() {
    if (!g_context) return 0;
    const auto mem=llama_get_memory(g_context);
    if (!mem) return 0;
    const auto low=llama_memory_seq_pos_min(mem,0), high=llama_memory_seq_pos_max(mem,0);
    return low>=0 && high>=low ? int64_t(high)-low+1 : 0;
}
static bool hk_bounds(size_t count) {
    if (!g_context || !llama_get_memory(g_context)) return false;
    auto mem=llama_get_memory(g_context);
    return count==0 ? llama_memory_seq_pos_min(mem,0)==-1 && llama_memory_seq_pos_max(mem,0)==-1 :
        llama_memory_seq_pos_min(mem,0)==0 && llama_memory_seq_pos_max(mem,0)==static_cast<llama_pos>(count)-1;
}
static void hk_clear_memory() {
    if (g_context) llama_memory_clear(llama_get_memory(g_context),false);
    if (g_context && llama_get_memory(g_context) && !hk_bounds(0)) throw std::runtime_error("KV reset failed");
}
static bool hk_prune(size_t keep) {
    if (!g_context || !llama_get_memory(g_context)) return false;
    return llama_memory_seq_rm(llama_get_memory(g_context),0,static_cast<llama_pos>(keep),-1) && hk_bounds(keep);
}
static void hk_publish() {
    hk_confirmed=static_cast<int>(hk_ledger.confirmed.size()); hk_valid=hk_ledger.valid;
}
static void hk_invalidate(HkReason reason, bool clear_memory) {
    if (clear_memory) hk_clear_memory();
    hk_ledger.invalidate(reason); hk_publish();
    std::lock_guard<std::mutex> guard(hk_lock);
    hk_observation.invalidation=reason; hk_observation.after=hk_memory_count();
}
static void hk_release() {
    hk_invalidate(HkReason::unloaded,false);
    hk_ledger.owner={}; std::vector<llama_token>().swap(hk_ledger.confirmed);
    hk_prepared_request=false; hk_prefill_complete=false; hk_prompt_boundary=0;
    std::lock_guard<std::mutex> guard(hk_lock); hk_observation.after=0;
}
static void hk_begin_request() {
    hk_prepared_request=false; hk_prefill_complete=false; hk_prompt_boundary=0;
    std::lock_guard<std::mutex> guard(hk_lock);
    const auto conversation=hk_observation.conversation;
    hk_observation={}; hk_observation.started=true; hk_observation.conversation=conversation;
    hk_observation.invalidation=hk_ledger.invalidation;
}
static size_t hk_reconcile(const llama_tokens & tokens,const std::string & key,int64_t revision,bool thinking) {
    const auto started=hm_clock(), before=hk_memory_count();
    const bool supported=g_model && g_context && llama_get_memory(g_context) &&
        !llama_model_is_recurrent(g_model) && !llama_model_is_hybrid(g_model) &&
        !llama_model_is_diffusion(g_model) && !llama_model_has_encoder(g_model);
    if (hk_ledger.owner.conversation!=key || hk_ledger.owner.revision!=revision || !hk_ledger.owner.context)
        ++hk_conversation_serial;
    haruna_prefix::Owner owner{key,revision,static_cast<uint64_t>(hs_loads.load()),g_context,g_chat_templates.get(),thinking};
    const auto plan=hk_ledger.reconcile(owner,tokens,supported,hk_bounds(hk_ledger.confirmed.size()),hk_prune,hk_clear_memory);
    hk_publish(); hk_prepared_request=true; hk_prompt_boundary=tokens.size();
    hm_cleared=plan.cleared ? 1 : 0; hm_occupied=plan.reuse;
    {
        std::lock_guard<std::mutex> guard(hk_lock);
        hk_observation.input=tokens.size(); hk_observation.reused=plan.reuse; hk_observation.common=plan.common;
        hk_observation.before=before; hk_observation.reconciled=plan.reuse; hk_observation.after=plan.reuse;
        hk_observation.pruned=std::max<int64_t>(0,before-static_cast<int64_t>(plan.reuse));
        hk_observation.reconcile_us=hm_clock()-started; hk_observation.conversation=hk_conversation_serial;
        hk_observation.supported=supported; hk_observation.full_match=plan.full_match;
        hk_observation.planned=true;
        hk_observation.reason=hm_removed.load()>0 && plan.reuse>0 ? HkReason::history_trimmed : plan.reason;
        hk_observation.invalidation=plan.reason;
    }
    return plan.reuse;
}
static void hk_confirm_prefill(const llama_tokens & tokens,size_t start,size_t count) {
    if (!hk_prepared_request || !hk_ledger.tracking) return;
    hk_ledger.append(start,tokens.begin()+start,tokens.begin()+start+count);
    if (hk_ledger.valid && !hk_bounds(hk_ledger.confirmed.size())) hk_ledger.invalidate(HkReason::memory_mismatch);
    hk_publish();
}
static void hk_confirm_decode(llama_token token,llama_pos position) {
    if (!hk_prepared_request || !hk_ledger.tracking) return;
    hk_ledger.append(static_cast<size_t>(position),&token,&token+1); hk_publish();
}
static void hk_prefill_finished() {
    hk_prefill_complete=true;
    std::lock_guard<std::mutex> guard(hk_lock);
    hk_observation.after_prefill=hk_memory_count(); hk_observation.after=hk_observation.after_prefill;
}
static void hk_finish_request(int reason) {
    const auto before_cleanup=hk_memory_count();
    if (reason==5 || reason==9) {
        const auto phase=!hk_prepared_request ? HkReason::cancelled_before_prepare :
            hk_prefill_complete ? HkReason::cancelled_decode : HkReason::cancelled_prefill;
        const size_t keep=hk_prefill_complete ? std::min(hk_prompt_boundary,hk_ledger.confirmed.size()) : hk_ledger.confirmed.size();
        hk_ledger.retain(keep,phase,hk_prune,hk_clear_memory); hk_publish();
        std::lock_guard<std::mutex> guard(hk_lock);
        hk_observation.confirmed_cancel=hk_ledger.confirmed.size();
        hk_observation.prefill_cancel=hk_prepared_request ? hm_prefill_tokens.load() : 0; hk_observation.invalidation=hk_ledger.invalidation;
    } else if (reason!=1 && reason!=2) hk_invalidate(HkReason::native_error,true);
    else if (hk_ledger.valid && !hk_bounds(hk_ledger.confirmed.size())) hk_invalidate(HkReason::memory_mismatch,true);
    hk_prepared_request=false; hk_prefill_complete=false; hk_prompt_boundary=0;
    std::lock_guard<std::mutex> guard(hk_lock); hk_observation.after=hk_memory_count(); hm_occupied=hk_observation.after;
    hk_observation.cleanup_pruned=std::max<int64_t>(0,before_cleanup-hk_observation.after);
}
static HarunaJson hk_snapshot() {
    HkObservation s; { std::lock_guard<std::mutex> guard(hk_lock); s=hk_observation; }
    return {{"started",s.started},{"planned",s.planned},{"inputTokens",s.input},{"reusedTokens",s.reused},
        {"commonPrefixTokens",s.common},{"kvBefore",s.before},{"kvReconciled",s.reconciled},
        {"kvAfterPrefill",s.after_prefill},{"kvAfter",s.after},{"prunedTokens",s.pruned},
        {"cleanupPrunedTokens",s.cleanup_pruned},{"reconcileUs",s.reconcile_us},{"conversationSlot",s.conversation},
        {"supported",s.supported},{"fullTokenMatch",s.full_match},{"reason",haruna_prefix::name(s.reason)},
        {"invalidation",haruna_prefix::name(s.invalidation)},{"valid",hk_valid.load()},
        {"confirmedTokens",hk_confirmed.load()},{"confirmedAfterCancel",s.confirmed_cancel},
        {"evaluatedBeforeCancel",s.prefill_cancel}};
}
