package com.proxyslabs.haruna.image

import org.junit.Assert.assertEquals
import org.junit.Test

class SafetensorsArchitectureTest {
    @Test fun recognizesSd15LikeNames() {
        assertEquals(SafetensorsArchitecture.Hint.SD15_LIKE,
            SafetensorsArchitecture.detect(sequenceOf(
                "model.diffusion_model.input_blocks.0.0.weight",
                "cond_stage_model.transformer.text_model.embeddings.token_embedding.weight"
            )))
    }

    @Test fun prioritizesSdxlSecondTextEncoder() {
        assertEquals(SafetensorsArchitecture.Hint.SDXL_LIKE,
            SafetensorsArchitecture.detect(sequenceOf(
                "model.diffusion_model.input_blocks.0.0.weight",
                "conditioner.embedders.1.model.transformer.resblocks.0.attn.in_proj_weight"
            )))
    }

    @Test fun doesNotGuessFromUnrelatedNames() {
        assertEquals(SafetensorsArchitecture.Hint.UNKNOWN,
            SafetensorsArchitecture.detect(sequenceOf("some.weight", "vae.decoder.weight")))
    }
    @Test fun recognizesCompleteSdxlShapeSignature(){
        val tensors=mapOf(
            "conditioner.embedders.0.transformer.text_model.embeddings.token_embedding.weight" to SafetensorsArchitecture.Tensor("F16",listOf(49408,768).map{it.toLong()}),
            "conditioner.embedders.1.model.token_embedding.weight" to SafetensorsArchitecture.Tensor("BF16",listOf(49408,1280).map{it.toLong()}),
            "model.diffusion_model.input_blocks.0.0.weight" to SafetensorsArchitecture.Tensor("F16",listOf(320,4,3,3).map{it.toLong()}),
            "model.diffusion_model.middle_block.1.transformer_blocks.0.attn2.to_k.weight" to SafetensorsArchitecture.Tensor("F16",listOf(1280L,2048L)),
            "first_stage_model.decoder.conv_out.weight" to SafetensorsArchitecture.Tensor("F16",listOf(3,128,3,3).map{it.toLong()}))
        org.junit.Assert.assertTrue(SafetensorsArchitecture.supportsSdxl(tensors))
        org.junit.Assert.assertFalse(SafetensorsArchitecture.supportsSdxl(tensors.filterKeys{!it.startsWith("conditioner.embedders.1.")}))
        org.junit.Assert.assertFalse(SafetensorsArchitecture.supportsCheckpoint(tensors))
    }
}
