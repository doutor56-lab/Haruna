#pragma once
struct whisper_context{};
struct whisper_context_params{bool use_gpu=true;};
enum whisper_sampling_strategy{WHISPER_SAMPLING_GREEDY};
struct whisper_full_params {
 int n_threads=0;const char*language=nullptr;bool translate=true,no_context=false,no_timestamps=false;
 bool print_realtime=true,print_progress=true,print_timestamps=true,print_special=true;
 bool(*abort_callback)(void*)=nullptr;void*abort_callback_user_data=nullptr;
};
whisper_context_params whisper_context_default_params();
whisper_context*whisper_init_from_file_with_params(const char*,whisper_context_params);
void whisper_free(whisper_context*);
bool whisper_is_multilingual(whisper_context*);
whisper_full_params whisper_full_default_params(whisper_sampling_strategy);
int whisper_full(whisper_context*,whisper_full_params,const float*,int);
int whisper_full_n_segments(whisper_context*);
const char*whisper_full_get_segment_text(whisper_context*,int);
