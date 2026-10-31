// Process-local, one-shot explicit DEBUG reload request. Default and next normal load = CPU.
static std::atomic<int> ha_pending{0},ha_loaded_request{0};
static std::atomic<bool> ha_available{false};
static void ha_refresh(){bool available=false;for(size_t i=0;i<ggml_backend_dev_count();i++){auto d=ggml_backend_dev_get(i);auto reg=ggml_backend_dev_backend_reg(d);if(ggml_backend_dev_type(d)==GGML_BACKEND_DEVICE_TYPE_GPU&&std::string(ggml_backend_reg_name(reg))=="Vulkan")available=true;}ha_available=available;}
static HarunaJson ha_snapshot(){return {{"vulkanAvailable",ha_available.load()},{"pendingLayers",ha_pending.load()},{"loadedRequestedLayers",ha_loaded_request.load()},{"requiresModelReload",true},{"normalDefaultLayers",0}};}
extern "C" JNIEXPORT jint JNICALL Java_com_arm_aichat_internal_InferenceEngineImpl_setOffloadLayers(JNIEnv*,jobject,jint layers){if(hs_ticket.load()!=0||g_model||g_context)return 1;if(layers<0||layers>99)return 2;ha_refresh();if(layers>0&&!ha_available.load())return 3;ha_pending=layers;return 0;}
