#pragma once
#include <cstdarg>
#define ANDROID_LOG_UNKNOWN 0
#define ANDROID_LOG_DEFAULT 1
#define ANDROID_LOG_VERBOSE 2
#define ANDROID_LOG_DEBUG 3
#define ANDROID_LOG_INFO 4
#define ANDROID_LOG_WARN 5
#define ANDROID_LOG_ERROR 6
#define ANDROID_LOG_FATAL 7
#define ANDROID_LOG_SILENT 8
extern "C" int __android_log_print(int,const char*,const char*,...);
extern "C" int __android_log_vprint(int,const char*,const char*,va_list);
extern "C" int __android_log_is_loggable(int,const char*,int);
extern "C" int __android_log_write(int,const char*,const char*);
