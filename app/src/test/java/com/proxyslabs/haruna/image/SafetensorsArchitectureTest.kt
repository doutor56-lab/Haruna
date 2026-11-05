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
}
