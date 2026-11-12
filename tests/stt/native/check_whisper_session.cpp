// Real JNI ownership code, fake Whisper/JNI transport. Not a speech quality/performance test.
#include "../../../app/src/main/cpp/stt/whisper_jni.cpp"
#include <cassert>
#include <chrono>
#include <thread>
#include <iostream>
std::atomic<int> loads{0},frees{0},decodes{0};std::atomic<bool> block{false},entered{false};
whisper_context_params whisper_context_default_params(){return {};}
whisper_context*whisper_init_from_file_with_params(const char*p,whisper_context_params c){assert(!c.use_gpu);if(std::string(p)=="bad")return nullptr;++loads;return new whisper_context;}
void whisper_free(whisper_context*c){++frees;delete c;}
bool whisper_is_multilingual(whisper_context*){return true;}
whisper_full_params whisper_full_default_params(whisper_sampling_strategy){return {};}
int whisper_full(whisper_context*,whisper_full_params p,const float*,int){
 ++decodes;assert(p.no_context&&p.no_timestamps&&!p.translate&&std::string(p.language)=="pt"&&p.n_threads==2);
 entered=true;const auto limit=std::chrono::steady_clock::now()+std::chrono::seconds(3);
 while(block){assert(std::chrono::steady_clock::now()<limit);if(p.abort_callback(p.abort_callback_user_data))return 1;std::this_thread::yield();}
 return 0;
}
int whisper_full_n_segments(whisper_context*){return 1;}
const char*whisper_full_get_segment_text(whisper_context*,int){return "fala";}
struct Str{std::string value;};struct Floats{std::vector<float> value;};struct Bytes{std::vector<jbyte>value;};
std::vector<std::unique_ptr<Bytes>> outputs;thread_local std::string error;
static const char*JNICALL chars(JNIEnv*,jstring s,jboolean*){return reinterpret_cast<Str*>(s)->value.c_str();}
static void JNICALL release(JNIEnv*,jstring,const char*){}
static jsize JNICALL size(JNIEnv*,jarray a){return reinterpret_cast<Floats*>(a)->value.size();}
static void JNICALL region(JNIEnv*,jfloatArray a,jsize start,jsize n,jfloat*out){auto&v=reinterpret_cast<Floats*>(a)->value;std::copy_n(v.begin()+start,n,out);}
static jboolean JNICALL exception(JNIEnv*){return !error.empty();}
static jclass JNICALL find(JNIEnv*,const char*){return reinterpret_cast<jclass>(1);}
static jint JNICALL failJava(JNIEnv*,jclass,const char*s){error=s;return 0;}
static jbyteArray JNICALL bytes(JNIEnv*,jsize n){auto b=std::make_unique<Bytes>();b->value.resize(n);auto r=reinterpret_cast<jbyteArray>(b.get());outputs.push_back(std::move(b));return r;}
static void JNICALL set(JNIEnv*,jbyteArray a,jsize start,jsize n,const jbyte*in){auto&v=reinterpret_cast<Bytes*>(a)->value;std::copy_n(in,n,v.begin()+start);}
int main(){
 JNINativeInterface_ t{};t.GetStringUTFChars=chars;t.ReleaseStringUTFChars=release;t.GetArrayLength=size;t.GetFloatArrayRegion=region;t.ExceptionCheck=exception;t.FindClass=find;t.ThrowNew=failJava;t.NewByteArray=bytes;t.SetByteArrayRegion=set;JNIEnv_ env{&t};
 Str path{"model"};Floats audio{std::vector<float>(1600,.1f)};
 auto load=[&]{return Java_com_proxyslabs_haruna_speech_WhisperCppNative_load(&env,nullptr,reinterpret_cast<jstring>(&path));};
 auto decode=[&]{return Java_com_proxyslabs_haruna_speech_WhisperCppNative_transcribe(&env,nullptr,1,reinterpret_cast<jfloatArray>(&audio));};
 const auto id=load();assert(id==1&&loads==1);
 for(int i=0;i<2;++i){Java_com_proxyslabs_haruna_speech_WhisperCppNative_resetCancellation(&env,nullptr,id);auto b=decode();assert(b&&reinterpret_cast<Bytes*>(b)->value.size()==4);}
 assert(loads==1&&decodes==2&&frees==0);
 Java_com_proxyslabs_haruna_speech_WhisperCppNative_cancel(&env,nullptr,id);assert(!decode()&&!error.empty()&&decodes==2);error.clear();
 Java_com_proxyslabs_haruna_speech_WhisperCppNative_resetCancellation(&env,nullptr,id);assert(decode());
 entered=false;block=true;
 std::thread active([&]{assert(!decode());assert(!error.empty());});
 while(!entered)std::this_thread::yield();
 Java_com_proxyslabs_haruna_speech_WhisperCppNative_unload(&env,nullptr,id);active.join();assert(frees==1&&sessions.empty());
 Java_com_proxyslabs_haruna_speech_WhisperCppNative_cancel(&env,nullptr,id);Java_com_proxyslabs_haruna_speech_WhisperCppNative_unload(&env,nullptr,id);assert(frees==1);
 path.value="bad";assert(load()==0&&!error.empty());error.clear();path.value="model";const auto second=load();assert(second!=id);Java_com_proxyslabs_haruna_speech_WhisperCppNative_unload(&env,nullptr,second);assert(frees==2);
 std::cout<<"PASS production Whisper JNI: model reuse, isolated cancellation, unload during decode, stale handles, load failure, exact release (fake Whisper)\n";
}
