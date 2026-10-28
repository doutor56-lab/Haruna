// Focused production policy check. No model, RNG, network, inference or benchmark.
#include "../patches/llama-android/haruna_probe_policy.h"
#include <cassert>
#include <cstring>
#include <cstdio>
int main(){
    haruna_probe::Policy p;
    assert(!std::strcmp(p.observe(1,false),"start"));
    assert(!std::strcmp(p.observe(2,false),"start"));
    assert(!std::strcmp(p.observe(1,false),"start"));
    assert(p.observe(2,false)==nullptr);
    assert(p.observe(1,false)==nullptr);
    assert(!std::strcmp(p.observe(2,false),"pattern_onset"));
    for(int i=6;i<1023;++i) p.observe(i%2?2:1,false);
    assert(p.probes<=9);assert(!std::strcmp(p.observe(0,true),"final"));assert(p.probes<=10);
    for(int i=0;i<100;++i)p.observe(0,true);
    assert(p.probes==10);
    p={};assert(p.count==0&&p.probes==0&&!p.onset);
    for(int i=0;i<20;++i)p.observe(7,false);
    assert(p.run==20&&p.onset);
    assert(haruna_probe::mix(1,2)==haruna_probe::mix(1,2));
    assert(haruna_probe::mix(1,2)!=haruna_probe::mix(1,3));
    std::puts("PASS: bounded recurrence probes, final slot, reset and fingerprints; no generation decisions changed.");
}
