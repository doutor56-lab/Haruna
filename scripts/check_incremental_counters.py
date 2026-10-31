from pathlib import Path
import subprocess
h=Path('patches/llama-android/haruna_op_profile.h').read_text();start=h.index('static void hp_begin(');end=h.index('\nstatic void hp_end',start);body=h[start:end]
stub='''#include <array>
#include <mutex>
#include <atomic>
#include <cassert>
std::mutex hp_lock;std::atomic<bool>hp_enabled{false};std::array<int,2>hp_times{},hp_counts{},hp_gpu_times{},hp_categories{};int hp_traits[3]{};int resets=0;void hp_cpu(bool){++resets;}
'''
main='''
int main(){hp_begin(true);
#if HARUNA_DIAGNOSTIC_45
assert(!hp_enabled&&resets==0);hp_begin(false);assert(resets==0);
#else
assert(hp_enabled&&resets==2);hp_begin(false);assert(!hp_enabled&&resets==3);
#endif
}
'''
p=Path('/tmp/haruna-inc-counter-test.cpp');p.write_text(stub+body+main)
for flag in [0,1,2,3,4,5,6]:
 exe='/tmp/haruna-inc-counter-'+str(flag);subprocess.run(['g++','-std=c++17','-DHARUNA_DIAGNOSTIC_45='+str(flag),str(p),'-o',exe],check=True);subprocess.run([exe],check=True)
print('PASS actual hp_begin body in OFF/A/B/C/D/E: canonical diagnostic owns counters; ordinary profile resets remain operational.')
