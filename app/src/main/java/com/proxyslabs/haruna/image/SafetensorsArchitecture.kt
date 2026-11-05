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
}
