package com.proxyslabs.haruna.speech

import com.k2fsa.sherpa.onnx.FeatureConfig
import com.k2fsa.sherpa.onnx.OfflineModelConfig
import com.k2fsa.sherpa.onnx.OfflineRecognizer
import com.k2fsa.sherpa.onnx.OfflineRecognizerConfig
import com.k2fsa.sherpa.onnx.OfflineWhisperModelConfig
import java.io.File

interface SttEngine { fun transcribe(directory: File, samples: FloatArray): String }

/** A fresh, short-lived recognizer keeps STT weights out of the LLM/TTS response phase. */
class WhisperSttEngine : SttEngine {
    override fun transcribe(directory: File, samples: FloatArray): String {
        fun path(name: String) = File(directory, name).absolutePath
        val recognizer = OfflineRecognizer(config = OfflineRecognizerConfig(
            featConfig = FeatureConfig(sampleRate = 16000, featureDim = 80),
            modelConfig = OfflineModelConfig(whisper = OfflineWhisperModelConfig(
                encoder = path("tiny-encoder.int8.onnx"), decoder = path("tiny-decoder.int8.onnx"),
                language = "pt", task = "transcribe"
            ), tokens = path("tiny-tokens.txt"), modelType = "whisper", numThreads = 2, provider = "cpu", debug = false)
        ))
        try {
            val stream = recognizer.createStream()
            try { stream.acceptWaveform(samples, 16000); recognizer.decode(stream); return recognizer.getResult(stream).text.trim() }
            finally { stream.release() }
        } finally { recognizer.release() }
    }
}
