package com.proxyslabs.haruna.image
object ImageNative {
    val available=runCatching{System.loadLibrary("haruna_image");true}.getOrDefault(false)
    external fun validate(path:String):Boolean
    external fun load(path:String):Boolean
    external fun unload()
}
