#include <cassert>
#include "../patches/llama-android/haruna_thread_policy.h"
int main(){
 assert(haruna_qwen_2b_threads("qwen35",2000000000ULL,8));
 assert(!haruna_qwen_2b_threads("phi3",3800000000ULL,8));
 assert(!haruna_qwen_2b_threads("qwen35",4000000000ULL,8));
 assert(!haruna_qwen_2b_threads("qwen35",800000000ULL,8));
 assert(!haruna_qwen_2b_threads("qwen35",2000000000ULL,4));
}
