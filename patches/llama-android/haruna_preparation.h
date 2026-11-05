// Bounded, content-free preparation diagnostics. No exception messages are retained.
#pragma once
#include <atomic>
#include <climits>
#include <cstring>
#include <new>
#include <system_error>
#include <stdexcept>

enum class HprepStage { idle, runtime, configure, messages, chat_template, tokenize,
    checkpoint, reconcile, sampler, batch_build, prefill_decode, prefill_commit,
    prefill_finish, observe, ready };
static const char * hprep_name(int s) noexcept {
    static const char * names[]={"idle","runtime","configure","messages","chat_template","tokenize",
        "checkpoint","reconcile","sampler","batch_build","prefill_decode","prefill_commit",
        "prefill_finish","observe","ready"};
    return s>=0&&s<16?names[s]:"unknown";
}
static std::atomic<int> hprep_stage{0},hprep_failed{0},hprep_return{INT_MAX},
    hprep_subtype{0},hprep_kind{0},hprep_system_code{0},hprep_category{0},hprep_hint{0},
    hprep_attempts{0},hprep_completed{0},hprep_offset{0},hprep_count{0};
static std::atomic<bool> hprep_cleanup_failed{false};
static void hprep_set(HprepStage stage) noexcept {hprep_stage=static_cast<int>(stage);}
static void hprep_reset() noexcept {
    hprep_stage=0;hprep_failed=0;hprep_return=INT_MAX;hprep_kind=0;hprep_subtype=0;hprep_system_code=0;
    hprep_category=0;hprep_hint=0;hprep_attempts=0;hprep_completed=0;hprep_offset=0;hprep_count=0;hprep_cleanup_failed=false;
}
static void hprep_fail() noexcept {int empty=0;hprep_failed.compare_exchange_strong(empty,hprep_stage.load());}
// Called only inside a catch. Fixed enums and numeric error codes are the only retained data.
static void hprep_exception() noexcept {
    if(hprep_kind.load()!=0)return;
    hprep_fail();
    try {throw;}
    catch(const std::bad_alloc &) {hprep_kind=1;}
    catch(const std::system_error & e) {
        hprep_kind=2;hprep_system_code=e.code().value();
        const char * c=e.code().category().name();
        hprep_category=std::strcmp(c,"vk::Result")==0?1:std::strcmp(c,"system")==0?2:std::strcmp(c,"generic")==0?3:4;
    }
    catch(const std::exception & e) {
        hprep_kind=3;
        hprep_subtype=dynamic_cast<const std::out_of_range*>(&e)?1:dynamic_cast<const std::length_error*>(&e)?2:
            dynamic_cast<const std::invalid_argument*>(&e)?3:dynamic_cast<const std::logic_error*>(&e)?4:
            dynamic_cast<const std::runtime_error*>(&e)?5:6;
        const char * s=e.what();
        if(s){if(std::strstr(s,"Shared memory size too small for matrix multiplication"))hprep_hint=1;
            else if(std::strstr(s,"unsupported FaCodePath"))hprep_hint=2;
            else if(std::strstr(s,"Unsupported device"))hprep_hint=3;}
    }
    catch(...) {hprep_kind=4;}
}
static bool hprep_is_prefill_failure() noexcept {
    const int s=hprep_failed.load();
    return s>=static_cast<int>(HprepStage::batch_build)&&s<=static_cast<int>(HprepStage::prefill_finish);
}
template<class Decode> static int hprep_decode(int offset,int count,Decode decode) {
    hprep_set(HprepStage::prefill_decode);hprep_offset=offset;hprep_count=count;++hprep_attempts;
    hprep_return=INT_MAX;
    try {
        const int code=decode();hprep_return=code;
        if(code)hprep_fail();else ++hprep_completed;
        return code;
    }catch(...){hprep_exception();throw;}
}
