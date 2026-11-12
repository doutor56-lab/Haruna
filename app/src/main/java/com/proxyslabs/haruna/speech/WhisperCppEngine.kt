package com.proxyslabs.haruna.speech

import java.io.File
import com.proxyslabs.haruna.diagnostics.DiagnosticSession

/** Independent STT library; model access is serialized by the STT model worker. */
object WhisperCppNative {
    init { System.loadLibrary("haruna_whisper_stt") }
    external fun load(path: String): Long
    external fun resetCancellation(handle: Long)
    external fun transcribe(handle: Long, samples: FloatArray): ByteArray
    external fun cancel(handle: Long)
    external fun unload(handle: Long)
}
class WhisperCppEngine(private val changed: () -> Unit) : SttEngine {
    @Volatile private var handle = 0L
    private var installedPath: String? = null
    override fun loaded() = handle != 0L
    override fun prepare(directory: File, model: WhisperModels.Model) {
        val started = DiagnosticSession.clock()
        SttDiagnostics.model(model.title + " · whisper.cpp")
        val path = File(directory, "model.bin").absolutePath
        val reused = handle != 0L && installedPath == path
        if (!reused) {
            close()
            handle = WhisperCppNative.load(path)
            check(handle != 0L) { "O Whisper não confirmou o carregamento" }
            installedPath = path
            DiagnosticSession.voiceLoaded("stt", true); changed()
        }
        WhisperCppNative.resetCancellation(handle)
        SttDiagnostics.prepared("whisper.cpp", reused, (DiagnosticSession.clock() - started) / 1e6)
    }
    override fun transcribe(directory: File, samples: FloatArray, model: WhisperModels.Model): String {
        check(handle != 0L && installedPath == File(directory, "model.bin").absolutePath) { "Prepare o Whisper antes de transcrever" }
        val started = DiagnosticSession.clock()
        try { return WhisperCppNative.transcribe(handle, samples).toString(Charsets.UTF_8).trim() }
        finally {
            SttDiagnostics.decoded((DiagnosticSession.clock() - started) / 1e6)
            DiagnosticSession.voiceOperation("stt", started)
        }
    }
    override fun cancel() { val h = handle; if (h != 0L) WhisperCppNative.cancel(h) }
    override fun close() {
        val h = handle; handle = 0; installedPath = null
        if (h != 0L) { WhisperCppNative.unload(h); DiagnosticSession.voiceLoaded("stt", false); changed() }
    }
}
