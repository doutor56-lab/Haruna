package com.proxyslabs.haruna.speech

import android.content.Context
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import com.k2fsa.sherpa.onnx.SileroVadModelConfig
import com.k2fsa.sherpa.onnx.Vad
import com.k2fsa.sherpa.onnx.VadModelConfig
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.sqrt

/** Bounded PCM capture with neural endpointing. No audio is saved to disk. */
class SttAudioRecorder(private val context: Context) {
    companion object {
        const val RATE = 16000
        const val MAX_SECONDS = 20
        private const val WINDOW = 512
        private const val NO_SPEECH_SECONDS = 10
    }

    @Volatile private var recorder: AudioRecord? = null
    private val finishRequested = AtomicBoolean(false)

    fun prepare() { finishRequested.set(false) }
    fun finish() { finishRequested.set(true); runCatching { recorder?.stop() } }
    fun cancel() = finish()

    private fun createVad(): Vad = Vad(
        assetManager = context.assets,
        config = VadModelConfig(
            sileroVadModelConfig = SileroVadModelConfig(
                model = "silero_vad.onnx",
                threshold = 0.5F,
                minSilenceDuration = 0.45F,
                minSpeechDuration = 0.10F,
                windowSize = WINDOW,
                maxSpeechDuration = MAX_SECONDS.toFloat(),
            ),
            sampleRate = RATE,
            numThreads = 1,
            provider = "cpu",
            debug = false,
        ),
    )

    fun capture(
        alive: () -> Boolean,
        started: () -> Unit,
        level: (Double) -> Unit,
        automaticPause: Boolean = true,
    ): FloatArray {
        if (!alive() || finishRequested.get()) return FloatArray(0)
        val minBuffer = AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        require(minBuffer > 0) { "Microfone não suporta captura em 16 kHz" }
        val audio = AudioRecord.Builder().setAudioSource(MediaRecorder.AudioSource.VOICE_RECOGNITION)
            .setAudioFormat(AudioFormat.Builder().setSampleRate(RATE).setChannelMask(AudioFormat.CHANNEL_IN_MONO).setEncoding(AudioFormat.ENCODING_PCM_16BIT).build())
            .setBufferSizeInBytes(maxOf(minBuffer * 2, 8192)).build()
        val samples = FloatArray(RATE * MAX_SECONDS)
        val frame = ShortArray(WINDOW)
        var used = 0
        var speechSeen = false
        var lastLevel = 0L
        val vad = createVad()
        try {
            require(audio.state == AudioRecord.STATE_INITIALIZED) { "Não foi possível inicializar o microfone" }
            require(audio.sampleRate == RATE && audio.channelCount == 1 && audio.audioFormat == AudioFormat.ENCODING_PCM_16BIT) {
                "Formato do microfone incompatível: esperado PCM16 mono a 16 kHz"
            }
            SttDiagnostics.captureRate(audio.sampleRate)
            recorder = audio
            if (!alive() || finishRequested.get()) return FloatArray(0)
            audio.startRecording()
            require(audio.recordingState == AudioRecord.RECORDSTATE_RECORDING) { "Não foi possível iniciar o microfone" }
            started()
            while (alive() && !finishRequested.get() && used < samples.size) {
                val count = audio.read(frame, 0, minOf(frame.size, samples.size - used), AudioRecord.READ_BLOCKING)
                if (count <= 0) {
                    if (!alive() || finishRequested.get()) break
                    throw IllegalStateException("Falha na captura do microfone ($count)")
                }
                var squares = 0.0
                val vadFrame = FloatArray(count)
                for (i in 0 until count) {
                    val v = frame[i].toDouble()
                    squares += v * v
                    val normalized = (v / 32768.0).toFloat()
                    samples[used + i] = normalized
                    vadFrame[i] = normalized
                }
                used += count
                vad.acceptWaveform(vadFrame)
                if (vad.isSpeechDetected()) speechSeen = true

                val rms = sqrt(squares / count)
                val now = android.os.SystemClock.elapsedRealtime()
                if (now - lastLevel >= 160) {
                    lastLevel = now
                    level((rms / 5000.0).coerceIn(0.0, 1.0))
                }

                // Silero owns endpointing. A completed segment means speech followed by
                // the configured neural silence interval; no fixed 1.6 s RMS timer remains.
                if (!vad.empty()) {
                    speechSeen = true
                    if (automaticPause) break
                    while (!vad.empty()) vad.pop()
                }
                if (!speechSeen && used >= RATE * NO_SPEECH_SECONDS) break
            }

            // Manual finish or the hard capture limit may arrive before Silero emits a
            // completed segment. flush() lets it finalize the current neural segment.
            vad.flush()
            if (!vad.empty()) speechSeen = true
            if (!alive() || !speechSeen) return FloatArray(0)

            // Keep the original captured waveform for Whisper. VAD is used only for
            // speech/no-speech and endpoint decisions, avoiding lossy reconstruction.
            return samples.copyOf(used)
        } finally {
            recorder = null
            runCatching { audio.stop() }
            audio.release()
            vad.release()
            samples.fill(0f)
        }
    }
}
