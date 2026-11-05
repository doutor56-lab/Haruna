package com.proxyslabs.haruna.image
object ImageNative {
    val available=runCatching{System.loadLibrary("haruna_image");true}.getOrDefault(false)
    external fun validate(path:String):Boolean
    external fun load(path:String):Boolean
    external fun unload()
    external fun reserve(id:Long):Boolean
    external fun finish(id:Long)
    external fun cancelNative(id:Long)
    external fun progress():IntArray
    external fun generate(id:Long,path:String,prompt:String,output:String,steps:Int,memory:Int):Boolean
}
