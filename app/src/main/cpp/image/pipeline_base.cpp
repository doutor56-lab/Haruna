#include "diffusion/diffusion.hpp"
namespace MNN {namespace DIFFUSION {
Diffusion::Diffusion(std::string path,DiffusionModelType type,MNNForwardType backend,int memory):mModelPath(path),mModelType(type),mMemoryMode(memory),mBackendType(backend){}
Diffusion::~Diffusion(){mModules.clear();runtime_manager_.reset();}
bool Diffusion::runVideo(const std::string&,const std::string&,int,int,int,int,int,float,std::function<void(int)>){return false;}
}}
