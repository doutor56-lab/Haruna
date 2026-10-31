#pragma once
#include <algorithm>
#include <array>
#include <cstdint>
#include <string>
#include <vector>
namespace haruna_incremental {
struct Owner {
 std::string conversation;int64_t revision=0;uint64_t model=0;const void *context=nullptr,*chat_template=nullptr;bool thinking=false;int threads=0,threads_batch=0;
 bool engine(const Owner &b)const{return context==b.context&&model==b.model&&chat_template==b.chat_template&&thinking==b.thinking&&threads==b.threads&&threads_batch==b.threads_batch;}
 bool same(const Owner &b)const{return engine(b)&&conversation==b.conversation&&revision==b.revision;}
};
template<class Token> struct Session {
 struct Snapshot {Owner owner;std::vector<Token> tokens;std::vector<uint8_t> state;};
 struct Plan {size_t reused=0,common=0;bool direct=false,restored=false,reset=false;int checkpoint=-1;std::string reason="cold";};
 static constexpr size_t budget=128ULL*1024*1024;
 Owner owner;std::vector<Token> tokens;bool valid=false;std::array<Snapshot,2> saved;
 size_t bytes()const{return saved[0].state.size()+saved[1].state.size();}
 static size_t common(const std::vector<Token>&a,const std::vector<Token>&b){size_t n=0;while(n<std::min(a.size(),b.size())&&a[n]==b[n])++n;return n;}
 void current_clear(){tokens.clear();valid=false;}
 void clear(bool keep_system=false){current_clear();saved[1]={};if(!keep_system)saved[0]={};}
 template<class Restore,class Clear>
 Plan plan(const Owner&next,const std::vector<Token>&input,int64_t frontier,bool force_cold,Restore restore,Clear clear_memory){
  Plan p;p.common=common(tokens,input);
  const bool identity=owner.same(next)&&!next.conversation.empty();
  if(!force_cold&&valid&&identity&&frontier==static_cast<int64_t>(tokens.size())-1&&tokens.size()<input.size()&&p.common==tokens.size()){
   p.reused=tokens.size();p.direct=true;p.reason="exact_append";return p;
  }
  p.reason=force_cold?"explicit_cold":!owner.engine(next)?"model_context_or_template":!identity?"conversation_or_revision":frontier!=static_cast<int64_t>(tokens.size())-1?"frontier_mismatch":"template_or_history_changed";
  if(!owner.engine(next)){saved[0]={};saved[1]={};}else if(!owner.same(next))saved[1]={};
  int chosen=-1;
  if(!force_cold)for(int i=0;i<2;i++){const auto&s=saved[i];if(s.state.empty()||!s.owner.engine(next)||(i==1&&(!s.owner.same(next)||next.conversation.empty()))||s.tokens.empty()||s.tokens.size()>=input.size()||common(s.tokens,input)!=s.tokens.size())continue;if(chosen<0||s.tokens.size()>saved[chosen].tokens.size())chosen=i;}
  clear_memory();p.reset=true;current_clear();owner=next;
  if(chosen>=0){auto&s=saved[chosen];if(restore(s.state,s.tokens.size())){tokens=s.tokens;valid=true;p.reused=tokens.size();p.restored=true;p.checkpoint=chosen;p.reason=chosen==0?"complete_system_restore":"complete_turn_restore";}else{saved[chosen]={};clear_memory();p.reason="restore_rejected";}}
  return p;
 }
 template<class It> bool append(size_t start,It first,It last,int64_t frontier){if(start!=tokens.size()){current_clear();return false;}tokens.insert(tokens.end(),first,last);valid=frontier==static_cast<int64_t>(tokens.size())-1;if(!valid)current_clear();return valid;}
 template<class Size,class Write>
 bool capture(int slot,size_t boundary,int64_t frontier,Size size,Write write){
  if(slot<0||slot>1||!valid||tokens.size()!=boundary||frontier!=static_cast<int64_t>(boundary)-1)return false;
  const size_t n=size();if(!n||n>budget)return false;
  saved[slot]={};if(slot==1&&n>budget-bytes())saved[0]={};if(n>budget-bytes())return false;
  Snapshot value;value.owner=owner;value.tokens=tokens;value.state.resize(n);
  if(write(value.state)!=n)return false;
  saved[slot]=std::move(value);return true;
 }
};
}
