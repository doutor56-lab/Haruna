#pragma once
#ifndef HARUNA_DIAGNOSTIC_45
#define HARUNA_DIAGNOSTIC_45 0
#endif
#if HARUNA_DIAGNOSTIC_45
#include <fstream>
#include <set>
static const char * d45_system="Você é Haruna, uma assistente local. Responda de forma clara e objetiva em português.";
static const char * d45_prompt="Explique em português, de forma clara e objetiva, por que a água ferve quando é aquecida.";
struct D45Capture {
    std::string dir;
    std::ofstream tokens;
    std::set<int> captures;
    int step=0;
    using Reset=void(*)(bool); using Count=uint64_t(*)(int);
    Reset reset=nullptr; Count count=nullptr;
    explicit D45Capture(std::string path):dir(std::move(path)),tokens(dir+"/tokens.jsonl",std::ios::trunc) {
        if(!tokens) throw std::runtime_error("Diagnostic output unavailable");
        auto reg=ggml_backend_reg_by_name("CPU");
        if(reg) {
            reset=reinterpret_cast<Reset>(ggml_backend_reg_get_proc_address(reg,"haruna45_reset"));
            count=reinterpret_cast<Count>(ggml_backend_reg_get_proc_address(reg,"haruna45_count"));
        }
        if(!reset || !count) throw std::runtime_error("Diagnostic kernel counters unavailable");
        reset(true);
    }
    ~D45Capture(){if(reset)reset(false);}
    void json(const std::string & name,const HarunaJson & data) {
        std::ofstream file(dir+"/"+name,std::ios::trunc);file<<data.dump(2)<<'\n';
        if(!file)throw std::runtime_error("Diagnostic write failed");
    }
    HarunaJson kernels() const {
        return {{"successfulExtraTraitsThreadCalls",count?count(0):0},
            {"kleidiaiThreadCalls",count?count(1):0},{"repackThreadCalls",count?count(2):0}};
    }
};
static thread_local D45Capture * d45_capture=nullptr;
static void d45_validate(const std::vector<common_chat_msg> & messages) {
    if(!d45_capture)return;
    if(messages.size()!=2 || messages[0].role!="system" || messages[0].content!=d45_system ||
       messages[1].role!="user" || messages[1].content!=d45_prompt)
        throw std::runtime_error("Diagnostic accepts canonical input only");
}
static void d45_input(const llama_tokens & tokens) {
    if(!d45_capture)return;
    if(hk_confirmed.load()!=0 || hk_memory_count()!=0)throw std::runtime_error("Diagnostic requires empty KV");
    d45_capture->json("input.json",{{"schema",45},{"tokens",tokens},{"system",d45_system},{"prompt",d45_prompt},
        {"enableThinking",true},{"maxTokens",512},{"seed",424242}});
}
static void d45_choice(llama_token id,int position) {
    if(!d45_capture)return;
    auto & c=*d45_capture;const int step=++c.step;
    if(step>512)throw std::runtime_error("Diagnostic token bound exceeded");
    const int n=llama_vocab_n_tokens(llama_model_get_vocab(g_model));
    const float * logits=llama_get_logits_ith(g_context,-1);
    if(!logits || id<0 || id>=n)throw std::runtime_error("Diagnostic logits unavailable");
    const auto piece=common_token_to_piece(g_context,id);
    std::string hex;static const char digits[]="0123456789abcdef";
    for(unsigned char b:piece){hex+=digits[b>>4];hex+=digits[b&15];}
    int nan=0,inf=0;float lo=std::numeric_limits<float>::max(),hi=-lo;
    for(int i=0;i<n;++i)if(std::isnan(logits[i]))++nan;else if(!std::isfinite(logits[i]))++inf;
        else{lo=std::min(lo,logits[i]);hi=std::max(hi,logits[i]);}
    const auto mem=llama_get_memory(g_context);
    HarunaJson row={{"index",step},{"id",id},{"position",position},{"seqId",0},
        {"pieceHex",hex},{"pieceUtf8",hs_utf8(piece)},{"eog",llama_vocab_is_eog(llama_model_get_vocab(g_model),id)},
        {"nan",nan},{"inf",inf},{"kvMax",llama_memory_seq_pos_max(mem,0)},{"kernels",c.kernels()}};
    if(hs_utf8(piece)==0)row["pieceText"]=piece;
    if(std::isfinite(logits[id]))row["rawLogit"]=logits[id];
    if(lo<=hi){row["logitMin"]=lo;row["logitMax"]=hi;}
    const auto * candidates=common_sampler_get_candidates(g_sampler,false);
    if(candidates && candidates->data)for(size_t i=0;i<candidates->size;++i)if(candidates->data[i].id==id){
        if(std::isfinite(candidates->data[i].p))row["probability"]=candidates->data[i].p;
        break;
    }
    if(c.captures.count(step)) {
        static_assert(__BYTE_ORDER__==__ORDER_LITTLE_ENDIAN__,"Diagnostic binary encoding requires little endian");
        static_assert(sizeof(float)==4,"Diagnostic expects float32");
        const auto name="logits-"+std::to_string(step)+".f32";
        std::ofstream file(c.dir+"/"+name,std::ios::binary|std::ios::trunc);
        file.write(reinterpret_cast<const char *>(logits),n*sizeof(float));file.close();
        if(!file)throw std::runtime_error("Diagnostic logits write failed");
        row["logitsFile"]=name;row["vocabSize"]=n;
    }
    c.tokens<<row.dump()<<'\n';if(!c.tokens)throw std::runtime_error("Diagnostic token write failed");
}
#else
static void d45_validate(const std::vector<common_chat_msg> &) {}
static void d45_input(const llama_tokens &) {}
static void d45_choice(llama_token,int) {}
#endif
