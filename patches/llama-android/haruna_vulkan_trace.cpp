// Experimental only. Fixed IDs/numeric data; no tensor names, text, paths or exception messages.
#include "haruna-vulkan-trace.h"
extern "C" { GGML_API void ggml_log_internal(enum ggml_log_level, const char *, ...); }
#ifdef HARUNA_VULKAN_TRACE
#include <atomic>
#include <ctime>
static std::atomic<unsigned> hv_request{0},hv_events{0};
static std::atomic<bool> hv_active{false};
static std::atomic<int> hv_started{0},hv_completed{0},hv_failed{0},hv_op{-1};
static std::atomic<long long> hv_time{0};
static long long hv_now(){timespec t{};clock_gettime(CLOCK_MONOTONIC,&t);return (long long)t.tv_sec*1000000+t.tv_nsec/1000;}
extern "C" void haruna_vk_trace_begin(){hv_active=false;hv_events=0;hv_started=0;hv_completed=0;hv_failed=0;hv_op=-1;hv_time=0;++hv_request;hv_active=true;haruna_vk_trace_event(1,1,-1,0);}
extern "C" void haruna_vk_trace_end(){haruna_vk_trace_event(1,std::uncaught_exceptions()?3:2,-1,0);hv_active=false;}
extern "C" unsigned haruna_vk_trace_event(int stage,int event,int op,int code){
    if(!hv_active.load())return 0;
    unsigned n=++hv_events;
    if(event==1){hv_started=stage;hv_op=op;hv_time=hv_now();}
    if(event==2)hv_completed=stage;
    if(event>=3){int empty=0;hv_failed.compare_exchange_strong(empty,stage);}
    // Detail is bounded; exception/error and request completion remain visible after the cap.
    if(n<=384||event>=3||(stage==1&&event==2))ggml_log_internal(GGML_LOG_LEVEL_INFO,
        "HARUNA_VULKAN request=%u marker=%u stage=%d event=%d op=%d code=%d mono_us=%lld\n",
        hv_request.load(),n,stage,event,op,code,hv_now());
    return n;
}
extern "C" void haruna_vk_trace_snapshot(int64_t * out){if(!out)return;const int64_t v[]={hv_request.load(),hv_active.load()?1:0,hv_started.load(),hv_completed.load(),hv_failed.load(),hv_op.load(),hv_events.load(),hv_time.load()};for(int i=0;i<8;i++)out[i]=v[i];}
#endif
