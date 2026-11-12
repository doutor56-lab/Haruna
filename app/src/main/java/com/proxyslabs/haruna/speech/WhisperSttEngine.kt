package com.proxyslabs.haruna.speech

import com.k2fsa.sherpa.onnx.FeatureConfig
import com.k2fsa.sherpa.onnx.OfflineModelConfig
import com.k2fsa.sherpa.onnx.OfflineRecognizer
import com.k2fsa.sherpa.onnx.OfflineRecognizerConfig
import com.k2fsa.sherpa.onnx.OfflineWhisperModelConfig
import com.proxyslabs.haruna.diagnostics.DiagnosticSession
import java.io.File

interface SttEngine : AutoCloseable {
    fun prepare(directory: File, model: WhisperModels.Model)
    fun cancel() {}
    override fun close()
    fun transcribe(directory: File, samples: FloatArray, model: WhisperModels.Model): String
    fun loaded(): Boolean = false
}

/** Sessions are owned exclusively by the model worker; streams remain per utterance. */
class WhisperSttEngine(private val changed: () -> Unit = {}) : SttEngine {
    @Volatile private var resident = false
    override fun loaded() = resident
    private var recognizer: OfflineRecognizer? = null
    private var installedPath: String? = null
    override fun prepare(directory: File, model: WhisperModels.Model) {
        val started = DiagnosticSession.clock()
        val reused = recognizer != null && installedPath == directory.absolutePath
        if (reused) { SttDiagnostics.prepared("sherpa-onnx OfflineRecognizer", true, (DiagnosticSession.clock()-started)/1e6); return }
        close()
        SttDiagnostics.model(model.title + " multilíngue INT8")

        fun path(name: String) = File(directory, name).absolutePath
        recognizer = OfflineRecognizer(config = OfflineRecognizerConfig(
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
        installedPath = directory.absolutePath
        SttDiagnostics.prepared("sherpa-onnx OfflineRecognizer", false, (DiagnosticSession.clock()-started)/1e6)
    }
    override fun transcribe(directory: File, samples: FloatArray, model: WhisperModels.Model): String {
        val engine = requireNotNull(recognizer) { "Prepare o Whisper antes de transcrever" }
        check(installedPath == directory.absolutePath) { "Modelo STT alterado" }
        val diagnosticStarted = DiagnosticSession.clock()
        val stream = engine.createStream()
        try {
            stream.acceptWaveform(samples, SttAudioRecorder.RATE)
            val decodeStarted = DiagnosticSession.clock()
            try { engine.decode(stream) }
            finally { SttDiagnostics.decoded((DiagnosticSession.clock()-decodeStarted)/1e6) }
            return engine.getResult(stream).text.trim()
        } finally { stream.release(); DiagnosticSession.voiceOperation("stt", diagnosticStarted) }
    }
    override fun close() {
        val old = recognizer; recognizer = null; installedPath = null; resident = false
        if (old != null) { old.release(); DiagnosticSession.voiceLoaded("stt", false); changed() }
    }
}
