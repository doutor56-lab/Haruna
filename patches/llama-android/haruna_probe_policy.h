#pragma once
#include <array>
#include <cstdint>
namespace haruna_probe {
// Only a transient 16-ID recurrence window. Never changes generation decisions.
struct Policy {
    std::array<int32_t,16> recent{};
    int count=0, run=0, lag=0, probes=0;
    bool onset=false;
    const char * observe(int32_t id, bool final) {
        run=count && recent[(count-1)%16]==id ? run+1 : 1;
        lag=count>=2 && recent[(count-2)%16]==id ? lag+1 : 0;
        recent[count%16]=id; ++count;
        if (probes>=10) return nullptr;
        if (final) { ++probes; return "final"; }
        if (probes>=9) return nullptr; // reserve one final/EOG sample
        if (count<=3) { ++probes; return "start"; }
        if (!onset && (run>=4 || lag>=4)) { onset=true; ++probes; return "pattern_onset"; }
        if (onset && (count==16 || count==32 || count==64 || count==128 || count==256)) {
            ++probes; return "pattern_checkpoint";
        }
        return nullptr;
    }
};
inline uint64_t mix(uint64_t hash,uint64_t value) {
    for (int i=0;i<8;++i) { hash^=value&255; hash*=1099511628211ULL; value>>=8; }
    return hash;
}
}
