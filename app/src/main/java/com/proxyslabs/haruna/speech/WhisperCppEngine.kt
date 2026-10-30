package com.proxyslabs.haruna.speech

import java.io.File
import com.proxyslabs.haruna.diagnostics.DiagnosticSession

/** Independent STT library. Never links to or reconfigures the LLM's llama/ggml libraries. */
object WhisperCppNative {
    init { System.loadLibrary("haruna_whisper_stt") }
    external fun transcribe(path: String, samples: FloatArray, onLoaded: Runnable): ByteArray
}

class WhisperCppEngine(private val changed: () -> Unit) : SttEngine {
    @Volatile private var resident = false
    override fun loaded() = resident
    override fun transcribe(directory: File, samples: FloatArray, model: WhisperModels.Model): String {
        val started = DiagnosticSession.clock()
        try {
            SttDiagnostics.model(model.title + " · whisper.cpp")
            return WhisperCppNative.transcribe(File(directory, "model.bin").absolutePath, samples, Runnable {
                resident = true; DiagnosticSession.voiceLoaded("stt", true); changed()
            }).toString(Charsets.UTF_8).trim()
        } finally {
            resident = false; DiagnosticSession.voiceLoaded("stt", false); changed()
            SttDiagnostics.decoded((DiagnosticSession.clock() - started) / 1e6)
            DiagnosticSession.voiceOperation("stt", started)
        }
    }
}
