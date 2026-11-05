#include <jni.h>
#include <stable-diffusion.h>
#define STB_IMAGE_WRITE_IMPLEMENTATION
#include <stb_image_write.h>
#include <atomic>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>

namespace {
struct Session {
    std::mutex operation;
    std::atomic<sd_ctx_t*> ctx{nullptr};
    ~Session() { if (auto* p = ctx.exchange(nullptr)) free_sd_ctx(p); }
};
std::mutex registryMutex;
std::unordered_map<jlong, std::shared_ptr<Session>> sessions;
std::atomic<jlong> nextId{1};
thread_local std::string lastError;

std::shared_ptr<Session> find(jlong id) {
    std::lock_guard<std::mutex> guard(registryMutex);
    auto it = sessions.find(id);
    return it == sessions.end() ? nullptr : it->second;
}
std::string fromJava(JNIEnv* env, jstring value) {
    if (!value) return {};
    const char* chars = env->GetStringUTFChars(value, nullptr);
    if (!chars) return {};
    std::string out(chars);
    env->ReleaseStringUTFChars(value, chars);
    return out;
}
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_proxyslabs_haruna_image_SafetensorsImageNative_create(JNIEnv*, jobject) {
    const jlong id = nextId.fetch_add(1);
    std::lock_guard<std::mutex> guard(registryMutex);
    sessions.emplace(id, std::make_shared<Session>());
    return id;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_proxyslabs_haruna_image_SafetensorsImageNative_loadSd15(
    JNIEnv* env, jobject, jlong id, jstring checkpoint) {
    auto session = find(id);
    if (!session) { lastError = "Sessão inexistente"; return JNI_FALSE; }
    const std::string path = fromJava(env, checkpoint);
    if (path.empty()) { lastError = "Caminho do modelo vazio"; return JNI_FALSE; }
    std::lock_guard<std::mutex> guard(session->operation);
    if (session->ctx.load()) { lastError = "Modelo já carregado"; return JNI_FALSE; }
    sd_ctx_params_t params{};
    sd_ctx_params_init(&params);
    params.model_path = path.c_str();
    params.n_threads = 4;
    params.enable_mmap = true;
    sd_ctx_t* ctx = new_sd_ctx(&params);
    if (!ctx) { lastError = "Falha ao carregar checkpoint"; return JNI_FALSE; }
    const std::string version = sd_get_model_version_name(ctx);
    if (version.find("1.") == std::string::npos && version.find("SD1") == std::string::npos) {
        free_sd_ctx(ctx);
        lastError = "Checkpoint não identificado como SD 1.x";
        return JNI_FALSE;
    }
    session->ctx.store(ctx);
    return JNI_TRUE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_proxyslabs_haruna_image_SafetensorsImageNative_generatePng(
    JNIEnv* env, jobject, jlong id, jstring prompt, jstring negative, jstring output,
    jint width, jint height, jint steps, jlong seed) {
    auto session = find(id);
    if (!session) { lastError = "Sessão inexistente"; return JNI_FALSE; }
    if (width < 256 || height < 256 || width > 768 || height > 768 ||
        width % 64 || height % 64 || steps < 1 || steps > 50) {
        lastError = "Dimensões ou passos inválidos";
        return JNI_FALSE;
    }
    const std::string p = fromJava(env, prompt);
    const std::string n = fromJava(env, negative);
    const std::string path = fromJava(env, output);
    if (p.empty() || path.empty()) { lastError = "Prompt ou destino vazio"; return JNI_FALSE; }
    std::lock_guard<std::mutex> guard(session->operation);
    sd_ctx_t* ctx = session->ctx.load();
    if (!ctx) { lastError = "Modelo não carregado"; return JNI_FALSE; }
    sd_img_gen_params_t params{};
    sd_img_gen_params_init(&params);
    params.prompt = p.c_str();
    params.negative_prompt = n.c_str();
    params.width = width;
    params.height = height;
    params.sample_params.sample_steps = steps;
    params.seed = seed;
    params.batch_count = 1;
    sd_image_generation_result_t* result = nullptr;
    const bool ok = generate_image(ctx, &params, &result);
    bool saved = false;
    if (ok && result && result->count > 0) {
        const auto& img = result->items[0].image;
        if (img.data && img.width == static_cast<uint32_t>(width) &&
            img.height == static_cast<uint32_t>(height) &&
            (img.channel == 3 || img.channel == 4)) {
            saved = stbi_write_png(path.c_str(), width, height,
                static_cast<int>(img.channel), img.data, width * img.channel) != 0;
        }
    }
    if (result) free_sd_image_generation_result(result);
    if (!saved) lastError = "Falha ao gerar ou salvar PNG";
    return saved ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT void JNICALL
Java_com_proxyslabs_haruna_image_SafetensorsImageNative_cancel(
    JNIEnv*, jobject, jlong id) {
    auto session = find(id);
    if (session) {
        if (auto* ctx = session->ctx.load()) sd_cancel_generation(ctx, SD_CANCEL_ALL);
    }
}

extern "C" JNIEXPORT void JNICALL
Java_com_proxyslabs_haruna_image_SafetensorsImageNative_destroy(
    JNIEnv*, jobject, jlong id) {
    std::shared_ptr<Session> session;
    {
        std::lock_guard<std::mutex> guard(registryMutex);
        auto it = sessions.find(id);
        if (it == sessions.end()) return;
        session = it->second;
        sessions.erase(it);
    }
    std::lock_guard<std::mutex> guard(session->operation);
    if (auto* ctx = session->ctx.exchange(nullptr)) free_sd_ctx(ctx);
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_proxyslabs_haruna_image_SafetensorsImageNative_lastError(
    JNIEnv* env, jobject) {
    return env->NewStringUTF(lastError.c_str());
}
