// Haruna adapter only. Inference, image encoding and tokenization are upstream libmtmd/libllama.
#include <jni.h>
#include "llama.h"
#include "mtmd.h"
#include "mtmd-helper.h"
#include "chat.h"
#include <atomic>
#include <mutex>
#include <memory>
#include <string>
#include <vector>
#include <codecvt>
#include <locale>
#include <stdexcept>

namespace {
std::mutex operation;
std::atomic<jlong> active{0},cancelled{0};
std::atomic<int> errorCode{0},currentPhase{0},stopCode{0};
bool aborted(void* p){return cancelled.load()==*static_cast<jlong*>(p);}
bool progress(float,void* p){return !aborted(p);}
std::string utf8(JNIEnv* env,jstring value){if(!value)return {};const auto* p=env->GetStringChars(value,nullptr);if(!p)throw std::bad_alloc();std::u16string s(reinterpret_cast<const char16_t*>(p),env->GetStringLength(value));env->ReleaseStringChars(value,p);return std::wstring_convert<std::codecvt_utf8_utf16<char16_t>,char16_t>{}.to_bytes(s);}
void quiet(ggml_log_level,const char*,void*){} // mtmd logs may contain private paths; never forward free-form messages.
struct Failure:std::runtime_error{int code;explicit Failure(int c):std::runtime_error("vision"),code(c){}};
void require(bool value,int code){if(!value)throw Failure(code);}
}
#define JNI(name) Java_com_proxyslabs_haruna_documents_VisionNative_##name
extern "C" JNIEXPORT jbyteArray JNICALL JNI(analyze)(JNIEnv* e,jobject,jlong ticket,jstring modelPath,jstring projection,jbyteArray rgb,jint w,jint h,jstring question){
    std::lock_guard<std::mutex> lock(operation);if(ticket<=0)return nullptr;active=ticket;errorCode=0;stopCode=0;currentPhase=1;
    struct Retire{~Retire(){active=0;currentPhase=0;}} retire;
    try{
        require(!aborted(&ticket),10);require(w>0&&h>0&&w<=1024&&h<=1024&&e->GetArrayLength(rgb)==w*h*3,5);
        const auto path=utf8(e,modelPath),proj=utf8(e,projection),query=utf8(e,question);require(query.size()<=8000,6);
        auto mp=llama_model_default_params();mp.n_gpu_layers=0;mp.progress_callback=progress;mp.progress_callback_user_data=&ticket;
        std::unique_ptr<llama_model,decltype(&llama_model_free)> model(llama_model_load_from_file(path.c_str(),mp),llama_model_free);require(model!=nullptr,2);require(!aborted(&ticket),10);
        auto cp=llama_context_default_params();cp.n_ctx=4096;cp.n_batch=256;cp.n_ubatch=256;cp.n_threads=2;cp.n_threads_batch=4;cp.abort_callback=aborted;cp.abort_callback_data=&ticket;
        std::unique_ptr<llama_context,decltype(&llama_free)> ctx(llama_init_from_model(model.get(),cp),llama_free);require(ctx!=nullptr,3);
        mtmd_helper_log_set(quiet,nullptr);auto vp=mtmd_context_params_default();vp.use_gpu=false;vp.n_threads=4;vp.warmup=false;vp.image_max_tokens=1024;vp.progress_callback=progress;vp.progress_callback_user_data=&ticket;
        std::unique_ptr<mtmd_context,decltype(&mtmd_free)> vision(mtmd_init_from_file(proj.c_str(),model.get(),vp),mtmd_free);require(vision&&mtmd_support_vision(vision.get()),4);require(!aborted(&ticket),10);
        std::vector<unsigned char> pixels(w*h*3);e->GetByteArrayRegion(rgb,0,pixels.size(),reinterpret_cast<jbyte*>(pixels.data()));
        std::unique_ptr<mtmd_bitmap,decltype(&mtmd_bitmap_free)> bitmap(mtmd_bitmap_init(w,h,pixels.data()),mtmd_bitmap_free);require(bitmap!=nullptr,5);
        currentPhase=2;auto tmpls=common_chat_templates_init(model.get(),"");common_chat_msg user;user.role="user";user.content=std::string(mtmd_default_marker())+"\n"+(query.empty()?"Describe the visible image accurately. Do not invent details or unreadable text.":query);
        const auto prompt=common_chat_format_single(tmpls.get(),{},user,true,true);
        mtmd_input_text input{prompt.c_str(),prompt.size(),true,true};const mtmd_bitmap* items[]={bitmap.get()};
        std::unique_ptr<mtmd_input_chunks,decltype(&mtmd_input_chunks_free)> chunks(mtmd_input_chunks_init(),mtmd_input_chunks_free);
        require(mtmd_tokenize(vision.get(),chunks.get(),&input,items,1)==0,6);require(mtmd_helper_get_n_pos(chunks.get())+384<llama_n_ctx(ctx.get()),7);
        llama_pos past=0;require(mtmd_helper_eval_chunks(vision.get(),ctx.get(),chunks.get(),0,0,256,true,&past)==0,8);require(!aborted(&ticket),10);
        currentPhase=3;std::unique_ptr<llama_sampler,decltype(&llama_sampler_free)> sampler(llama_sampler_init_greedy(),llama_sampler_free);const auto* vocab=llama_model_get_vocab(model.get());std::string output;
        for(int i=0;i<384;i++){require(!aborted(&ticket),10);auto token=llama_sampler_sample(sampler.get(),ctx.get(),-1);if(llama_vocab_is_eog(vocab,token)){stopCode=1;break;}
            int n=llama_token_to_piece(vocab,token,nullptr,0,0,false);std::vector<char> piece(n<0?-n:n);if(!piece.empty()){n=llama_token_to_piece(vocab,token,piece.data(),piece.size(),0,false);require(n>=0,9);output.append(piece.data(),n);}
            require(output.size()<=16000,9);auto batch=llama_batch_get_one(&token,1);require(llama_decode(ctx.get(),batch)==0,9);past++;if(i==383)stopCode=2;
        }
        require(!aborted(&ticket),10);auto out=e->NewByteArray(output.size());if(out)e->SetByteArrayRegion(out,0,output.size(),reinterpret_cast<const jbyte*>(output.data()));return out;
    }catch(const Failure& f){errorCode=aborted(&ticket)?10:f.code;}catch(...){errorCode=aborted(&ticket)?10:11;}return nullptr;
}
extern "C" JNIEXPORT void JNICALL JNI(cancel)(JNIEnv*,jobject,jlong ticket){if(active.load()==ticket||active.load()==0){auto before=cancelled.load();while(before<ticket&&!cancelled.compare_exchange_weak(before,ticket)){};}}
extern "C" JNIEXPORT jint JNICALL JNI(error)(JNIEnv*,jobject){return errorCode;}
extern "C" JNIEXPORT jint JNICALL JNI(phase)(JNIEnv*,jobject){return currentPhase;}
extern "C" JNIEXPORT jint JNICALL JNI(stopReason)(JNIEnv*,jobject){return stopCode;}
