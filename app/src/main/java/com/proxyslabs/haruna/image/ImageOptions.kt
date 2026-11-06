package com.proxyslabs.haruna.image

import org.json.JSONObject

/** Image-engine options only; never changes the LLM sampler or context. */
internal data class ImageOptions(
    val width:Int,val height:Int,val steps:Int,val cfg:Double,val clipSkip:Int,
    val sampler:String,val scheduler:String,val seed:Long,val negativePrompt:String,
    val lowMemory:Boolean,val legacySide:Int=0,val nativeGrid:Int=32
) {
    fun json()=JSONObject().put("width",width).put("height",height).put("steps",steps).put("cfg",cfg)
        .put("clipSkip",clipSkip).put("sampler",sampler).put("scheduler",scheduler).put("seed",seed)
        .put("negativePrompt",negativePrompt).put("lowMemory",lowMemory).put("legacySide",legacySide).put("nativeGrid",nativeGrid)
    fun nativeWidth(sf:Boolean)=if(sf)if(legacySide>0)legacySide else maxOf(512,(width+nativeGrid-1)/nativeGrid*nativeGrid) else 512
    fun nativeHeight(sf:Boolean)=if(sf)if(legacySide>0)legacySide else maxOf(512,(height+nativeGrid-1)/nativeGrid*nativeGrid) else 512
    fun updated(p:JSONObject,engine:String):ImageOptions {
        fun int(k:String,d:Int):Int {if(!p.has(k))return d;val n=p.getDouble(k);require(n.isFinite()&&n==n.toInt().toDouble()){ "Valor inteiro inválido: $k" };return n.toInt()}
        val w=int("width",if(p.has("resolution"))int("resolution",width) else width)
        val h=int("height",if(p.has("resolution"))int("resolution",height) else height)
        val c=copy(width=w,height=h,steps=int("steps",steps),cfg=if(p.has("cfg"))p.getDouble("cfg")else cfg,clipSkip=int("clipSkip",clipSkip),
            sampler=p.optString("sampler",sampler),scheduler=p.optString("scheduler",scheduler),
            seed=if(p.has("seed")){val n=p.getDouble("seed");require(n.isFinite()&&n==n.toLong().toDouble()){ "Seed inválida" };n.toLong()}else seed,
            negativePrompt=p.optString("negativePrompt",negativePrompt),lowMemory=if(p.has("lowMemory"))p.getBoolean("lowMemory")else lowMemory,
            legacySide=if(((p.has("width")||p.has("height"))&&(w!=width||h!=height))||(p.has("resolution")&&(w>legacySide||h>legacySide)))0 else legacySide)
        require(c.width in 256..2048&&c.height in 256..2048&&c.width%8==0&&c.height%8==0&&c.width*c.height<=4194304){"Dimensões: múltiplos de 8 entre 256 e 2048"}
        require(c.steps in 1..(if(engine=="safetensors")100 else 50)&&c.cfg.isFinite()&&c.cfg in 1.0..20.0&&c.seed in -1L..2147483647L){"Etapas, CFG ou seed inválidos"}
        require(c.clipSkip in -1..12&&c.clipSkip!=0&&c.negativePrompt.length<=2000){"Clip skip ou descrição negativa inválidos"}
        require(c.sampler in setOf("default","euler","euler_a","dpm++2m")&&c.scheduler in setOf("default","discrete","karras")){"Sampler ou scheduler incompatível"}
        if(engine!="safetensors")require(c.width<=512&&c.height<=512&&!c.lowMemory&&c.clipSkip==-1){"Este pacote MNN calcula em 512 × 512; saída menor usa corte/redução"}
        if(engine=="mnn")require(c.negativePrompt.isEmpty()&&c.sampler=="default"&&c.scheduler=="default"){"O motor MNN Haruna usa sampler próprio e não suporta descrição negativa"}
        if(engine=="nezumi")require(c.scheduler!="karras"||c.sampler=="dpm++2m"){"Nezumi: Karras exige DPM++ 2M"}
        return c
    }
}
