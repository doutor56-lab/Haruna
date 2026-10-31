#include <cstdint>
#include <cstring>
static bool haruna_qwen_2b_threads(const char * arch,uint64_t parameters,int allowed_cpus){
 return std::strcmp(arch,"qwen35")==0&&parameters>=1500000000ULL&&parameters<=2500000000ULL&&allowed_cpus>=6;
}
