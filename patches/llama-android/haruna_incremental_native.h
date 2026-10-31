#ifdef HARUNA_PREFIX_KV_TEST
static bool hi_enabled=false,hi_active=false;
static bool hi_eligible(){return false;}static void hi_begin(){}static void hi_invalidate(HkReason){}
static int64_t hi_frontier(){return -1;}
static size_t hi_reconcile(const llama_tokens&,const std::string&,int64_t,bool){return 0;}
static void hi_confirm(const llama_tokens&,size_t,size_t){}static void hi_confirm_token(llama_token,llama_pos){}static void hi_finished(int){}
#else
// Exact continuation or full sequence restore. NEVER partial seq_rm on a hybrid.
#include "haruna_incremental_state.h"
static haruna_incremental::Session<llama_token> hi_session;
static bool hi_enabled=true,hi_force_cold=false,hi_active=false;
static size_t hi_system_boundary=0,hi_turn_boundary=0;
static std::mutex hi_lock;
static HarunaJson hi_observation=HarunaJson::object();
static int64_t hi_frontier(){auto m=g_context?llama_get_memory(g_context):nullptr;return m?llama_memory_seq_pos_max(m,0):-1;}
static bool hi_eligible(){char arch[48]={};if(!g_model||!g_context||!llama_get_memory(g_context))return false;llama_model_meta_val_str(g_model,"general.architecture",arch,sizeof(arch));return std::string(arch)=="qwen35"&&llama_model_is_hybrid(g_model);}
static void hi_note(const char *key,const HarunaJson &v){std::lock_guard<std::mutex>l(hi_lock);hi_observation[key]=v;}
static void hi_begin(){hi_active=false;hi_system_boundary=hi_turn_boundary=0;std::lock_guard<std::mutex>l(hi_lock);hi_observation={{"sequenceId",0},{"mode","not_used"},{"recurrentStatePreserved","unknown"}};}
static void hi_invalidate(HkReason reason){
 const bool keep_system=reason==HkReason::explicit_reset||reason==HkReason::cancelled_decode||reason==HkReason::cancelled_prefill;
 hi_session.clear(keep_system);hi_note("invalidation",haruna_prefix::name(reason));
}
static void hi_configure(bool enabled,bool force_cold){hi_enabled=enabled;hi_force_cold=force_cold;if(!enabled){hi_session.current_clear();hi_note("mode","disabled_cold");hi_note("recurrentStatePreserved","reset");}}
static size_t hi_reconcile(const llama_tokens &tokens,const std::string &key,int64_t revision,bool thinking){
 const auto start=hm_clock(),before=hi_frontier()+1;
 haruna_incremental::Owner owner{key,revision,static_cast<uint64_t>(hs_loads.load()),g_context,g_chat_templates.get(),thinking,llama_n_threads(g_context),llama_n_threads_batch(g_context)};
 if(!hi_session.owner.same(owner))++hk_conversation_serial;
 auto plan=hi_session.plan(owner,tokens,hi_frontier(),hi_force_cold,
 [](const std::vector<uint8_t>&v,size_t count){const auto t=hm_clock();const auto n=llama_state_seq_set_data_ext(g_context,v.data(),v.size(),0,LLAMA_STATE_SEQ_FLAGS_NONE);hi_note("restoreUs",hm_clock()-t);return n==v.size()&&hi_frontier()==static_cast<int64_t>(count)-1;},
 []{llama_memory_clear(llama_get_memory(g_context),false);if(hi_frontier()!=-1)throw std::runtime_error("Hybrid sequence clear failed");});
 hi_active=true;hk_prepared_request=true;hk_prompt_boundary=tokens.size();hm_cleared=plan.reset;hm_occupied=plan.reused;
 {std::lock_guard<std::mutex>l(hk_lock);hk_observation.input=tokens.size();hk_observation.reused=plan.reused;hk_observation.common=plan.common;hk_observation.before=before;hk_observation.reconciled=plan.reused;hk_observation.after=plan.reused;hk_observation.supported=true;hk_observation.planned=true;hk_observation.reason=plan.reused?HkReason::match:HkReason::empty;hk_observation.reconcile_us=hm_clock()-start;hk_observation.conversation=hk_conversation_serial;}
 {std::lock_guard<std::mutex>l(hi_lock);hi_observation.update({{"mode","hybrid_complete_state"},{"promptTokens",tokens.size()},{"newTokens",tokens.size()-plan.reused},{"cachedTokens",plan.reused},{"reusedTokens",plan.reused},{"reusePercent",tokens.empty()?0.0:100.0*plan.reused/tokens.size()},{"nPastBefore",before},{"nPastAfterRestore",plan.reused},{"sequenceReset",plan.reset},{"directAppend",plan.direct},{"checkpoint",plan.checkpoint},{"reason",plan.reason},{"recurrentStatePreserved",plan.direct?"retained":plan.restored?"restored_complete":"reset"},{"kvPreserved",plan.direct||plan.restored},{"kvOnlyRollback",false},{"reconcileUs",hm_clock()-start}});}
 hk_confirmed=hi_session.tokens.size();hk_valid=hi_session.valid;return plan.reused;
}
static void hi_confirm(const llama_tokens&tokens,size_t start,size_t count){if(!hi_session.append(start,tokens.begin()+start,tokens.begin()+start+count,hi_frontier()))throw std::runtime_error("Hybrid token/state frontier mismatch");hk_confirmed=hi_session.tokens.size();hk_valid=hi_session.valid;}
static void hi_confirm_token(llama_token token,llama_pos pos){if(!hi_session.append(pos,&token,&token+1,hi_frontier()))throw std::runtime_error("Hybrid decode frontier mismatch");hk_confirmed=hi_session.tokens.size();hk_valid=hi_session.valid;}
static void hi_capture(int slot,size_t boundary){
 if(hs_check_cancel())return;
 const auto started=hm_clock();
 const bool ok=hi_session.capture(slot,boundary,hi_frontier(),[]{return llama_state_seq_get_size_ext(g_context,0,LLAMA_STATE_SEQ_FLAGS_NONE);},[](std::vector<uint8_t>&v){return llama_state_seq_get_data_ext(g_context,v.data(),v.size(),0,LLAMA_STATE_SEQ_FLAGS_NONE);});
 hi_note(slot==0?"systemCheckpointCaptured":"turnCheckpointCaptured",ok);hi_note("snapshotBytes",hi_session.bytes());
 {std::lock_guard<std::mutex>l(hi_lock);hi_observation["captureUs"]=hi_observation.value("captureUs",int64_t(0))+hm_clock()-started;}
}
static void hi_finished(int reason){
 if(hs_nan.load()>0||hs_inf.load()>0){hi_session.clear();llama_memory_clear(llama_get_memory(g_context),false);hi_note("invalidation","nonfinite_state_discarded");}
 else if(reason!=1&&reason!=2){llama_memory_clear(llama_get_memory(g_context),false);hi_session.current_clear();if(reason!=5&&reason!=9)hi_session.clear();hi_note("invalidation",reason==5||reason==9?"cancelled_state_discarded":"error_state_discarded");}
 else if(!hi_session.valid||hi_frontier()!=static_cast<int64_t>(hi_session.tokens.size())-1){hi_session.current_clear();hi_note("invalidation","final_frontier_mismatch");}
 hk_confirmed=hi_session.tokens.size();hk_valid=hi_session.valid;
 hi_note("evaluatedTokens",hm_prefill_tokens.load());hi_note("nPastAfter",hi_frontier()+1);hi_note("snapshotBytes",hi_session.bytes());
 {std::lock_guard<std::mutex>l(hk_lock);hk_observation.after=hi_frontier()+1;hm_occupied=hk_observation.after;}
 hi_active=false;hk_prepared_request=false;hk_prefill_complete=false;
}
static HarunaJson hi_snapshot(){std::lock_guard<std::mutex>l(hi_lock);auto value=hi_observation;value["evaluatedTokens"]=hm_prefill_tokens.load();if(!value.contains("promptTokens")){value["promptTokens"]=hm_input.load();value["newTokens"]=hm_input.load();value["cachedTokens"]=0;value["reusedTokens"]=0;value["reusePercent"]=0;value["sequenceReset"]=hm_cleared.load()!=0;value["kvPreserved"]=false;}value["nPastAfter"]=hm_occupied.load();return value;}

#endif
