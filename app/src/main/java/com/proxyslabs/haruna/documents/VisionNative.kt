package com.proxyslabs.haruna.documents
/** Uses libmtmd and libllama from the existing pinned Android runtime. */
internal object VisionNative {
    val available by lazy {runCatching{System.loadLibrary("ai-chat");error();true}.getOrDefault(false)}
    external fun analyze(ticket:Long,model:String,projector:String,rgb:ByteArray,width:Int,height:Int,question:String):ByteArray?
    external fun cancel(ticket:Long)
    external fun error():Int
    external fun phase():Int
    external fun stopReason():Int
}
