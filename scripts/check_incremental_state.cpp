#include "../patches/llama-android/haruna_incremental_state.h"
#include <cassert>
#include <iostream>
using S=haruna_incremental::Session<int>;
int main(){
 S s;haruna_incremental::Owner a{"chat-a",1,1,(void*)1,(void*)2,false};int clears=0;int64_t pos=-1;
 auto clear=[&]{++clears;pos=-1;};auto restore=[&](auto&v,size_t n){pos=n-1;return !v.empty();};
 std::vector<int> prompt{1,2,3,4};auto p=s.plan(a,prompt,pos,false,restore,clear);assert(p.reused==0&&clears==1);
 pos=1;assert(s.append(0,prompt.begin(),prompt.begin()+2,pos));assert(s.capture(0,2,pos,[]{return size_t(8);},[](auto&v){return v.size();}));
 pos=3;assert(s.append(2,prompt.begin()+2,prompt.end(),pos));assert(s.capture(1,4,pos,[]{return size_t(8);},[](auto&v){return v.size();}));
 std::vector<int> next{1,2,3,4,5};p=s.plan(a,next,pos,false,restore,clear);assert(p.direct&&p.reused==4&&clears==1);
 pos=4;assert(s.append(4,next.begin()+4,next.end(),pos));
 std::vector<int> changed{1,2,3,4,9,7};p=s.plan(a,changed,pos,false,restore,clear);assert(p.restored&&p.checkpoint==1&&p.reused==4&&!p.direct);
 auto b=a;b.conversation="chat-b";p=s.plan(b,changed,pos,false,restore,clear);assert(p.restored&&p.checkpoint==0&&p.reused==2);
 p=s.plan(b,changed,pos,true,restore,clear);assert(p.reused==0&&!p.restored);
 s.clear(true);assert(s.saved[0].state.size()==8&&s.saved[1].state.empty()&&!s.valid);
 auto altered=b;altered.context=(void*)3;p=s.plan(altered,changed,pos,false,restore,clear);assert(p.reused==0&&s.bytes()==0);
 s.clear();assert(s.bytes()==0);
 std::cout<<"PASS incremental ledger: exact append, full turn/system restores, changed tokens, chat/context isolation, forced cold and cleanup.\n";
}
