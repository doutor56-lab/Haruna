package com.proxyslabs.haruna.speech

import com.k2fsa.sherpa.onnx.GenerationConfig
import com.k2fsa.sherpa.onnx.GeneratedAudio
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsSupertonicModelConfig
import com.proxyslabs.haruna.diagnostics.DiagnosticSession
import java.io.File

interface TtsEngine : AutoCloseable {
    fun load(directory: File): Int
    fun synthesize(text: String, speaker: Int, speed: Float): GeneratedAudio
}

/** Used exclusively on the speech worker. No ONNX pipeline is duplicated here. */
class SupertonicTtsEngine : TtsEngine {
    private var tts: OfflineTts? = null
    override fun load(directory: File): Int {
        if (tts == null) {
            fun path(name: String) = File(directory, name).absolutePath
            tts = OfflineTts(config = OfflineTtsConfig(model = OfflineTtsModelConfig(
                supertonic = OfflineTtsSupertonicModelConfig(
                    durationPredictor = path("duration_predictor.int8.onnx"),
                    textEncoder = path("text_encoder.int8.onnx"),
                    vectorEstimator = path("vector_estimator.int8.onnx"),
                    vocoder = path("vocoder.int8.onnx"), ttsJson = path("tts.json"),
                    unicodeIndexer = path("unicode_indexer.bin"), voiceStyle = path("voice.bin")
                ), numThreads = 2, provider = "cpu", debug = false
            )))
        }
        DiagnosticSession.voiceLoaded("tts", tts != null)
        return requireNotNull(tts).numSpeakers()
    }
    override fun synthesize(text: String, speaker: Int, speed: Float): GeneratedAudio {
        val engine = requireNotNull(tts)
        require(speaker in 0 until engine.numSpeakers()) { "Selecione uma voz disponível" }
        val diagnosticStarted = DiagnosticSession.clock()
        val audio = engine.generateWithConfig(text, GenerationConfig(sid = speaker, speed = speed, numSteps = 5,
            extra = mapOf("lang" to "pt", "max_len" to "240", "silence_duration" to "0.1")))
        DiagnosticSession.voiceOperation("tts", diagnosticStarted)
        return audio
    }
    override fun close() { tts?.free(); tts = null; DiagnosticSession.voiceLoaded("tts", false) }
}

