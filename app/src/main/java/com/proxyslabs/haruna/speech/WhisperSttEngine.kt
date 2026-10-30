package com.proxyslabs.haruna.speech

import com.k2fsa.sherpa.onnx.FeatureConfig
import com.k2fsa.sherpa.onnx.OfflineModelConfig
import com.k2fsa.sherpa.onnx.OfflineRecognizer
import com.k2fsa.sherpa.onnx.OfflineRecognizerConfig
import com.k2fsa.sherpa.onnx.OfflineWhisperModelConfig
import com.proxyslabs.haruna.diagnostics.DiagnosticSession
import java.io.File

interface SttEngine {
    fun transcribe(directory: File, samples: FloatArray, model: WhisperModels.Model): String
    fun loaded(): Boolean = false
}

/** A fresh, short-lived recognizer keeps STT weights out of the LLM/TTS response phase. */
class WhisperSttEngine(private val changed: () -> Unit = {}) : SttEngine {
    @Volatile private var resident = false
    override fun loaded() = resident
    override fun transcribe(directory: File, samples: FloatArray, model: WhisperModels.Model): String {
        SttDiagnostics.model(model.title + " multilíngue INT8")
        val diagnosticStarted = DiagnosticSession.clock()
        fun path(name: String) = File(directory, name).absolutePath
        val recognizer = OfflineRecognizer(config = OfflineRecognizerConfig(
            featConfig = FeatureConfig(sampleRate = 16000, featureDim = 80),
            modelConfig = OfflineModelConfig(whisper = OfflineWhisperModelConfig(
                encoder = path(model.files[0]), decoder = path(model.files[1]),
                language = SttDiagnostics.LANGUAGE, task = "transcribe", tailPaddings = 300
            ), tokens = path(model.files[2]), modelType = "whisper", numThreads = 2, provider = "cpu", debug = false),
            decodingMethod = "greedy_search"
        ))
        resident = true
        DiagnosticSession.voiceLoaded("stt", true)
        changed()
        try {
            val stream = recognizer.createStream()
            try {
                stream.acceptWaveform(samples, SttAudioRecorder.RATE)
                val decodeStarted = DiagnosticSession.clock()
                try { recognizer.decode(stream) }
                finally { SttDiagnostics.decoded((DiagnosticSession.clock() - decodeStarted) / 1e6) }
                return recognizer.getResult(stream).text.trim()
            }
            finally { stream.release() }
        } finally {
            recognizer.release()
            resident = false
            DiagnosticSession.voiceLoaded("stt", false)
            changed()
            DiagnosticSession.voiceOperation("stt", diagnosticStarted)
        }
    }
}


