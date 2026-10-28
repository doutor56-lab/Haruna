#pragma once
#include <algorithm>
#include <cstdint>
#include <string>
#include <vector>

// Pure ledger: token equality is the authority, never a text/hash/length guess.
namespace haruna_prefix {
enum class Reason { empty, match, tokens_changed, conversation_changed, explicit_reset,
    model_changed, template_changed, missing_identity, unsupported, memory_mismatch,
    prune_failed, native_error, cancelled_prefill, cancelled_decode, history_trimmed,
    context_shift, unloaded, legacy_reset, full_match_replay, cancelled_before_prepare };
inline const char * name(Reason r) {
    switch (r) {
#define HK_REASON(x) case Reason::x: return #x
        HK_REASON(empty); HK_REASON(match); HK_REASON(tokens_changed); HK_REASON(conversation_changed);
        HK_REASON(explicit_reset); HK_REASON(model_changed); HK_REASON(template_changed);
        HK_REASON(missing_identity); HK_REASON(unsupported); HK_REASON(memory_mismatch);
        HK_REASON(prune_failed); HK_REASON(native_error); HK_REASON(cancelled_prefill);
        HK_REASON(cancelled_decode); HK_REASON(history_trimmed); HK_REASON(context_shift);
        HK_REASON(unloaded); HK_REASON(legacy_reset); HK_REASON(full_match_replay);
        HK_REASON(cancelled_before_prepare);
#undef HK_REASON
    }
    return "unknown";
}
struct Owner {
    std::string conversation;
    int64_t revision = 0;
    uint64_t model = 0;
    const void * context = nullptr;
    const void * chat_template = nullptr;
    bool thinking = true;
};
struct Plan {
    size_t common = 0, reuse = 0;
    bool cleared = false, full_match = false;
    Reason reason = Reason::empty;
};
template<class Token> class Ledger {
public:
    Owner owner;
    std::vector<Token> confirmed;
    bool valid = false, tracking = false;
    Reason invalidation = Reason::empty;

    void invalidate(Reason reason) {
        confirmed.clear(); valid = false; tracking = false; invalidation = reason;
    }
    // prune(n) must remove positions [n,+inf) and prove positions [0,n) remain.
    // clear() must clear memory or throw; neither callback may silently fail.
    template<class Prune, class Clear>
    Plan reconcile(const Owner & next, const std::vector<Token> & input, bool supported,
                   bool bounds_match, Prune prune, Clear clear) {
        Plan p; p.reason = invalidation;
        if (!supported) p.reason = Reason::unsupported;
        else if (next.conversation.empty()) p.reason = Reason::missing_identity;
        else if (owner.context && (owner.model != next.model || owner.context != next.context)) p.reason = Reason::model_changed;
        else if (owner.context && owner.conversation != next.conversation) p.reason = Reason::conversation_changed;
        else if (owner.context && owner.revision != next.revision) p.reason = Reason::explicit_reset;
        else if (owner.context && (owner.chat_template != next.chat_template || owner.thinking != next.thinking)) p.reason = Reason::template_changed;
        else if (valid && !bounds_match) p.reason = Reason::memory_mismatch;
        else if (valid) {
            const size_t end = std::min(confirmed.size(), input.size());
            while (p.common < end && confirmed[p.common] == input[p.common]) ++p.common;
            p.full_match = !input.empty() && p.common == input.size();
            // Logits belong to the last decode, not necessarily the retained prefix.
            // Replay the final prompt token when all of it matches; never sample stale logits.
            p.reuse = input.empty() ? 0 : std::min(p.common, input.size() - 1);
            p.reason = p.full_match ? Reason::full_match_replay :
                p.common == confirmed.size() ? Reason::match : Reason::tokens_changed;
        }
        owner = next;
        tracking = supported && !next.conversation.empty();
        if (p.reuse > 0 && !prune(p.reuse)) { p.reuse = 0; p.reason = Reason::prune_failed; }
        if (p.reuse == 0) { clear(); confirmed.clear(); p.cleared = true; }
        else confirmed.resize(p.reuse);
        valid = !confirmed.empty(); invalidation = p.reason;
        return p;
    }
    template<class Iterator> bool append(size_t position, Iterator begin, Iterator end) {
        if (!tracking) return false;
        if (position != confirmed.size()) { invalidate(Reason::memory_mismatch); return false; }
        confirmed.insert(confirmed.end(), begin, end); valid = !confirmed.empty(); return true;
    }
    template<class Prune, class Clear> bool retain(size_t keep, Reason reason, Prune prune, Clear clear) {
        if (!tracking || !valid || keep == 0 || keep > confirmed.size() || !prune(keep)) {
            clear(); invalidate(keep > 0 ? Reason::prune_failed : reason); return false;
        }
        confirmed.resize(keep); valid = true; invalidation = reason; return true;
    }
};
} // namespace haruna_prefix
