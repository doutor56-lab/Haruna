// Actual JNI adapter with a FAKE SD C API. No model load or inference.
#include <cassert>
#include <chrono>
#include <thread>
#include <cstring>
#include "../app/src/main/cpp/safetensors/safetensors_jni.cpp"
struct sd_ctx_t { std::atomic<bool> freed{false}; };
std::atomic<int> cancellations{0},frees{0};
void sd_set_log_callback(sd_log_cb_t,void*){}
void sd_set_progress_callback(sd_progress_cb_t,void*){}
void sd_ctx_params_init(sd_ctx_params_t* p){std::memset(p,0,sizeof(*p));}
sd_ctx_t* new_sd_ctx(const sd_ctx_params_t*){return nullptr;}
void free_sd_ctx(sd_ctx_t* p){assert(!p->freed.exchange(true));++frees;/* keep tiny fake allocation for race assertions */}
const char* sd_get_model_version_name(const sd_ctx_t*){return "SD 1.x";}
void sd_img_gen_params_init(sd_img_gen_params_t* p){std::memset(p,0,sizeof(*p));}
bool generate_image(sd_ctx_t*,const sd_img_gen_params_t*,sd_image_generation_result_t** out){*out=nullptr;return false;}
void free_sd_image_generation_result(sd_image_generation_result_t*){}
void sd_cancel_generation(sd_ctx_t* p,sd_cancel_mode_t){assert(!p->freed);++cancellations;std::this_thread::sleep_for(std::chrono::microseconds(50));assert(!p->freed);}
int main(){
    Session s;s.phase=2;s.total=5;
    progress(1,1,0,&s);assert(s.phase==2&&s.step==0&&s.total==5);
    progress(0,5,0,&s);assert(s.phase==3);progress(2,5,0,&s);assert(s.step==2);
    progress(9,99,0,&s);assert(s.step==2&&s.total==5);
    progress(5,5,0,&s);assert(s.phase==4&&s.step==5);
    progress(0,5,0,&s);progress(1,1,0,&s);assert(s.phase==4&&s.step==5);
    Session one;one.phase=2;one.total=1;progress(1,1,0,&one);assert(one.phase==2);progress(0,1,0,&one);progress(1,1,0,&one);assert(one.phase==4);
    const auto id=JNI(create)(nullptr,nullptr);assert(id>0);auto active=find(id);auto* ctx=new sd_ctx_t();active->ctx=ctx;
    std::atomic<bool> stop{false};std::thread ui([&]{while(!stop)JNI(cancel)(nullptr,nullptr,id);});
    std::this_thread::sleep_for(std::chrono::milliseconds(5));JNI(destroy)(nullptr,nullptr,id);stop=true;ui.join();assert(frees==1&&ctx->freed);JNI(destroy)(nullptr,nullptr,id);assert(frees==1);
    const auto next=JNI(create)(nullptr,nullptr);assert(next>id);const int before=cancellations;JNI(cancel)(nullptr,nullptr,id);assert(cancellations==before);JNI(destroy)(nullptr,nullptr,next);delete ctx;
    puts("PASS: actual JNI sampler/weights/tiles discrimination, cancel/free race, idempotent destroy and stale serial; FAKE SD API, no inference.");
}
