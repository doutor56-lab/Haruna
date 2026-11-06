package com.proxyslabs.haruna.image

/**
 * Advisory checkpoint-family detection from tensor names only.
 * A hint is not proof that the model can run on the installed native backend.
 */
object SafetensorsArchitecture {
    enum class Hint { SD15_LIKE, SDXL_LIKE, UNKNOWN }

    fun detect(tensorNames: Sequence<String>): Hint {
        var diffusion = false
        var textEncoder = false
        var sdxlEncoder = false
        for (name in tensorNames) {
            if (name.startsWith("model.diffusion_model.")) diffusion = true
            if (name.startsWith("cond_stage_model.") || name.startsWith("text_encoder.")) {
                textEncoder = true
            }
            if (name.startsWith("conditioner.embedders.1.") ||
                name.startsWith("text_encoder_2.")) {
                sdxlEncoder = true
            }
        }
        return when {
            sdxlEncoder -> Hint.SDXL_LIKE
            diffusion && textEncoder -> Hint.SD15_LIKE
            else -> Hint.UNKNOWN
        }
    }
    data class Tensor(val dtype:String,val shape:List<Long>)
    // CompVis monolithic SD1.5 txt2img. SD2 (1024), SDXL, inpaint (9 channels),
    // LoRA and split Diffusers components are not complete SD1.5 checkpoints.
    private val required=mapOf(
        "model.diffusion_model.input_blocks.0.0.weight" to listOf(320L,4L,3L,3L),
        "model.diffusion_model.input_blocks.1.1.transformer_blocks.0.attn2.to_k.weight" to listOf(320L,768L),
        "cond_stage_model.transformer.text_model.embeddings.token_embedding.weight" to listOf(49408L,768L),
        "cond_stage_model.transformer.text_model.embeddings.position_embedding.weight" to listOf(77L,768L),
        "first_stage_model.decoder.conv_out.weight" to listOf(3L,128L,3L,3L),
        "first_stage_model.post_quant_conv.weight" to listOf(4L,4L,1L,1L)
    )
    fun supportsCheckpoint(tensors:Map<String,Tensor>):Boolean =
        detect(tensors.keys.asSequence())==Hint.SD15_LIKE && required.all{(name,shape)->
            tensors[name]?.let{it.shape==shape&&it.dtype in setOf("F16","F32")}==true
        }
    fun supportsSdxl(tensors:Map<String,Tensor>):Boolean {
        fun shape(name:String,expected:List<Long>)=tensors[name]?.let{it.shape==expected&&it.dtype in setOf("F16","BF16","F32")}==true
        val l=tensors.entries.any{it.key.startsWith("conditioner.embedders.0.")&&it.key.endsWith("token_embedding.weight")&&it.value.shape==listOf(49408L,768L)&&it.value.dtype in setOf("F16","BF16","F32")}
        val g=tensors.entries.any{it.key.startsWith("conditioner.embedders.1.")&&it.key.endsWith("token_embedding.weight")&&it.value.shape==listOf(49408L,1280L)&&it.value.dtype in setOf("F16","BF16","F32")}
        return l&&g&&tensors.any{(n,t)->n.endsWith("attn2.to_k.weight")&&t.shape.size==2&&t.shape[1]==2048L}&&shape("model.diffusion_model.input_blocks.0.0.weight",listOf(320L,4L,3L,3L))&&shape("first_stage_model.decoder.conv_out.weight",listOf(3L,128L,3L,3L))&&tensors.keys.none{it.contains("lora_up")||it.contains("lora_down")}
    }
}
