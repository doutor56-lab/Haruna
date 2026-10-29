// Included AFTER the real load/prepare/structured-chat/generate/finish/unload JNI definitions.
extern "C" JNIEXPORT jstring JNICALL
Java_com_arm_aichat_internal_InferenceEngineImpl_diagnostic45Native(JNIEnv * env,jobject self,jstring model,jstring directory,jintArray probes) {
#if !HARUNA_DIAGNOSTIC_45
    return env->NewStringUTF("{\"ok\":false,\"error\":\"HARUNA_DIAGNOSTIC_45 disabled\"}");
#else
    if(hs_ticket.load()!=0 || g_model || g_context || d45_capture)
        return env->NewStringUTF("{\"ok\":false,\"error\":\"Fresh instrumentation process required\"}");
    const bool old_seed=hd_fixed_seed,old_fa=hd_fa_off;
    constexpr int64_t ticket=4500000001LL;
    bool armed=false;
    const char * phase="prepare_capture";
    HarunaJson result={{"ok",false},{"schema",45}};
    try {
        const auto dir=hs_from_java(env,directory);
        D45Capture capture(dir);d45_capture=&capture;
        try {
            const auto size=env->GetArrayLength(probes);if(size>2)throw std::runtime_error("At most two logit vectors");
            jint indices[2]={};env->GetIntArrayRegion(probes,0,size,indices);
            for(int i=0;i<size;++i){if(indices[i]<1 || indices[i]>512)throw std::runtime_error("Invalid probe index");capture.captures.insert(indices[i]);}
            phase="load_prepare";hd_fixed_seed=true;hd_fa_off=false;
            if(Java_com_arm_aichat_internal_InferenceEngineImpl_load(env,self,model)!=0 ||
               Java_com_arm_aichat_internal_InferenceEngineImpl_prepare(env,self)!=0)
                throw std::runtime_error("Diagnostic model preparation failed");
            auto reg=ggml_backend_reg_by_name("CPU");
            auto features=reinterpret_cast<ggml_backend_get_features_t>(ggml_backend_reg_get_proc_address(reg,"ggml_backend_get_features"));
            HarunaJson flags=HarunaJson::object();
            if(features)for(auto * f=features(reg);f && f->name;++f)flags[hm_identifier(f->name)]=hm_identifier(f->value);
            if(HARUNA_DIAGNOSTIC_45==2 && (flags.value("KLEIDIAI",std::string("0"))=="1" || flags.value("REPACK",std::string("0"))=="1"))
                throw std::runtime_error("Conservative build contains prohibited backend features");
            if(Java_com_arm_aichat_internal_InferenceEngineImpl_reserveGeneration(env,self,ticket)!=0)
                throw std::runtime_error("Diagnostic generation busy");
            armed=true;
            auto cls=env->FindClass("java/lang/String");
            auto roles=env->NewObjectArray(2,cls,nullptr),contents=env->NewObjectArray(2,cls,nullptr);
            auto role0=hs_to_java(env,"system"),role1=hs_to_java(env,"user");
            auto content0=hs_to_java(env,d45_system),content1=hs_to_java(env,d45_prompt),key=hs_to_java(env,"diagnostic45-canonical");
            env->SetObjectArrayElement(roles,0,role0);env->SetObjectArrayElement(roles,1,role1);
            env->SetObjectArrayElement(contents,0,content0);env->SetObjectArrayElement(contents,1,content1);
            phase="canonical_prefill";
            const int prepared=Java_com_arm_aichat_internal_InferenceEngineImpl_processChatMessages(env,self,roles,contents,512,true,key,0);
            env->DeleteLocalRef(roles);env->DeleteLocalRef(contents);env->DeleteLocalRef(cls);
            env->DeleteLocalRef(role0);env->DeleteLocalRef(role1);env->DeleteLocalRef(content0);env->DeleteLocalRef(content1);env->DeleteLocalRef(key);
            if(prepared!=0)throw std::runtime_error("Canonical prefill failed");
            auto snapshot=Java_com_arm_aichat_internal_InferenceEngineImpl_runtimeMetrics(env,self);
            auto metadata=HarunaJson::parse(hs_from_java(env,snapshot));env->DeleteLocalRef(snapshot);
            metadata["title"]="HARUNA 4.5 DIAGNOSTIC";
            metadata["testMode"]=HARUNA_DIAGNOSTIC_45==1?"A_CURRENT":"B_CONSERVATIVE";
            metadata["kernelsAfterPrefill"]=capture.kernels();
            metadata["cpuFeaturesCompiled"]=flags;metadata["seed"]=424242;
            metadata["logitsEncoding"]="float32-le";
            metadata["initialKVEmpty"]=true;metadata["maxTokens"]=512;
            if(metadata["prefix"].value("reusedTokens",int64_t(-1))!=0)throw std::runtime_error("Unexpected prefix reuse");
            capture.json("metadata.json",metadata);
            phase="generation";
            for(int i=0;i<513;++i){
                auto text=Java_com_arm_aichat_internal_InferenceEngineImpl_generateNextToken(env,self);
                if(!text)break;
                env->DeleteLocalRef(text);
                if(env->ExceptionCheck())throw std::runtime_error("JNI exception in canonical generation");
            }
            phase="finalization";
            const int stop=hm_reason.load();
            if(Java_com_arm_aichat_internal_InferenceEngineImpl_finishGeneration(env,self,ticket)!=0)throw std::runtime_error("Diagnostic finalization failed");
            armed=false;
            capture.tokens.close();if(!capture.tokens)throw std::runtime_error("Diagnostic stream finalization failed");
            auto final=Java_com_arm_aichat_internal_InferenceEngineImpl_runtimeMetrics(env,self);
            result={{"ok",stop==1 || stop==2},{"schema",45},{"stopCode",stop},{"chosenTokens",capture.step},
                {"kernels",capture.kernels()},{"metrics",HarunaJson::parse(hs_from_java(env,final))}};
            env->DeleteLocalRef(final);capture.json("result.json",result);
        } catch (...) { d45_capture=nullptr;throw; }
        d45_capture=nullptr;
    } catch (...) {
        if(env->ExceptionCheck())env->ExceptionClear();
        result={{"ok",false},{"schema",45},{"phase",phase},{"stopCode",hm_reason.load()},{"error","Diagnostic failed; partial files are not valid evidence"}};
    }
    d45_capture=nullptr;
    if(armed) { hm_finish(4);Java_com_arm_aichat_internal_InferenceEngineImpl_finishGeneration(env,self,ticket); }
    haruna_release_resources();
    hd_fixed_seed=old_seed;hd_fa_off=old_fa;hd_sampler_fixed=false;
    return hs_to_java(env,result.dump());
#endif
}
