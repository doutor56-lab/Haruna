// Focused tests of the production ledger AND production reconciliation/rollback hooks.
// The memory adapter is a model-free fixture, not llama inference or an Android benchmark.
#include <atomic>
#include <cassert>
#include <chrono>
#include <cstdio>
#include <initializer_list>
#include <map>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>
using llama_token=int32_t; using llama_pos=int32_t; using llama_tokens=std::vector<llama_token>;
struct FakeMemory { std::map<int,int> cells; bool fail_prune=false; };
struct llama_context { FakeMemory memory; };
struct llama_model { bool recurrent=false, hybrid=false, encoder=false, diffusion=false; };
static llama_context context; static llama_model model;
static llama_context * g_context=&context; static llama_model * g_model=&model;
static std::unique_ptr<int> g_chat_templates(new int(1));
static std::atomic<int64_t> hs_loads{1},hm_removed{0},hm_occupied{0},hm_prefill_tokens{0};
static std::atomic<int> hm_cleared{0};
static int64_t hm_clock() { return std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now().time_since_epoch()).count(); }
static FakeMemory * llama_get_memory(llama_context * c) { return &c->memory; }
static int llama_memory_seq_pos_min(FakeMemory * m,int) { return m->cells.empty() ? -1 : m->cells.begin()->first; }
static int llama_memory_seq_pos_max(FakeMemory * m,int) { return m->cells.empty() ? -1 : m->cells.rbegin()->first; }
static bool llama_memory_seq_rm(FakeMemory * m,int,int start,int) {
    if (m->fail_prune) return false;
    m->cells.erase(m->cells.lower_bound(start),m->cells.end()); return true;
}
static void llama_memory_clear(FakeMemory * m,bool) { m->cells.clear(); }
static bool llama_model_is_recurrent(llama_model * m) { return m->recurrent; }
static bool llama_model_is_hybrid(llama_model * m) { return m->hybrid; }
static bool llama_model_is_diffusion(llama_model * m) { return m->diffusion; }
static bool llama_model_has_encoder(llama_model * m) { return m->encoder; }
struct HarunaJson {
    template<class T> HarunaJson(T) {}
    HarunaJson(std::initializer_list<std::pair<const char *,HarunaJson>>) {}
};
#include "../patches/llama-android/haruna_prefix_cache.h"
static void begin() { hk_begin_request(); hm_prefill_tokens=0; hm_removed=0; }
static void batch(const llama_tokens & tokens,size_t offset,size_t count,bool completed=true) {
    for (size_t i=offset;i<offset+count;++i) context.memory.cells[static_cast<int>(i)]=tokens[i];
    if (completed) { hk_confirm_prefill(tokens,offset,count); hm_prefill_tokens+=count; }
}
static void decode(llama_token token) {
    const auto position=static_cast<int>(context.memory.cells.size());
    context.memory.cells[position]=token; hk_confirm_decode(token,position);
}
static void check_memory(const llama_tokens & expected) {
    assert(context.memory.cells.size()==expected.size());
    for (size_t i=0;i<expected.size();++i) assert(context.memory.cells.at(static_cast<int>(i))==expected[i]);
}
static void prefill(const llama_tokens & input,const std::string & owner="A",int64_t revision=0,bool thinking=true) {
    const auto keep=hk_reconcile(input,owner,revision,thinking);
    batch(input,keep,input.size()-keep); hk_prefill_finished(); check_memory(input);
}
static void fresh() {
    hk_release(); context.memory={}; model={}; begin();
}
int main() {
    fresh(); prefill({1,2,3,4}); assert(hk_observation.reused==0 && hm_prefill_tokens==4);
    decode(5); decode(6); hk_finish_request(1);
    begin(); prefill({1,2,3,4,5,6,7,8}); assert(hk_observation.reused==6 && hm_prefill_tokens==2);
    decode(9); decode(10); hk_finish_request(2);
    begin(); prefill({1,2,3,4,5,6,7,8,9,10,11}); assert(hk_observation.reused==10 && hm_prefill_tokens==1);
    hk_finish_request(1);
    begin(); prefill({1,2,3,4,5,6},"B"); assert(hk_observation.reused==0);
    assert(hk_observation.reason==HkReason::conversation_changed); hk_finish_request(1);
    begin(); prefill({1,2,3,4,5,6},"A"); assert(hk_observation.reused==0); hk_finish_request(1);
    ++hs_loads; begin(); prefill({1,2,3,4,5,6});
    assert(hk_observation.reused==0 && hk_observation.reason==HkReason::model_changed); hk_finish_request(1);

    // Prefill abort: completed batch stays; unconfirmed positions are removed, never admitted.
    begin(); const llama_tokens more={1,2,3,4,5,6,7,8,9,10,11};
    auto keep=hk_reconcile(more,"A",0,true); assert(keep==6);
    batch(more,keep,3); batch(more,keep+3,2,false);
    hk_finish_request(5); check_memory({1,2,3,4,5,6,7,8,9});
    assert(hk_observation.confirmed_cancel==9 && hk_observation.prefill_cancel==3);
    begin(); prefill(more); assert(hk_observation.reused==9); hk_finish_request(1);

    // Decode abort: retain prompt only, even if UI never received the generated suffix.
    begin(); prefill({1,2,3,4,5,6,7,8,9,10,11,12});
    decode(13); decode(14); context.memory.cells[14]=999; // interrupted decode, not confirmed
    hk_finish_request(5); check_memory({1,2,3,4,5,6,7,8,9,10,11,12});
    assert(hk_observation.confirmed_cancel==12);
    begin(); prefill({1,2,3,4,5,6,7,8,9,10,11,42,43}); assert(hk_observation.reused==11); hk_finish_request(1);

    // Edited historical token and dynamic context: only the exact prefix survives.
    begin(); prefill({1,2,88,4,5}); assert(hk_observation.reused==2); hk_finish_request(1);
    begin(); prefill({1,99,88,4,5}); assert(hk_observation.reused==1); hk_finish_request(1);
    begin(); prefill({77,99,88,4,5}); assert(hk_observation.reused==0); hk_finish_request(1);
    begin(); prefill({77,99,88,4,5},"A",0,false); assert(hk_observation.reused==0);
    assert(hk_observation.reason==HkReason::template_changed); hk_finish_request(1);
    begin(); prefill({77,99,88,4,5},"A",1,false); assert(hk_observation.reused==0);
    assert(hk_observation.reason==HkReason::explicit_reset); hk_finish_request(1);
    begin(); prefill({77,99,88,4,5},"A",1,false);
    assert(hk_observation.full_match && hk_observation.common==5 && hk_observation.reused==4);
    assert(hm_prefill_tokens==1); hk_finish_request(1); // Refresh logits for identical full prompt.

    // Failed pruning / inconsistent memory -> full safe fallback.
    context.memory.fail_prune=true; begin(); prefill({77,99,88,4,5,6},"A",1,false);
    assert(hk_observation.reused==0 && hk_observation.reason==HkReason::prune_failed);
    context.memory.fail_prune=false; hk_finish_request(1);
    context.memory.cells.erase(0); begin(); prefill({77,99,88,4,5,6,7},"A",1,false);
    assert(hk_observation.reused==0 && hk_observation.reason==HkReason::memory_mismatch); hk_finish_request(1);
    begin(); hk_finish_request(5); // Cancelled before preparation keeps old proven state.
    assert(hk_observation.prefill_cancel==0 && hk_valid);
    begin(); hm_removed=2; prefill({77,99,42,5},"A",1,false);
    assert(hk_observation.reused==2 && hk_observation.reason==HkReason::history_trimmed); hk_finish_request(1);
    hk_invalidate(HkReason::context_shift,false); begin(); prefill({77,99,42,5},"A",1,false);
    assert(hk_observation.reused==0); hk_finish_request(1);
    hk_invalidate(HkReason::explicit_reset,true); assert(!hk_valid && hk_memory_count()==0);
    begin(); prefill({77,99,42,5},"A",1,false); assert(hk_observation.reused==0); hk_finish_request(3);
    assert(!hk_valid && hk_memory_count()==0);
    begin(); prefill({77,99,42,5},"",1,false); assert(hk_observation.reused==0 && !hk_valid); hk_finish_request(1);
    model.hybrid=true; begin(); prefill({77,99,42,5},"A",1,false);
    assert(hk_observation.reused==0 && !hk_observation.supported && !hk_valid); hk_finish_request(1);
    hk_release(); assert(hk_ledger.confirmed.capacity()==0 && !hk_valid);
    (void) hk_snapshot();
    std::puts("PASS: exact prefix, ownership, edits, pruning, abort rollback, logits replay and safe fallback.");
}
