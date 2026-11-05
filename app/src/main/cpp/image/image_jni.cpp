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
static std::array<std::unique_ptr<MNN::Interpreter>,3> models;
static const char * names[]={"text_encoder.mnn","unet.mnn","vae_decoder.mnn"};
struct Utf {JNIEnv * e;jstring s;const char * p;Utf(JNIEnv*e,jstring s):e(e),s(s),p(s?e->GetStringUTFChars(s,nullptr):nullptr){}~Utf(){if(p)e->ReleaseStringUTFChars(s,p);}};
static bool verify(const std::string & path){int fd=open(path.c_str(),O_RDONLY|O_CLOEXEC);if(fd<0)return false;struct stat st{};if(fstat(fd,&st)||st.st_size<8||st.st_size>=2147483647LL){close(fd);return false;}void * data=mmap(nullptr,st.st_size,PROT_READ,MAP_PRIVATE,fd,0);close(fd);if(data==MAP_FAILED)return false;flatbuffers::Verifier verifier(static_cast<const uint8_t*>(data),st.st_size);bool ok=MNN::VerifyNetBuffer(verifier);munmap(data,st.st_size);return ok;}
extern "C" JNIEXPORT jboolean JNICALL Java_com_proxyslabs_haruna_image_ImageNative_validate(JNIEnv*env,jobject,jstring path){Utf p(env,path);if(!p.p)return false;try{for(auto n:names)if(!verify(std::string(p.p)+"/"+n))return false;return true;}catch(...){return false;}}
extern "C" JNIEXPORT void JNICALL Java_com_proxyslabs_haruna_image_ImageNative_unload(JNIEnv*,jobject){std::lock_guard<std::mutex> guard(lock);for(auto &m:models)m.reset();}
extern "C" JNIEXPORT jboolean JNICALL Java_com_proxyslabs_haruna_image_ImageNative_load(JNIEnv*env,jobject,jstring path){
 std::lock_guard<std::mutex> guard(lock);for(auto&m:models)m.reset();Utf p(env,path);if(!p.p)return false;
 try{std::array<std::unique_ptr<MNN::Interpreter>,3> next;
 const std::array<std::vector<std::string>,3> inputs={std::vector<std::string>{"input_ids"},{"sample","timestep","encoder_hidden_states"},{"latent_sample"}};
 const char *outputs[]={"last_hidden_state","out_sample","sample"};
 for(int i=0;i<3;i++){auto file=std::string(p.p)+"/"+names[i];if(!verify(file))return false;next[i].reset(MNN::Interpreter::createFromFile(file.c_str()));if(!next[i])return false;auto weights=file+".weight";if(access(weights.c_str(),R_OK)==0)next[i]->setExternalFile(weights.c_str());
 MNN::ScheduleConfig cfg;cfg.type=MNN_FORWARD_CPU;cfg.numThread=2;auto session=next[i]->createSession(cfg);if(!session)return false;
 for(const auto& name:inputs[i])if(!next[i]->getSessionInput(session,name.c_str()))return false;
 if(!next[i]->getSessionOutput(session,outputs[i]))return false;
 if(i==0&&next[i]->getSessionInput(session,"input_ids")->elementSize()!=154)return false;
 if(i==1&&(next[i]->getSessionInput(session,"sample")->elementSize()!=32768||next[i]->getSessionInput(session,"encoder_hidden_states")->elementSize()!=118272))return false;
 if(i==2&&next[i]->getSessionInput(session,"latent_sample")->elementSize()!=16384)return false;
 }
 models=std::move(next);return true;
 }catch(...){for(auto&m:models)m.reset();return false;}
}
