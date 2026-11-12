package android.app
class ActivityManager {
 class MemoryInfo {var availMem=3L*1024*1024*1024;var lowMemory=false}
 fun getMemoryInfo(info:MemoryInfo){info.availMem=available;info.lowMemory=low}
 companion object{@Volatile var available=3L*1024*1024*1024;@Volatile var low=false}
}
