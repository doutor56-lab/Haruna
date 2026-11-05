#include <jni.h>
#include <MNN/Interpreter.hpp>
#include <MNN/Tensor.hpp>
#include "MNN_generated.h"
#include <flatbuffers/flatbuffers.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <memory>
#include <mutex>
#include <array>
#include <vector>
#include <string>
static std::mutex lock;
#include "tokenizer.hpp"
#include "diffusion/stable_diffusion.hpp"
#include <MNN/expr/ExecutorScope.hpp>
#include <atomic>
#include <stdexcept>
static std::unique_ptr<MNN::DIFFUSION::StableDiffusion> pipeline;
static std::atomic<long long> ticket{0},cancelled{-1};
static std::atomic<int> progressPhase{0},progressDone{0},progressTotal{1};
void image_checkpoint(int phase,int done,int total){if(ticket.load()>0&&cancelled.load()==ticket.load())throw std::runtime_error("cancelled");progressPhase=phase;progressDone=done;progressTotal=total;}
static void clear_pipeline() noexcept {pipeline.reset();try{MNN::Express::ExecutorScope::Current()->gc(MNN::Express::Executor::FULL);}catch(...){/* Unused allocator cache collection is best effort; model ownership has ended. */}}
static size_t elements(MNN::Tensor * tensor){size_t n=1;for(int d:tensor->shape()){if(d<=0||d>1000000||n>1000000000ULL/static_cast<size_t>(d))return 0;n*=d;}return n;}
static const char * names[]={"text_encoder.mnn","unet.mnn","vae_decoder.mnn"};
struct Utf {JNIEnv * e;jstring s;const char * p;Utf(JNIEnv*e,jstring s):e(e),s(s),p(s?e->GetStringUTFChars(s,nullptr):nullptr){}~Utf(){if(p)e->ReleaseStringUTFChars(s,p);}};
static bool verify(const std::string & path){int fd=open(path.c_str(),O_RDONLY|O_CLOEXEC);if(fd<0)return false;struct stat st{};if(fstat(fd,&st)||st.st_size<8||st.st_size>=2147483647LL){close(fd);return false;}void * data=mmap(nullptr,st.st_size,PROT_READ,MAP_PRIVATE,fd,0);close(fd);if(data==MAP_FAILED)return false;flatbuffers::Verifier verifier(static_cast<const uint8_t*>(data),st.st_size);bool ok=MNN::VerifyNetBuffer(verifier);
if(ok){const auto*net=MNN::GetNet(data);if(!net->oplists())ok=false;else for(const auto*op:*net->oplists())switch(op->type()){case MNN::OpType_FmhaV2:case MNN::OpType_Fmhca:case MNN::OpType_GroupNorm:case MNN::OpType_SplitGeLU:ok=false;break;default:break;}}
munmap(data,st.st_size);return ok;}
extern "C" JNIEXPORT jboolean JNICALL Java_com_proxyslabs_haruna_image_ImageNative_validate(JNIEnv*env,jobject,jstring path){Utf p(env,path);if(!p.p)return false;try{for(auto n:names)if(!verify(std::string(p.p)+"/"+n))return false;return true;}catch(...){return false;}}
extern "C" JNIEXPORT void JNICALL Java_com_proxyslabs_haruna_image_ImageNative_unload(JNIEnv*,jobject){std::lock_guard<std::mutex> guard(lock);clear_pipeline();}
extern "C" JNIEXPORT jboolean JNICALL Java_com_proxyslabs_haruna_image_ImageNative_load(JNIEnv*env,jobject,jstring path){std::lock_guard<std::mutex> guard(lock);clear_pipeline();Utf p(env,path);if(!p.p)return false;try{for(auto n:names)if(!verify(std::string(p.p)+"/"+n))return false;pipeline.reset(new MNN::DIFFUSION::StableDiffusion(p.p,MNN::DIFFUSION::STABLE_DIFFUSION_1_5,MNN_FORWARD_CPU,0));if(!pipeline->load()){clear_pipeline();return false;}return true;}catch(...){clear_pipeline();return false;}}
extern "C" JNIEXPORT jboolean JNICALL Java_com_proxyslabs_haruna_image_ImageNative_reserve(JNIEnv*,jobject,jlong id){long long idle=0;if(id<=0)return false;return ticket.compare_exchange_strong(idle,id);}
extern "C" JNIEXPORT void JNICALL Java_com_proxyslabs_haruna_image_ImageNative_finish(JNIEnv*,jobject,jlong id){long long expected=id;ticket.compare_exchange_strong(expected,0);}
extern "C" JNIEXPORT void JNICALL Java_com_proxyslabs_haruna_image_ImageNative_cancelNative(JNIEnv*,jobject,jlong id){if(ticket.load()==id&&id>0)cancelled=id;}
extern "C" JNIEXPORT jintArray JNICALL Java_com_proxyslabs_haruna_image_ImageNative_progress(JNIEnv*env,jobject){jint v[]={progressPhase.load(),progressDone.load(),progressTotal.load()};auto a=env->NewIntArray(3);if(a)env->SetIntArrayRegion(a,0,3,v);return a;}
extern "C" JNIEXPORT jboolean JNICALL Java_com_proxyslabs_haruna_image_ImageNative_generate(JNIEnv*env,jobject,jlong id,jstring path,jstring prompt,jstring output,jint steps,jint memory){std::lock_guard<std::mutex> guard(lock);Utf p(env,path),text(env,prompt),out(env,output);if(!p.p||!text.p||!out.p||ticket.load()!=id||steps<1||steps>50||memory<0||memory>2)return false;try{clear_pipeline();image_checkpoint(1,0,1);pipeline.reset(new MNN::DIFFUSION::StableDiffusion(p.p,MNN::DIFFUSION::STABLE_DIFFUSION_1_5,MNN_FORWARD_CPU,memory));if(!pipeline->load())throw std::runtime_error("load failed");image_checkpoint(1,1,1);bool result=pipeline->run(text.p,out.p,steps,-1,{});clear_pipeline();return result;}catch(...){clear_pipeline();unlink(out.p);return false;}}
