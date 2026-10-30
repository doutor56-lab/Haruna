#include <jni.h>
#include <algorithm>
#include <whisper.h>
#include <memory>
#include <string>
#include <vector>
#include <stdexcept>

extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_proxyslabs_haruna_speech_WhisperCppNative_transcribe(JNIEnv *env, jobject, jstring path, jfloatArray audio, jobject onLoaded) {
    try {
        const int n = env->GetArrayLength(audio);
        if (n <= 0 || n > 16000 * 21) throw std::runtime_error("Trecho de áudio inválido.");
        const char *chars = env->GetStringUTFChars(path, nullptr);
        if (!chars) return nullptr;
        std::string filename(chars); env->ReleaseStringUTFChars(path, chars);
        auto config = whisper_context_default_params();
        config.use_gpu = false;
        std::unique_ptr<whisper_context, decltype(&whisper_free)> ctx(
            whisper_init_from_file_with_params(filename.c_str(), config), whisper_free);
        if (!ctx || !whisper_is_multilingual(ctx.get())) throw std::runtime_error("O modelo parece estar incompleto ou incompatível.");
        std::vector<float> samples(n);
        env->GetFloatArrayRegion(audio, 0, n, samples.data());
        if (env->ExceptionCheck()) return nullptr;
        auto callbackClass = env->GetObjectClass(onLoaded);
        if (!callbackClass) return nullptr;
        auto run = env->GetMethodID(callbackClass, "run", "()V");
        env->DeleteLocalRef(callbackClass);
        if (!run || env->ExceptionCheck()) return nullptr;
        env->CallVoidMethod(onLoaded, run);
        if (env->ExceptionCheck()) return nullptr;
        auto params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
        params.n_threads = 2; params.language = "pt"; params.translate = false;
        params.no_context = true; params.no_timestamps = true;
        params.print_realtime = false; params.print_progress = false;
        params.print_timestamps = false; params.print_special = false;
        const int result = whisper_full(ctx.get(), params, samples.data(), n);
        std::fill(samples.begin(), samples.end(), 0.f);
        if (result != 0) throw std::runtime_error("Não foi possível transcrever este áudio localmente.");
        std::string text;
        for (int i = 0; i < whisper_full_n_segments(ctx.get()); ++i) text += whisper_full_get_segment_text(ctx.get(), i);
        auto output = env->NewByteArray(static_cast<jsize>(text.size()));
        if (output) env->SetByteArrayRegion(output, 0, static_cast<jsize>(text.size()), reinterpret_cast<const jbyte *>(text.data()));
        return output;
    } catch (const std::exception &error) {
        env->ThrowNew(env->FindClass("java/lang/IllegalStateException"), error.what());
        return nullptr;
    }
}
