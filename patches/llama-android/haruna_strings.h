// Lossless UTF-16 / standard UTF-8 transport. JNI NewStringUTF expects Modified UTF-8,
// which cannot be used for the model's arbitrary UTF-8 bytes (notably supplementary characters).
#include <stdexcept>
static std::string hs_from_java(JNIEnv * env,jstring input) {
    if (!input) throw std::runtime_error("Missing UTF-16 input");
    const jsize n=env->GetStringLength(input);
    const jchar * chars=env->GetStringChars(input,nullptr);
    if (!chars) throw std::runtime_error("Cannot read UTF-16 input");
    std::string out;
    try {
        for (jsize i=0;i<n;++i) {
            uint32_t cp=chars[i];
            if (cp>=0xd800 && cp<=0xdbff) {
                if (i+1>=n || chars[i+1]<0xdc00 || chars[i+1]>0xdfff) throw std::runtime_error("Invalid UTF-16 input");
                cp=0x10000+((cp-0xd800)<<10)+(chars[++i]-0xdc00);
            } else if (cp>=0xdc00 && cp<=0xdfff) throw std::runtime_error("Invalid UTF-16 input");
            if (cp<0x80) out+=static_cast<char>(cp);
            else if (cp<0x800) { out+=static_cast<char>(0xc0|(cp>>6)); out+=static_cast<char>(0x80|(cp&63)); }
            else if (cp<0x10000) { out+=static_cast<char>(0xe0|(cp>>12)); out+=static_cast<char>(0x80|((cp>>6)&63)); out+=static_cast<char>(0x80|(cp&63)); }
            else { out+=static_cast<char>(0xf0|(cp>>18)); out+=static_cast<char>(0x80|((cp>>12)&63)); out+=static_cast<char>(0x80|((cp>>6)&63)); out+=static_cast<char>(0x80|(cp&63)); }
        }
    } catch (...) { env->ReleaseStringChars(input,chars); throw; }
    env->ReleaseStringChars(input,chars); return out;
}
// 0 complete, 1 incomplete token boundary, 2 malformed. Never reads past size().
static int hs_utf8(const std::string & s,std::vector<jchar> * out=nullptr) {
    for (size_t i=0;i<s.size();) {
        const uint8_t first=static_cast<uint8_t>(s[i]);
        const size_t count=first<0x80?1:first>=0xc2&&first<=0xdf?2:first>=0xe0&&first<=0xef?3:first>=0xf0&&first<=0xf4?4:0;
        if (!count) return 2;
        uint32_t cp=first & (count==1?0x7f:count==2?0x1f:count==3?0x0f:0x07);
        for (size_t j=1;j<count;++j) {
            if (i+j>=s.size()) return 1;
            const uint8_t next=static_cast<uint8_t>(s[i+j]); if ((next&0xc0)!=0x80) return 2;
            cp=(cp<<6)|(next&63);
        }
        if ((count==2&&cp<0x80)||(count==3&&cp<0x800)||(count==4&&cp<0x10000)||cp>0x10ffff||(cp>=0xd800&&cp<=0xdfff)) return 2;
        if (out) {
            if (cp<0x10000) out->push_back(static_cast<jchar>(cp));
            else { cp-=0x10000; out->push_back(static_cast<jchar>(0xd800+(cp>>10))); out->push_back(static_cast<jchar>(0xdc00+(cp&1023))); }
        }
        i+=count;
    }
    return 0;
}
static jstring hs_to_java(JNIEnv * env,const std::string & s) {
    std::vector<jchar> out;
    if (hs_utf8(s,&out)!=0) throw std::runtime_error("Invalid UTF-8 output");
    const jchar empty=0;
    return env->NewString(out.empty()?&empty:out.data(),static_cast<jsize>(out.size()));
}
