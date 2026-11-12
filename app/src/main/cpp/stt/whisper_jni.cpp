#include <jni.h>
#include <algorithm>
#include <atomic>
#include <whisper.h>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>
#include <stdexcept>

namespace {
struct Session {
    std::unique_ptr<whisper_context, decltype(&whisper_free)> ctx{nullptr, whisper_free};
    std::atomic<bool> cancelled{false};
};
std::mutex sessions_lock;
std::unordered_map<jlong,std::shared_ptr<Session>> sessions;
std::atomic<jlong> next_id{1};
std::shared_ptr<Session> session(jlong id) {
    std::lock_guard<std::mutex> lock(sessions_lock);
    auto it=sessions.find(id);
    return it==sessions.end()?nullptr:it->second;
}
void set_cancelled(jlong id,bool value) {
    std::lock_guard<std::mutex> lock(sessions_lock);
    auto it=sessions.find(id);if(it!=sessions.end())it->second->cancelled=value;
}
void fail(JNIEnv*env,const char*message) { env->ThrowNew(env->FindClass("java/lang/IllegalStateException"),message); }
}
extern "C" JNIEXPORT jlong JNICALL
Java_com_proxyslabs_haruna_speech_WhisperCppNative_load(JNIEnv*env,jobject,jstring path) {
    try {
        const char*chars=env->GetStringUTFChars(path,nullptr);if(!chars)return 0;
        std::string filename(chars);env->ReleaseStringUTFChars(path,chars);
        auto s=std::make_shared<Session>();auto config=whisper_context_default_params();config.use_gpu=false;
        s->ctx.reset(whisper_init_from_file_with_params(filename.c_str(),config));
        if(!s->ctx||!whisper_is_multilingual(s->ctx.get()))throw std::runtime_error("Modelo Whisper incompleto ou incompatível.");
        const auto id=next_id.fetch_add(1);std::lock_guard<std::mutex>lock(sessions_lock);sessions.emplace(id,std::move(s));return id;
    }catch(...){fail(env,"Não foi possível carregar o Whisper local.");return 0;}
}
extern "C" JNIEXPORT void JNICALL
Java_com_proxyslabs_haruna_speech_WhisperCppNative_resetCancellation(JNIEnv*,jobject,jlong id) {set_cancelled(id,false);}
extern "C" JNIEXPORT void JNICALL
Java_com_proxyslabs_haruna_speech_WhisperCppNative_cancel(JNIEnv*,jobject,jlong id) {set_cancelled(id,true);}
extern "C" JNIEXPORT void JNICALL
Java_com_proxyslabs_haruna_speech_WhisperCppNative_unload(JNIEnv*,jobject,jlong id) {
    std::shared_ptr<Session> owned;
    {std::lock_guard<std::mutex>lock(sessions_lock);auto it=sessions.find(id);if(it==sessions.end())return;owned=std::move(it->second);sessions.erase(it);}
    owned->cancelled=true; // An in-flight decoder owns a shared reference until it stops.
}
extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_proxyslabs_haruna_speech_WhisperCppNative_transcribe(JNIEnv *env,jobject,jlong id,jfloatArray audio) {
    try {
        auto s=session(id);if(!s)throw std::runtime_error("Sessão Whisper descarregada.");
        const int n=env->GetArrayLength(audio);
        if(n<=0||n>16000*21)throw std::runtime_error("Trecho de áudio inválido.");
        std::vector<float> samples(n);env->GetFloatArrayRegion(audio,0,n,samples.data());if(env->ExceptionCheck())return nullptr;
        auto params=whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
        params.n_threads=2;params.language="pt";params.translate=false;params.no_context=true;params.no_timestamps=true;
        params.print_realtime=false;params.print_progress=false;params.print_timestamps=false;params.print_special=false;
        params.abort_callback=[](void*p){return static_cast<Session*>(p)->cancelled.load();};params.abort_callback_user_data=s.get();
        const int result=s->cancelled.load()?1:whisper_full(s->ctx.get(),params,samples.data(),n);
        std::fill(samples.begin(),samples.end(),0.f);
        if(result!=0)throw std::runtime_error(s->cancelled.load()?"Transcrição cancelada.":"Não foi possível transcrever este áudio localmente.");
        std::string text;for(int i=0;i<whisper_full_n_segments(s->ctx.get());++i)text+=whisper_full_get_segment_text(s->ctx.get(),i);
        auto output=env->NewByteArray(static_cast<jsize>(text.size()));if(output)env->SetByteArrayRegion(output,0,static_cast<jsize>(text.size()),reinterpret_cast<const jbyte*>(text.data()));return output;
    }catch(const std::exception&e){fail(env,e.what());return nullptr;}catch(...){fail(env,"Falha no motor Whisper local.");return nullptr;}
}
