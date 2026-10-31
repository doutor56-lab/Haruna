// Opt-in diagnostic: serializes graph nodes. Never compare its TTFT with production.
#include <array>
extern "C" const char * haruna_observed_node_backend(const llama_context *,ggml_tensor *);
static std::mutex hp_lock;
static std::atomic<bool> hp_enabled{false};
static int64_t hp_started=0;
static std::array<int64_t,GGML_OP_COUNT> hp_times{},hp_counts{},hp_gpu_times{};
static std::array<int64_t,8> hp_categories{};
static uint64_t hp_traits[3]{};
static void hp_cpu(bool enable){
 for(size_t i=0;i<ggml_backend_reg_count();i++){auto reg=ggml_backend_reg_get(i);if(std::string(ggml_backend_reg_name(reg))!="CPU")continue;
  auto reset=reinterpret_cast<void(*)(bool)>(ggml_backend_reg_get_proc_address(reg,"haruna45_reset"));
  auto count=reinterpret_cast<uint64_t(*)(int)>(ggml_backend_reg_get_proc_address(reg,"haruna45_count"));
  if(!enable&&count){std::lock_guard<std::mutex>l(hp_lock);for(int k=0;k<3;k++)hp_traits[k]+=count(k);}
  if(reset)reset(enable);
 }
}
static int hp_category(const ggml_tensor*t){const std::string n=t->name;if(n.find("ffn")!=std::string::npos)return 0;if(t->op==GGML_OP_GATED_DELTA_NET)return 1;if(t->op==GGML_OP_SSM_CONV||t->op==GGML_OP_SSM_SCAN)return 2;if(n.find("attn")!=std::string::npos||n.find("qkv")!=std::string::npos)return 3;if(t->op==GGML_OP_MUL_MAT||t->op==GGML_OP_MUL_MAT_ID)return 4;if(t->op==GGML_OP_CPY||t->op==GGML_OP_CONT||t->op==GGML_OP_CONCAT)return 5;if(t->op==GGML_OP_RMS_NORM||t->op==GGML_OP_NORM)return 6;return 7;}
static bool hp_callback(ggml_tensor*t,bool ask,void*){
 if(!hp_enabled||hm_stage.load()!=3)return false;
 if(ask){hp_started=hm_clock();return true;}
 const auto elapsed=hm_clock()-hp_started;
 {std::lock_guard<std::mutex>l(hp_lock);if(t->op>=0&&t->op<GGML_OP_COUNT){hp_times[t->op]+=elapsed;++hp_counts[t->op];if(std::string(haruna_observed_node_backend(g_context,t)).find("Vulkan")!=std::string::npos)hp_gpu_times[t->op]+=elapsed;}hp_categories[hp_category(t)]+=elapsed;}
 return true;
}
static void hp_begin(bool enabled){
#if HARUNA_DIAGNOSTIC_45
 // Canonical 4.5/4.6 capture owns the same trait counters in these separate builds.
 hp_enabled=false;return;
#endif
 hp_cpu(false);std::lock_guard<std::mutex>l(hp_lock);hp_enabled=enabled;hp_times.fill(0);hp_counts.fill(0);hp_gpu_times.fill(0);hp_categories.fill(0);for(auto&n:hp_traits)n=0;if(enabled)hp_cpu(true);
}
static void hp_end(){if(hp_enabled)hp_cpu(false);}
static HarunaJson hp_snapshot(){std::lock_guard<std::mutex>l(hp_lock);HarunaJson ops=HarunaJson::array();for(int k=0;k<GGML_OP_COUNT;k++)if(hp_counts[k])ops.push_back({{"op",ggml_op_name(static_cast<ggml_op>(k))},{"calls",hp_counts[k]},{"us",hp_times[k]},{"vulkanUs",hp_gpu_times[k]}});return {{"enabled",hp_enabled.load()},{"serializedDiagnostic",hp_enabled.load()},{"productionComparable",!hp_enabled},{"ops",ops},{"categoryUs",hp_categories},{"successfulTraitThreadCalls",hp_traits[0]},{"kleidiAiThreadCalls",hp_traits[1]},{"repackThreadCalls",hp_traits[2]},{"note","Node synchronization/fusion changes in profiling mode; not production TTFT. Categories are heuristic internal names; tensor contents/names not exported."}};}
