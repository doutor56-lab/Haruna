#pragma once
#ifdef HARUNA_VULKAN_TRACE
#include "ggml.h"
#include <exception>
#include <system_error>
#include <new>
extern "C" {
GGML_API void haruna_vk_trace_snapshot(int64_t * out);
GGML_API void haruna_vk_trace_begin();
GGML_API void haruna_vk_trace_end();
GGML_API unsigned haruna_vk_trace_event(int stage,int event,int op,int code);
}
struct HarunaVkScope {
    int stage,op,unwinding;unsigned entered;
    HarunaVkScope(int s,int o=-1):stage(s),op(o),unwinding(std::uncaught_exceptions()),entered(haruna_vk_trace_event(s,1,o,0)){}
    ~HarunaVkScope(){if(entered)haruna_vk_trace_event(stage,std::uncaught_exceptions()>unwinding?3:2,op,0);}
};
struct HarunaVkRequest {bool enabled;explicit HarunaVkRequest(bool on):enabled(on){if(enabled)haruna_vk_trace_begin();}~HarunaVkRequest(){if(enabled)haruna_vk_trace_end();}};
#define HV_SCOPE(s) HarunaVkScope hv_scope(s)
#define HV_OP_SCOPE(s,o) HarunaVkScope hv_scope(s,static_cast<int>(o))
#define HV_CALL(s,expr) ([&](){HarunaVkScope scope(s);return (expr);}())
#define HV_ERROR(s,c) haruna_vk_trace_event(s,4,-1,c)
#else
#define HV_SCOPE(s) ((void)0)
#define HV_OP_SCOPE(s,o) ((void)0)
#define HV_CALL(s,expr) (expr)
#define HV_ERROR(s,c) ((void)0)
#endif
