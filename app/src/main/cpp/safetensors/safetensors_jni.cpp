#include <jni.h>
#include <stable-diffusion.h>
#define STB_IMAGE_WRITE_IMPLEMENTATION
#include <stb_image_write.h>
#include <atomic>
#include <vector>
#include <algorithm>
#include <cstdio>
#include <cmath>
#include <codecvt>
#include <locale>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <unistd.h>

namespace {
struct Session {
    std::mutex operation, contextAccess;
    bool sdxl=false,lowMemory=false,previewEnabled=false;std::string previewPath;
    sd_ctx_t* ctx=nullptr; // operation owns use; contextAccess protects cancel vs release.
    std::atomic<bool> cancelled{false},closing{false},samplerStarted{false};
    std::atomic<int> phase{0},step{0},total{0};
};
std::mutex registryMutex,engineMutex; // Upstream log/progress callbacks are process-global.
std::unordered_map<jlong,std::shared_ptr<Session>> sessions;
std::atomic<jlong> nextId{0};
thread_local std::string lastError;
std::shared_ptr<Session> find(jlong id){std::lock_guard<std::mutex> l(registryMutex);auto i=sessions.find(id);return i==sessions.end()?nullptr:i->second;}
std::string fromJava(JNIEnv* env,jstring value){if(!value)return {};const auto n=env->GetStringLength(value);const auto* p=env->GetStringChars(value,nullptr);if(!p)throw std::bad_alloc();std::u16string s(reinterpret_cast<const char16_t*>(p),n);env->ReleaseStringChars(value,p);return std::wstring_convert<std::codecvt_utf8_utf16<char16_t>,char16_t>{}.to_bytes(s);}
void cancel(Session& s){s.cancelled=true;std::lock_guard<std::mutex> l(s.contextAccess);if(s.ctx)sd_cancel_generation(s.ctx,SD_CANCEL_ALL);}
// Called by the worker holding operation + engineMutex. Never free through the UI cancel path.
void release(Session& s){sd_ctx_t* p;{std::lock_guard<std::mutex> l(s.contextAccess);p=s.ctx;s.ctx=nullptr;}if(p)free_sd_ctx(p);}
void quiet(sd_log_level_t,const char*,void*){} // Upstream logs can contain prompt/paths.
void progress(int step,int steps,float,void* data){auto& s=*static_cast<Session*>(data);
    // The same upstream callback also reports weight bytes and VAE tiles.
    // Count only the requested sampler run, from its explicit zero boundary.
    if(s.phase.load()<4&&steps==s.total.load()&&steps>0){
        if(step==0){s.samplerStarted=true;s.phase=3;}
        else if(s.samplerStarted&&step>0&&step<=steps){s.step=step;s.phase=step==steps?4:3;}
    }
    if(s.cancelled)cancel(s);
}
void preview(int,int count,sd_image_t* frames,bool,void* data){auto& s=*static_cast<Session*>(data);if(!s.previewEnabled||s.cancelled||s.closing||count<1||!frames||s.previewPath.empty())return;const auto& f=frames[0];if(!f.data||!f.width||!f.height||f.width>16384||f.height>16384||(f.channel!=3&&f.channel!=4))return;
    try{const unsigned side=std::max(f.width,f.height);const int w=std::max(1u,f.width*128u/side),h=std::max(1u,f.height*128u/side);std::vector<unsigned char> rgb(w*h*3);for(int y=0;y<h;y++)for(int x=0;x<w;x++){size_t src=((static_cast<size_t>(y)*f.height/h)*f.width+static_cast<size_t>(x)*f.width/w)*f.channel;for(int c=0;c<3;c++)rgb[(y*w+x)*3+c]=f.data[src+c];}const auto temp=s.previewPath+".part";if(stbi_write_png(temp.c_str(),w,h,3,rgb.data(),w*3))std::rename(temp.c_str(),s.previewPath.c_str());else unlink(temp.c_str());}catch(...){/* Preview is optional; never fail or alter the actual denoising run. */}}
struct CallbackScope {explicit CallbackScope(Session* s){sd_set_log_callback(quiet,nullptr);sd_set_progress_callback(progress,s);sd_set_preview_callback(s->previewEnabled?preview:nullptr,s->previewEnabled?PREVIEW_PROJ:PREVIEW_NONE,std::max(1,s->total.load()/3),true,false,s);}~CallbackScope(){sd_set_preview_callback(nullptr,PREVIEW_NONE,0,false,false,nullptr);sd_set_progress_callback(nullptr,nullptr);}};
}
#define JNI(name) Java_com_proxyslabs_haruna_image_SafetensorsImageNative_##name
extern "C" JNIEXPORT jlong JNICALL JNI(create)(JNIEnv*,jobject){try{auto s=std::make_shared<Session>();const auto id=++nextId;std::lock_guard<std::mutex> l(registryMutex);sessions.emplace(id,s);return id;}catch(...){lastError="Memória insuficiente para criar sessão Stable Diffusion";return 0;}}
extern "C" JNIEXPORT jboolean JNICALL JNI(setPreviewEnabled)(JNIEnv*,jobject,jlong id,jboolean enabled){auto s=find(id);if(!s)return false;std::lock_guard<std::mutex> op(s->operation);if(s->closing||s->cancelled)return false;s->previewEnabled=enabled;return true;}
extern "C" JNIEXPORT jboolean JNICALL JNI(loadSd15)(JNIEnv* env,jobject,jlong id,jstring checkpoint,jboolean sdxl,jboolean lowMemory){auto s=find(id);if(!s){lastError="Sessão inexistente";return false;}std::lock_guard<std::mutex> op(s->operation);std::lock_guard<std::mutex> engine(engineMutex);try{lastError.clear();if(s->closing||s->cancelled){lastError="Carregamento cancelado";return false;}if(s->ctx){lastError="Modelo já carregado";return false;}sd_set_log_callback(quiet,nullptr);s->phase=1;const auto path=fromJava(env,checkpoint);if(path.empty()){lastError="Checkpoint vazio";return false;}sd_ctx_params_t params{};sd_ctx_params_init(&params);params.model_path=path.c_str();params.n_threads=4;params.enable_mmap=true;params.batched_cfg=false;params.backend="cpu";params.params_backend=lowMemory?"disk":"cpu";params.flash_attn=sdxl;params.diffusion_flash_attn=sdxl;
        std::unique_ptr<sd_ctx_t,decltype(&free_sd_ctx)> ctx(new_sd_ctx(&params),free_sd_ctx);
        if(!ctx){lastError="Falha ao carregar Stable Diffusion; confira integridade e memória disponível";return false;}
        const auto* version=sd_get_model_version_name(ctx.get());if(!version||std::string(version)!=(sdxl?"SDXL":"SD 1.x")){lastError="Checkpoint não corresponde à arquitetura selecionada";return false;}
        if(s->closing||s->cancelled){lastError="Carregamento cancelado";return false;}
        {std::lock_guard<std::mutex> l(s->contextAccess);s->ctx=ctx.release();s->sdxl=sdxl;s->lowMemory=lowMemory;}s->phase=2;return true;
    }catch(const std::bad_alloc&){lastError="Memória insuficiente para carregar Stable Diffusion";}catch(...){lastError="Falha nativa ao preparar Stable Diffusion";}release(*s);return false;}
extern "C" JNIEXPORT jboolean JNICALL JNI(generatePng)(JNIEnv* env,jobject,jlong id,jstring prompt,jstring negative,jstring output,jint width,jint height,jint steps,jlong seed,jdouble cfg,jint clipSkip,jstring sampler,jstring scheduler){auto s=find(id);if(!s){lastError="Sessão inexistente";return false;}std::lock_guard<std::mutex> op(s->operation);std::lock_guard<std::mutex> engine(engineMutex);std::string path;try{lastError.clear();if(s->closing||s->cancelled){lastError="Geração cancelada";return false;}if(!s->ctx){lastError="Modelo não carregado";return false;}if(width<256||height<256||width>2048||height>2048||width%(s->sdxl?32:64)||height%(s->sdxl?32:64)||steps<1||steps>100||!std::isfinite(cfg)||cfg<1||cfg>20||clipSkip==0||clipSkip< -1||clipSkip>12||seed< -1||seed>2147483647){lastError="Resolução ou etapas inválidas";return false;}const auto p=fromJava(env,prompt),n=fromJava(env,negative);path=fromJava(env,output);if(p.empty()||p.size()>8000||n.size()>8000||path.empty()){lastError="Descrição ou destino inválido";return false;}sd_img_gen_params_t params{};sd_img_gen_params_init(&params);params.prompt=p.c_str();params.negative_prompt=n.c_str();params.width=width;params.height=height;params.sample_params.sample_steps=steps;params.seed=seed;params.batch_count=1;params.clip_skip=clipSkip;params.sample_params.guidance.txt_cfg=static_cast<float>(cfg);params.vae_tiling_params.enabled=s->sdxl||s->lowMemory;
        const auto method=fromJava(env,sampler),schedule=fromJava(env,scheduler);
        if(method=="euler")params.sample_params.sample_method=EULER_SAMPLE_METHOD;else if(method=="euler_a")params.sample_params.sample_method=EULER_A_SAMPLE_METHOD;else if(method=="dpm++2m")params.sample_params.sample_method=DPMPP2M_SAMPLE_METHOD;else if(method!="default"){lastError="Sampler inválido";return false;}
        if(schedule=="discrete")params.sample_params.scheduler=DISCRETE_SCHEDULER;else if(schedule=="karras")params.sample_params.scheduler=KARRAS_SCHEDULER;else if(schedule!="default"){lastError="Scheduler inválido";return false;}
        s->previewPath=path;const auto suffix=s->previewPath.rfind(".part.png");if(suffix!=std::string::npos)s->previewPath.replace(suffix,9,".preview.png");else s->previewEnabled=false;s->phase=2;s->step=0;s->total=steps;s->samplerStarted=false;CallbackScope callbacks(s.get());
        sd_image_generation_result_t* result=nullptr;struct OutputOwner{sd_image_generation_result_t*& p;~OutputOwner(){if(p)free_sd_image_generation_result(p);}} owner{result};const bool ok=generate_image(s->ctx,&params,&result);
        if(s->closing||s->cancelled){lastError="Geração cancelada";return false;}
        if(!ok||!result||result->count!=1||!result->items){lastError="Falha na geração Stable Diffusion";return false;}const auto& image=result->items[0].image;
        if(!image.data||image.width!=static_cast<uint32_t>(width)||image.height!=static_cast<uint32_t>(height)||(image.channel!=3&&image.channel!=4)){lastError="Imagem nativa inválida";return false;}
        s->phase=5;const bool saved=stbi_write_png(path.c_str(),width,height,image.channel,image.data,width*image.channel)!=0;
        if(!saved||s->cancelled||s->closing){unlink(path.c_str());lastError=s->cancelled?"Geração cancelada":"Falha ao salvar PNG";return false;}return true;
    }catch(const std::bad_alloc&){lastError="Memória insuficiente para gerar Stable Diffusion";}catch(...){lastError="Falha nativa ao gerar Stable Diffusion";}if(!path.empty())unlink(path.c_str());release(*s);return false;}
extern "C" JNIEXPORT void JNICALL JNI(cancel)(JNIEnv*,jobject,jlong id){auto s=find(id);if(s)cancel(*s);}
extern "C" JNIEXPORT void JNICALL JNI(destroy)(JNIEnv*,jobject,jlong id){std::shared_ptr<Session> s;{std::lock_guard<std::mutex> l(registryMutex);auto i=sessions.find(id);if(i==sessions.end())return;s=i->second;s->closing=true;sessions.erase(i);}cancel(*s);std::lock_guard<std::mutex> op(s->operation);std::lock_guard<std::mutex> engine(engineMutex);release(*s);}
extern "C" JNIEXPORT jstring JNICALL JNI(lastError)(JNIEnv* env,jobject){return env->NewStringUTF(("Stable Diffusion CPU: "+lastError).c_str());}
extern "C" JNIEXPORT jintArray JNICALL JNI(progress)(JNIEnv* env,jobject,jlong id){auto s=find(id);jint values[3]={s?s->phase.load():0,s?s->step.load():0,s?s->total.load():0};auto a=env->NewIntArray(3);if(a)env->SetIntArrayRegion(a,0,3,values);return a;}
