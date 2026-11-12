// Exercises the production Android binding against real, tiny SmolLM3 weights on the host.
#include "examples/llama.android/lib/src/main/cpp/ai_chat.cpp"
#include <cassert>
#include <iostream>
extern "C" int __android_log_print(int,const char*,const char*,...){return 0;}
extern "C" int __android_log_vprint(int,const char*,const char*,va_list){return 0;}
extern "C" int __android_log_is_loggable(int,const char*,int){return 0;}
extern "C" int __android_log_write(int,const char*,const char*){return 0;}
struct Str {std::u16string s;explicit Str(const std::string&v):s(v.begin(),v.end()){} jstring ref(){return reinterpret_cast<jstring>(this);}};
struct Arr {std::vector<jobject> v;jobjectArray ref(){return reinterpret_cast<jobjectArray>(this);}};
static jsize JNICALL len(JNIEnv*,jstring s){return reinterpret_cast<Str*>(s)->s.size();}
static const jchar* JNICALL chars(JNIEnv*,jstring s,jboolean*){return reinterpret_cast<const jchar*>(reinterpret_cast<Str*>(s)->s.data());}
static void JNICALL release(JNIEnv*,jstring,const jchar*){}
static jsize JNICALL size(JNIEnv*,jarray a){return reinterpret_cast<Arr*>(a)->v.size();}
static jobject JNICALL get(JNIEnv*,jobjectArray a,jsize i){return reinterpret_cast<Arr*>(a)->v.at(i);}
static void JNICALL drop(JNIEnv*,jobject){}
static JNINativeInterface_ table{};
static JNIEnv_ env{&table};
static std::string settings=R"({"profile":"smollm3","temperature":0.6,"topK":40,"topP":0.95,"minP":0.05,"repeat":1,"presence":0,"frequency":0,"seed":424242,"threads":2,"threadsBatch":3,"nCtx":8192,"nBatch":512,"nUbatch":512,"flashAttention":"off"})";
static llama_tokens canonical(const std::string&s,const std::string&u){
    common_chat_msg a,b;a.role="system";a.content=s;b.role="user";b.content=u;
    common_chat_templates_inputs in;in.messages={a,b};in.use_jinja=true;in.add_generation_prompt=true;in.enable_thinking=false;
    return haruna_tokenize(common_chat_templates_apply(g_chat_templates.get(),in).prompt);
}
static void equal_cold(const llama_tokens&tokens){
    auto p=llama_context_default_params();p.n_ctx=8192;p.n_batch=512;p.n_ubatch=512;p.n_threads=2;p.n_threads_batch=3;p.flash_attn_type=LLAMA_FLASH_ATTN_TYPE_DISABLED;
    auto*ref=llama_init_from_model(g_model,p);assert(ref);
    for(size_t i=0;i<tokens.size();i+=512){common_batch b(ref);size_t end=std::min(i+512,tokens.size());for(size_t j=i;j<end;++j)b.add(tokens[j],j,{0},j+1==tokens.size());assert(llama_process(ref,LLAMA_PROCESS_TYPE_DECODE,b.get())==0);}
    const auto n=llama_vocab_n_tokens(llama_model_get_vocab(g_model));const float*a=llama_get_logits_ith(g_context,-1),*b=llama_get_logits_ith(ref,-1);double err=0,mag=0;
    for(int i=0;i<n;++i){assert(std::isfinite(a[i])&&std::isfinite(b[i]));err+=(a[i]-b[i])*(a[i]-b[i]);mag+=b[i]*b[i];}
    assert(err/std::max(1.0,mag)<1e-8);llama_free(ref);
}
static void request(const std::string&s,const std::string&u,const std::string&cfg,bool reuse,bool lab=false){
    Str rs("system"),ru("user"),ss(s),su(u),key("chat-a"),empty(""),conf(cfg),labconf(lab?std::string("{\"cache\":false,")+settings.substr(1):"");
    Arr roles{{reinterpret_cast<jobject>(rs.ref()),reinterpret_cast<jobject>(ru.ref())}},values{{reinterpret_cast<jobject>(ss.ref()),reinterpret_cast<jobject>(su.ref())}};
    assert(Java_com_arm_aichat_internal_InferenceEngineImpl_reserveGeneration(&env,nullptr,1)==0);
    const int code=Java_com_arm_aichat_internal_InferenceEngineImpl_processChatMessages(&env,nullptr,roles.ref(),values.ref(),64,false,key.ref(),0,labconf.ref(),ss.ref(),conf.ref());
    if(code)std::cerr<<"prepare rc="<<code<<"\n";
    assert(code==0);assert(hm_prefill_tokens>0);
    const auto k=hk_snapshot();if(reuse){assert(k.at("reusedTokens").get<int>()>0);assert(hm_prefill_tokens<hm_input);}else{if(!cfg.empty())assert(k.at("reusedTokens").get<size_t>()<hw_tokens.size());else assert(k.at("reusedTokens")==0);assert(hm_runtime["startup"]["restoredForRequest"]==false);if(cfg.empty())assert(hm_prefill_tokens==hm_input);}
    equal_cold(canonical(s,u));hm_finish(1);
    assert(Java_com_arm_aichat_internal_InferenceEngineImpl_finishGeneration(&env,nullptr,1)==0);
}
int main(int argc,char**argv){
    assert(argc==2);table.GetStringLength=len;table.GetStringChars=chars;table.ReleaseStringChars=release;table.GetArrayLength=size;table.GetObjectArrayElement=get;table.DeleteLocalRef=drop;
    llama_log_set([](ggml_log_level level,const char*text,void*){if(level==GGML_LOG_LEVEL_ERROR)std::cerr<<text;},nullptr);llama_backend_init();
    auto mp=llama_model_default_params();mp.n_gpu_layers=0;g_model=llama_model_load_from_file(argv[1],mp);assert(g_model);++hs_loads;
    assert(Java_com_arm_aichat_internal_InferenceEngineImpl_prepare(&env,nullptr)==0);assert(ht_decode);
    std::string system;for(int i=0;i<45;++i)system+="Static instruction. ";
    assert(hw_prime(system,settings,64ULL*1024*1024)==0);assert(!hw_state.empty());assert(hk_bounds(0));
    const auto pools=ht_created;
    request(system+" Personal information.","Tell me about birds.",settings,true);
    assert(hm_runtime["startup"]["restoredForRequest"]==true);assert(ht_created==pools);
    request(system+" Personal information.","Tell me about birds. Another question.",settings,true);
    assert(hm_runtime["startup"]["restoredForRequest"]==false);assert(ht_created==pools);
    // A reset discards the personal suffix and restores only static instructions.
    hk_invalidate(HkReason::explicit_reset,true);
    request(system+" Other information.","Tell me about plants.",settings,true);
    // Editing the prefix invalidates reuse.
    request("Changed instruction. "+system,"Tell me about birds.",settings,false);
    // Canonical lab/legacy requests have no normal configuration: full input is evaluated.
    hk_invalidate(HkReason::explicit_reset,true);
    request(system,"Tell me about birds.","",false,true);
    assert(!hw_state.empty());
    assert(hm_runtime["startup"]["restoredForRequest"]==false);
    auto step=[](){hk_invalidate(HkReason::explicit_reset,true);common_batch b(g_context);b.add(42,0,{0},true);assert(llama_process(g_context,LLAMA_PROCESS_TYPE_DECODE,b.get())==0);assert(std::isfinite(llama_get_logits_ith(g_context,-1)[0]));};
    ht_set_threads(g_context,1,2);step();assert(ht_threads==1&&ht_batch_threads==2);
    ht_set_threads(g_context,2,2);step();assert(ht_threads==2&&ht_batch==nullptr);
    ht_set_threads(g_context,2,3);step();assert(ht_batch);
    haruna_release_resources();assert(!ht_context&&!ht_decode&&hw_state.empty());
    // Repeated context destruction must not leave a pool in the backend scheduler.
    g_model=llama_model_load_from_file(argv[1],mp);assert(g_model);++hs_loads;
    assert(Java_com_arm_aichat_internal_InferenceEngineImpl_prepare(&env,nullptr)==0);
    assert(hw_prime(system,settings,0)==0&&hw_state.empty());haruna_release_resources();
    llama_backend_free();std::cout<<"PASS: real SmolLM3 cold/restore logits, cache isolation, threadpool lifecycle\n";
}
