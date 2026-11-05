// Baseline observers only. No prompt, token text, path or mutable inference policy.
#include "haruna_preparation.h"
#include <atomic>
#include <cctype>
#include <chrono>
#include <mutex>
#include <sched.h>
#include <dlfcn.h>
#include <time.h>
#include <nlohmann/json.hpp>
#include "llama-ext.h"
#include "ggml-feats.h"

extern "C" LLAMA_API int haruna_observed_flash(const llama_context * ctx);
extern "C" LLAMA_API int haruna_observed_gpu_layers(const llama_context * ctx);
using HarunaJson = nlohmann::ordered_json;
static HarunaJson hk_snapshot();
static HarunaJson hd_snapshot();
static int64_t hm_clock() {
    timespec now{}; clock_gettime(CLOCK_BOOTTIME, &now);
    return static_cast<int64_t>(now.tv_sec)*1000000 + now.tv_nsec/1000;
}
static std::mutex hm_lock;
static HarunaJson hm_runtime = HarunaJson::object();
static std::atomic<int64_t> hm_serial{0}, hm_start{0}, hm_template{0}, hm_tokenize{0}, hm_prefill{0},
    hm_first_delta{-1}, hm_first_sample{-1}, hm_decode{0}, hm_deltas{0}, hm_bytes{0}, hm_tokens{0},
    hm_steps{0}, hm_shifts{0}, hm_occupied{0}, hm_removed{0}, hm_end{-1}, hm_input{0}, hm_prefill_tokens{0};
static std::atomic<int> hm_stage{0}, hm_cleared{0};
static std::atomic<int> hm_reason{0}; // 0 unknown/running, 1 EOG, 2 budget, 3 decode error, 4 input error

static std::string hm_identifier(const char * value) {
    std::string result;
    if (value) for (const unsigned char c : std::string(value)) {
        if (result.size() >= 160) break;
        if (std::isalnum(c) || c == '_' || c == '-' || c == '.' || c == '+' || c == ' ') result += c;
    }
    return result;
}
static void hm_begin() {
    hprep_reset();
    hm_start = hm_clock(); ++hm_serial;
    hm_template=0; hm_tokenize=0; hm_prefill=0; hm_first_delta=-1; hm_first_sample=-1;
    hm_decode=0; hm_deltas=0; hm_bytes=0; hm_tokens=0; hm_steps=0; hm_shifts=0;
    hm_occupied=0; hm_removed=0; hm_reason=0; hm_end=-1; hm_input=0; hm_stage=1; hm_cleared=0; hm_prefill_tokens=0;
}
static void hm_finish(int reason) { hm_reason=reason; hm_end=hm_clock()-hm_start.load(); hm_stage=5; }
static void hm_context(const llama_context_params * requested = nullptr) {
    try {
    // Called only on the serialized inference thread, at preparation/prefill boundaries.
    if (!g_context || !g_model) return;
    HarunaJson value;
    { std::lock_guard<std::mutex> guard(hm_lock); value=hm_runtime; }
    value["loaded"]=true;
    value["nCtx"]=llama_n_ctx(g_context); value["nBatch"]=llama_n_batch(g_context);
    value["nUbatch"]=llama_n_ubatch(g_context); value["nSeqMax"]=llama_n_seq_max(g_context);
    value["threads"]=llama_n_threads(g_context); value["threadsBatch"]=llama_n_threads_batch(g_context);
    value["trainedContext"]=llama_model_n_ctx_train(g_model);
    value["fileType"]=static_cast<int>(llama_model_ftype(g_model));
    char arch[128] = {}, description[192] = {};
    if (llama_model_meta_val_str(g_model,"general.architecture",arch,sizeof(arch))>0)
        value["architecture"]=hm_identifier(arch);
    if (llama_model_desc(g_model,description,sizeof(description))>0)
        value["description"]=hm_identifier(description);
    if (requested) {
        value["kvK"]=ggml_type_name(requested->type_k); value["kvV"]=ggml_type_name(requested->type_v);
        value["flashRequested"]=llama_flash_attn_type_name(requested->flash_attn_type);
    }
    value["flashEffective"]=haruna_observed_flash(g_context);
    value["gpuTransformerLayers"]=haruna_observed_gpu_layers(g_context);
    uint64_t model=0,context=0,compute=0;
    std::string executors;
    std::string layouts;
    for (const auto & item : llama_get_memory_breakdown(g_context)) {
        model+=item.second.model; context+=item.second.context; compute+=item.second.compute;
        if (layouts.size()<500) { if(!layouts.empty()) layouts+=" / "; layouts+=hm_identifier(ggml_backend_buft_name(item.first)); }
        auto dev=ggml_backend_buft_get_device(item.first);
        if (dev && (item.second.model || item.second.context || item.second.compute)) {
            const auto name=hm_identifier(ggml_backend_dev_name(dev));
            if (!name.empty() && executors.find(name)==std::string::npos) {
                if (!executors.empty()) executors+=" / "; executors+=name;
            }
        }
    }
    value["modelBufferBytes"]=model; value["contextBufferBytes"]=context;
    value["computeBufferBytes"]=compute; value["bufferDevices"]=executors;
    value["bufferLayouts"]=layouts;
    value["cpuOnline"]=sysconf(_SC_NPROCESSORS_ONLN);
    cpu_set_t mask; CPU_ZERO(&mask);
    if (sched_getaffinity(0,sizeof(mask),&mask)==0) value["cpuAllowed"]=CPU_COUNT(&mask);
    auto reg=ggml_backend_reg_by_name("CPU");
    if (reg) {
        auto fn=ggml_backend_reg_get_proc_address(reg,"ggml_backend_set_n_threads");
        Dl_info info{};
        if (fn && dladdr(fn,&info) && info.dli_fname) {
            const std::string path(info.dli_fname);
            value["cpuVariant"]=hm_identifier(path.substr(path.find_last_of('/')+1).c_str());
        }
    }
#if defined(__aarch64__)
    const auto features=ggml_feats_get_arch64_runtime();
    value["dotprod"]=features.has_dotprod; value["fp16"]=features.has_fp16; value["i8mm"]=features.has_i8mm;
    value["abi"]="arm64-v8a";
#elif defined(__x86_64__)
    value["abi"]="x86_64";
#endif
    value["llamaCommit"]=HARUNA_LLAMA_COMMIT;
    { std::lock_guard<std::mutex> guard(hm_lock); hm_runtime=std::move(value); }
    } catch (...) { /* Optional observation must not fail model preparation/generation. */ }
}
static void hm_unloaded() { std::lock_guard<std::mutex> guard(hm_lock); hm_runtime.clear(); }
static void hm_delta(size_t bytes) {
    const auto elapsed=hm_clock()-hm_start.load();
    int64_t missing=-1; hm_first_delta.compare_exchange_strong(missing,elapsed);
    ++hm_deltas; hm_bytes+=bytes;
}
struct HarunaDecodeTimer {
    const int64_t started=hm_clock();
    ~HarunaDecodeTimer() { hm_decode+=hm_clock()-started; ++hm_steps; }
};
#include "haruna_runtime_control.h"
extern "C" JNIEXPORT jstring JNICALL
Java_com_arm_aichat_internal_InferenceEngineImpl_runtimeMetrics(JNIEnv * env,jobject) {
    try {
    HarunaJson result;
    { std::lock_guard<std::mutex> guard(hm_lock); result["runtime"]=hm_runtime; }
    result["stability"]=hs_snapshot();
    result["prefix"]=hk_snapshot();
    result["decisionProbe"]=hd_snapshot();
    result["preparation"]={{"stage",hprep_name(hprep_stage.load())},{"failedStage",hprep_name(hprep_failed.load())},
        {"decodeReturn",hprep_return.load()==INT_MAX?HarunaJson(nullptr):HarunaJson(hprep_return.load())},
        {"exceptionKind",hprep_kind.load()},{"systemCode",hprep_kind.load()==2?HarunaJson(hprep_system_code.load()):HarunaJson(nullptr)},
        {"systemCategory",hprep_category.load()},{"technicalHint",hprep_hint.load()},
        {"batchAttempts",hprep_attempts.load()},{"batchesCompleted",hprep_completed.load()},
        {"batchOffset",hprep_offset.load()},{"batchTokens",hprep_count.load()},{"cleanupFailed",hprep_cleanup_failed.load()}};
    result["generation"]={{"serial",hm_serial.load()},{"nativeStartBootUs",hm_start.load()},{"templateUs",hm_template.load()},
        {"tokenizeUs",hm_tokenize.load()},{"prefillUs",hm_prefill.load()},
        {"firstDeltaUs",hm_first_delta.load()},{"firstSampleUs",hm_first_sample.load()},
        {"decodeUs",hm_decode.load()},{"nativeDeltas",hm_deltas.load()},
        {"outputBytes",hm_bytes.load()},{"outputTokens",hm_tokens.load()},
        {"decodeSteps",hm_steps.load()},{"shifts",hm_shifts.load()},
        {"occupied",hm_occupied.load()},{"removedMessages",hm_removed.load()},
        {"inputTokens",hm_input.load()},{"stage",hm_stage.load()},{"cacheCleared",hm_cleared.load()},
        {"prefillTokens",hm_prefill_tokens.load()},
        {"endUs",hm_end.load()},{"nativeStopCode",hm_reason.load()}};
    // Last/current scalars only; this getter never reads mutable model/context objects.
    return env->NewStringUTF(result.dump().c_str());
    } catch (...) { return env->NewStringUTF("{}"); }
}


