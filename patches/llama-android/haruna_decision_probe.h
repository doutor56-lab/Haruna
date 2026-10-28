// Read-only bounded observations. No RNG calls, sampler apply, sorting or token text exports.
#include "haruna_probe_policy.h"
#include <cstring>
#include <sys/auxv.h>
static std::mutex hd_lock;
static HarunaJson hd_probes=HarunaJson::array(),hd_sampler=HarunaJson::object();
static haruna_probe::Policy hd_policy;
static int hd_pending_probe=-1;
static int64_t hd_cost=0,hd_accepts=0,hd_position_errors=0;
static uint64_t hd_first_hash=1469598103934665603ULL;
static int hd_first_count=0;
static bool hd_fixed_seed=false,hd_fa_off=false,hd_sampler_fixed=false;
static bool hd_cpu_conservative=false,hd_cpu_fallback=false;
static void hd_begin() {
    std::lock_guard<std::mutex> guard(hd_lock);
    hd_probes=HarunaJson::array();hd_policy={};hd_pending_probe=-1;
    hd_cost=0;hd_accepts=0;hd_position_errors=0;hd_first_hash=1469598103934665603ULL;hd_first_count=0;
}
static void hd_sampler_observed(const common_params_sampling & p,common_sampler * sampler) noexcept {
    try {
    std::lock_guard<std::mutex> guard(hd_lock);
    hd_sampler={{"chain",common_sampler_print(sampler)},{"temperature",p.temp},{"topK",p.top_k},
        {"topP",p.top_p},{"minP",p.min_p},{"typicalP",p.typ_p},{"xtcProbability",p.xtc_probability},
        {"repeatPenalty",p.penalty_repeat},{"frequencyPenalty",p.penalty_freq},{"presencePenalty",p.penalty_present},
        {"penaltyWindow",p.penalty_last_n},{"dryMultiplier",p.dry_multiplier},{"mirostat",p.mirostat},
        {"configuredSeed",p.seed},{"fixedSeedDBG",hd_fixed_seed},{"historyCapacity",p.n_prev},
        {"grammarConfigured",!p.grammar.empty()},{"backendSampling",p.backend_sampling}};
    } catch (...) {}
}
static common_sampler * new_sampler(float temp);
static void hd_prepare_sampler() {
    // Default path is EXACTLY unchanged. A DBG fixed seed recreates only the sampler,
    // once per request; returning to automatic replaces the diagnostic sampler once.
    if (!hd_fixed_seed && !hd_sampler_fixed) return;
    auto * replacement=new_sampler(DEFAULT_SAMPLER_TEMP);
    if (!replacement) throw std::runtime_error("Diagnostic sampler creation failed");
    auto * previous=g_sampler;g_sampler=replacement;common_sampler_free(previous);
    hd_sampler_fixed=hd_fixed_seed;
}
static void hd_accept_observed() { std::lock_guard<std::mutex> guard(hd_lock);++hd_accepts; }
static void hd_decision(llama_token id,int position,bool final) noexcept {
    try {
        const auto started=hm_clock();
        hd_pending_probe=-1;
        { std::lock_guard<std::mutex> guard(hd_lock);
            if (hd_first_count<12) { hd_first_hash=haruna_probe::mix(hd_first_hash,static_cast<uint32_t>(id));++hd_first_count; }
        }
        const char * reason=hd_policy.observe(id,final);
        if (!reason) return;
        const auto * logits=llama_get_logits_ith(g_context,-1);
        const auto * candidates=common_sampler_get_candidates(g_sampler,false); // NO mutation/sort/RNG
        const int n=llama_vocab_n_tokens(llama_model_get_vocab(g_model));
        HarunaJson p={{"step",hd_policy.count},{"position",position},{"seqId",0},{"id",id},
            {"reason",reason},{"run",hd_policy.run},{"lag2Streak",hd_policy.lag},
            {"samplerLastBeforeAccept",hd_policy.count>1?common_sampler_last(g_sampler):LLAMA_TOKEN_NULL},
            {"rawAvailable",logits!=nullptr}};
        if (logits) {
            int finite=0,nan=0,inf=0,rank=1;
            float low=std::numeric_limits<float>::max(),high=-low;
            std::array<int,3> top{{-1,-1,-1}};
            uint64_t hash=1469598103934665603ULL;
            for (int i=0;i<n;++i) {
                uint32_t bits;std::memcpy(&bits,logits+i,sizeof(bits));hash=haruna_probe::mix(hash,bits);
                const float value=logits[i];
                if (std::isnan(value)) { ++nan;continue; }
                if (!std::isfinite(value)) { ++inf;continue; }
                ++finite;low=std::min(low,value);high=std::max(high,value);
                if (std::isfinite(logits[id]) && value>logits[id]) ++rank;
                for(int j=0;j<3;++j) if(top[j]<0 || value>logits[top[j]]) {
                    for(int k=2;k>j;--k) top[k]=top[k-1];top[j]=i;break;
                }
            }
            p["finite"]=finite;p["nan"]=nan;p["inf"]=inf;p["rawFingerprint"]=std::to_string(hash);
            if (finite) { p["min"]=low;p["max"]=high; }
            if (std::isfinite(logits[id])) { p["rawChosen"]=logits[id];p["rawRank"]=rank; }
            p["rawTop"]=HarunaJson::array();
            for (int i:top) if (i>=0) p["rawTop"].push_back({{"id",i},{"logit",logits[i]}});
            double sum=0,weighted=0;
            for(int i=0;i<n;++i) if(std::isfinite(logits[i])) {
                const double shifted=double(logits[i])-high,w=std::exp(shifted);sum+=w;weighted+=w*shifted;
            }
            // Finite-logit softmax only; not a valid full distribution when NaN/+Inf exists.
            if(sum>0 && !nan && !inf) p["rawEntropyNats"]=std::log(sum)-weighted/sum;
        }
        if(candidates && candidates->data && candidates->size) {
            const auto & a=*candidates;const llama_token_data * chosen=nullptr;
            std::array<const llama_token_data *,3> top{{nullptr,nullptr,nullptr}};
            double mass=0,entropy=0;int rank=1,finite=0,nan=0,inf=0;
            for(size_t i=0;i<a.size;++i) if(a.data[i].id==id) { chosen=&a.data[i];break; }
            for(size_t i=0;i<a.size;++i) {
                const auto & c=a.data[i];
                if(std::isnan(c.p)) { ++nan;continue; } if(!std::isfinite(c.p)) { ++inf;continue; }
                ++finite;
                if(c.p>0) { mass+=c.p;entropy-=double(c.p)*std::log(c.p); }
                if(chosen && c.p>chosen->p) ++rank;
                for(int j=0;j<3;++j) if(!top[j] || c.p>top[j]->p) {
                    for(int k=2;k>j;--k) top[k]=top[k-1];top[j]=&c;break;
                }
            }
            p["candidateCount"]=a.size;p["postFinite"]=finite;p["postNan"]=nan;p["postInf"]=inf;
            p["postMass"]=mass;p["postTop"]=HarunaJson::array();
            for(auto * c:top) if(c && std::isfinite(c->p)) p["postTop"].push_back({{"id",c->id},{"p",c->p}});
            if(chosen && std::isfinite(chosen->p)) { p["chosenP"]=chosen->p;p["postRank"]=rank; }
            if(std::abs(mass-1)<0.001 && !nan && !inf) p["postEntropyNats"]=entropy;
            p["selectedMatchesId"]=a.selected>=0 && size_t(a.selected)<a.size && a.data[a.selected].id==id;
        }
        const auto mem=llama_get_memory(g_context);
        p["kvMin"]=llama_memory_seq_pos_min(mem,0);p["kvMaxBefore"]=llama_memory_seq_pos_max(mem,0);
        p["positionMatchesKV"]=llama_memory_seq_pos_max(mem,0)==position-1;
        std::lock_guard<std::mutex> guard(hd_lock);
        hd_pending_probe=static_cast<int>(hd_probes.size());hd_probes.push_back(std::move(p));hd_cost+=hm_clock()-started;
    } catch (...) { hd_pending_probe=-1; } // Optional probe cannot interrupt inference.
}
static void hd_decode_observed(int before,int after,int result) noexcept {
    try {
        const auto mem=llama_get_memory(g_context);const auto max=llama_memory_seq_pos_max(mem,0);
        std::lock_guard<std::mutex> guard(hd_lock);
        if(result==0 && (after!=before+1 || max!=after-1)) ++hd_position_errors;
        if(hd_pending_probe>=0) {
            auto & p=hd_probes.at(hd_pending_probe);p["decodeResult"]=result;p["positionAfter"]=after;p["kvMaxAfter"]=max;
        }
    } catch (...) {}
}
static void hd_piece_observed(const std::string & piece,const std::string & accumulated,int status,jstring converted,JNIEnv * env) noexcept {
    try {
        if(hd_pending_probe<0) return;
        uint64_t hash=1469598103934665603ULL;
        for(unsigned char c:piece) hash=haruna_probe::mix(hash,c);
        bool roundtrip=false;
        if(status==0 && converted) roundtrip=hs_from_java(env,converted)==accumulated;
        std::lock_guard<std::mutex> guard(hd_lock);auto & p=hd_probes.at(hd_pending_probe);
        p["pieceBytes"]=piece.size();p["pieceFingerprint"]=std::to_string(hash);
        p["pieceUtf8"]=hs_utf8(piece);p["accumulatedUtf8"]=status;
        p["accumulatedBytes"]=accumulated.size();p["javaProduced"]=converted!=nullptr;
        if(status==0 && converted) p["javaRoundTripExact"]=roundtrip;
    } catch (...) {}
}
static HarunaJson hd_snapshot() {
    std::lock_guard<std::mutex> guard(hd_lock);
    HarunaJson r={{"probes",hd_probes},{"sampler",hd_sampler},{"probeCostUs",hd_cost},
        {"acceptedGeneratedTokens",hd_accepts},{"positionErrors",hd_position_errors},
        {"fixedSeedDBG",hd_fixed_seed},{"seedDBG",424242},{"flashOffRequestedDBG",hd_fa_off},
        {"cpuConservativeEffectiveDBG",hd_cpu_conservative},{"cpuLoadFallbackDBG",hd_cpu_fallback}};
    // Fixed-length prefix fingerprint, never full response, never token text.
    r["initialIdCount"]=hd_first_count;r["initialIdFingerprint"]=std::to_string(hd_first_hash);
#if defined(__aarch64__)
    r["hwcap"]=std::to_string(getauxval(AT_HWCAP));r["hwcap2"]=std::to_string(getauxval(AT_HWCAP2));
#endif
    return r;
}
extern "C" JNIEXPORT jint JNICALL
Java_com_arm_aichat_internal_InferenceEngineImpl_setDiagnosticOptions(JNIEnv *,jobject,jboolean fixed,jboolean fa_off) {
    if(hs_ticket.load()!=0) return 1;
    std::lock_guard<std::mutex> guard(hd_lock);hd_fixed_seed=fixed;hd_fa_off=fa_off;return 0;
}
