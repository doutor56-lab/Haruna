package com.proxyslabs.haruna.image
import java.io.File
fun main(args:Array<String>){
    val root=File(args[0]);check(SdcppPackage.verify(root).getString("architecture")=="flux1-schnell")
    check(ImageGguf.tensors(File(root,"diffusion.gguf")).getValue("img_in.weight").shape==listOf(3072L,64L))
    val target=File(root.parentFile,"component-install-check").apply{mkdirs()}
    try{File(root.path+".zip").inputStream().use{input->
        val installed=NezumiPackage.install(input,target,{false},{Long.MAX_VALUE},{})
        check(ImagePackage.verify(installed).getString("format")==SdcppPackage.format)
        val missing=File(installed,"ae.safetensors");check(missing.delete());check(runCatching{SdcppPackage.verify(installed)}.isFailure)
    }}finally{target.deleteRecursively()}
    val wrong=File(root,"clip_l.safetensors");check(runCatching{ImageGguf.tensors(wrong)}.isFailure)
    println("PASS Android FLUX structural import, safe ZIP dispatch, GGUF shapes, integrity and missing-component rejection; NO inference or trained weights")
}
