// Haruna adapter; LGPL mnn-sd-engine is linked dynamically, never statically here.
#include <jni.h>
#include "mnn_sd/engine.h"
#include "MNN_generated.h"
#include <atomic>
#include <cmath>
#include <memory>
#include <mutex>
#include <unordered_map>
#include <string>
#include <codecvt>
#include <locale>
#include <sys/mman.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
namespace {
using Engine=std::shared_ptr<MnnSdEngine>;
struct State { std::mutex operation; Engine engine; std::atomic<bool> cancelled{false}, loaded{false}; std::atomic<int> phase{0},step{0},total{0}; int boundaries=0; };
std::mutex registryMutex,errorMutex;
std::unordered_map<jlong,std::shared_ptr<State>> registry;
std::atomic<jlong> serial{0};
std::string lastError;
void error(int code){std::lock_guard<std::mutex> l(errorMutex);lastError="Motor Nezumi CPU: erro técnico "+std::to_string(code);}
std::shared_ptr<State> get(jlong id){std::lock_guard<std::mutex> l(registryMutex);auto i=registry.find(id);return i==registry.end()?nullptr:i->second;}
std::string utf8(JNIEnv* e,jstring s){if(!s)return {};auto n=e->GetStringLength(s);auto p=e->GetStringChars(s,nullptr);if(!p)throw std::bad_alloc();std::u16string text(reinterpret_cast<const char16_t*>(p),n);e->ReleaseStringChars(s,p);return std::wstring_convert<std::codecvt_utf8_utf16<char16_t>,char16_t>{}.to_bytes(text);}
void reset(State& s){s.loaded=false;std::atomic_store(&s.engine,Engine{});}
void stop(State& s){s.cancelled=true;auto engine=std::atomic_load(&s.engine);if(engine)mnn_sd_cancel(engine.get());}
void progress(const MnnSdProgress* p,void* ptr){auto& s=*static_cast<State*>(ptr);s.step=p->step;s.total=p->total_steps;if(p->step==0)s.phase=(s.boundaries++==0?2:3);else if(p->step==p->total_steps)s.phase=(s.phase.load()==4?5:4);else s.phase=3;if(s.cancelled){auto engine=std::atomic_load(&s.engine);if(engine)mnn_sd_cancel(engine.get());}}
bool verify(const std::string& path){int fd=open(path.c_str(),O_RDONLY|O_CLOEXEC|O_NOFOLLOW);if(fd<0)return false;struct stat st{};if(fstat(fd,&st)||!S_ISREG(st.st_mode)||st.st_size<8||st.st_size>=2147483647LL){close(fd);return false;}void* p=mmap(nullptr,st.st_size,PROT_READ,MAP_PRIVATE,fd,0);close(fd);if(p==MAP_FAILED)return false;flatbuffers::Verifier v(static_cast<const uint8_t*>(p),st.st_size);bool ok=MNN::VerifyNetBuffer(v);
// Model graphs may use local .weight sidecars, never arbitrary external paths.
if(ok){const auto* net=MNN::GetNet(p);auto safeOps=[](const auto* ops){if(!ops)return false;for(const auto* op:*ops)if(op->externalPath()&&op->externalPath()->size())return false;return true;};ok=safeOps(net->oplists());if(ok&&net->subgraphs())for(const auto* g:*net->subgraphs())if(!safeOps(g->nodes())){ok=false;break;}}
munmap(p,st.st_size);return ok;}
}
#define JNI(name) Java_com_proxyslabs_haruna_image_NezumiImageNative_##name
extern "C" JNIEXPORT jlong JNICALL JNI(create)(JNIEnv*,jobject){try{auto s=std::make_shared<State>();auto id=++serial;std::lock_guard<std::mutex> l(registryMutex);registry[id]=s;return id;}catch(...){error(5);return 0;}}
extern "C" JNIEXPORT void JNICALL JNI(destroy)(JNIEnv*,jobject,jlong id){auto s=get(id);if(!s)return;{std::lock_guard<std::mutex> l(registryMutex);registry.erase(id);}stop(*s);std::lock_guard<std::mutex> l(s->operation);reset(*s);}
extern "C" JNIEXPORT void JNICALL JNI(cancel)(JNIEnv*,jobject,jlong id){auto s=get(id);if(s)stop(*s);}
extern "C" JNIEXPORT void JNICALL JNI(unload)(JNIEnv*,jobject,jlong id){auto s=get(id);if(s){stop(*s);std::lock_guard<std::mutex> l(s->operation);reset(*s);}}
extern "C" JNIEXPORT jboolean JNICALL JNI(isLoaded)(JNIEnv*,jobject,jlong id){auto s=get(id);return s&&s->loaded;}
extern "C" JNIEXPORT jboolean JNICALL JNI(validateFiles)(JNIEnv* e,jobject,jobjectArray paths){try{if(!paths||e->GetArrayLength(paths)!=3)return false;for(int i=0;i<3;i++){auto p=static_cast<jstring>(e->GetObjectArrayElement(paths,i));auto str=utf8(e,p);e->DeleteLocalRef(p);if(!verify(str))return false;}return true;}catch(...){error(2);return false;}}
extern "C" JNIEXPORT jboolean JNICALL JNI(loadCpu)(JNIEnv* e,jobject,jlong id,jstring directory){auto s=get(id);if(!s)return false;std::lock_guard<std::mutex> lock(s->operation);try{reset(*s);if(s->cancelled)return false;Engine engine(mnn_sd_create(),[](MnnSdEngine* p){if(p){mnn_sd_unload(p);mnn_sd_destroy(p);}});if(!engine)throw std::bad_alloc();std::atomic_store(&s->engine,engine);s->phase=1;auto dir=utf8(e,directory);MnnSdLoadOptions options{};options.backend=MNN_SD_BACKEND_CPU;MnnSdErrorInfo info{};auto rc=mnn_sd_load(engine.get(),dir.c_str(),&options,&info);MnnSdCapabilities caps{};if(rc==MNN_SD_OK)rc=mnn_sd_get_capabilities(engine.get(),&caps,&info);if(rc!=MNN_SD_OK||s->cancelled||caps.text_embedding_size!=768||caps.default_side_px!=512||caps.supports_opencl){error(rc?rc:2);reset(*s);return false;}s->loaded=mnn_sd_is_loaded(engine.get())!=0;s->phase=2;return s->loaded;}catch(const std::bad_alloc&){error(5);}catch(...){error(8);}reset(*s);return false;}
extern "C" JNIEXPORT jbyteArray JNICALL JNI(generateRgb)(JNIEnv* e,jobject,jlong id,jstring prompt,jstring negative,jint steps,jlong seed,jfloat cfg,jstring sampler,jstring scheduler){auto s=get(id);if(!s)return nullptr;std::lock_guard<std::mutex> lock(s->operation);MnnSdImage image{};struct Free {MnnSdImage* p;~Free(){mnn_sd_free_image(p);}} free{&image};try{auto engine=std::atomic_load(&s->engine);if(!engine||!s->loaded||s->cancelled||steps<1||steps>50||!std::isfinite(cfg)||cfg<1||cfg>20||seed< -1||seed>2147483647)return nullptr;auto text=utf8(e,prompt),neg=utf8(e,negative);if(text.empty()||text.size()>8000||neg.size()>8000)return nullptr;MnnSdGenerateParams p{};p.prompt=text.c_str();p.negative_prompt=neg.c_str();p.width=p.height=512;p.steps=steps;p.cfg_scale=cfg;p.seed=seed;auto method=utf8(e,sampler),schedule=utf8(e,scheduler);
if(method=="euler"&&schedule!="karras")p.scheduler=MNN_SD_SCHEDULER_EULER;
else if(method=="euler_a"&&schedule!="karras")p.scheduler=MNN_SD_SCHEDULER_EULER_A;
else if(method=="dpm++2m"||method=="default")p.scheduler=schedule=="karras"?MNN_SD_SCHEDULER_DPM_PP_2M_KARRAS:MNN_SD_SCHEDULER_DPM_PP_2M;
else{error(2);return nullptr;}
if(schedule!="default"&&schedule!="discrete"&&schedule!="karras"){error(2);return nullptr;}p.use_opencl=0;s->boundaries=0;MnnSdErrorInfo info{};auto rc=mnn_sd_generate(engine.get(),&p,progress,s.get(),&image,&info);if(rc!=MNN_SD_OK||s->cancelled){error(s->cancelled?7:rc);reset(*s);return nullptr;}if(image.width!=512||image.height!=512||image.channels!=3||image.data_size!=512*512*3||!image.data){error(8);reset(*s);return nullptr;}auto bytes=e->NewByteArray(image.data_size);if(!bytes)return nullptr;e->SetByteArrayRegion(bytes,0,image.data_size,reinterpret_cast<const jbyte*>(image.data));s->phase=5;return bytes;}catch(const std::bad_alloc&){error(5);}catch(...){error(8);}reset(*s);return nullptr;}
extern "C" JNIEXPORT jintArray JNICALL JNI(progress)(JNIEnv* e,jobject,jlong id){auto s=get(id);jint values[3]={s?s->phase.load():0,s?s->step.load():0,s?s->total.load():0};auto a=e->NewIntArray(3);if(a)e->SetIntArrayRegion(a,0,3,values);return a;}
extern "C" JNIEXPORT jstring JNICALL JNI(lastError)(JNIEnv* e,jobject){std::lock_guard<std::mutex> l(errorMutex);return e->NewStringUTF(lastError.c_str());}
