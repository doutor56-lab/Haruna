package com.proxyslabs.haruna.speech

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.sqrt

/** Foreground-only bounded PCM capture. No audio is saved to disk. */
class SttAudioRecorder {
    companion object { const val RATE = 16000; const val MAX_SECONDS = 20 }
    @Volatile private var recorder: AudioRecord? = null
    private val finishRequested = AtomicBoolean(false)
    fun prepare() { finishRequested.set(false) }
    fun finish() { finishRequested.set(true); runCatching { recorder?.stop() } }
    fun cancel() = finish()
    fun capture(alive: () -> Boolean, started: () -> Unit, level: (Double) -> Unit): FloatArray {
        if (!alive() || finishRequested.get()) return FloatArray(0)
        val minBuffer = AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        require(minBuffer > 0) { "Microfone não suporta captura em 16 kHz" }
        val audio = AudioRecord.Builder().setAudioSource(MediaRecorder.AudioSource.VOICE_RECOGNITION)
            .setAudioFormat(AudioFormat.Builder().setSampleRate(RATE).setChannelMask(AudioFormat.CHANNEL_IN_MONO).setEncoding(AudioFormat.ENCODING_PCM_16BIT).build())
            .setBufferSizeInBytes(maxOf(minBuffer * 2, 6400)).build()
        val samples = FloatArray(RATE * MAX_SECONDS)
        val frame = ShortArray(320)
        var used = 0; var lastVoice = 0; var voicedSamples = 0; var speech = false
        var candidateStart = 0; var speechStart = 0
        var noise = 120.0; var lastLevel = 0L
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
                for (i in 0 until count) { val v = frame[i].toDouble(); squares += v * v; samples[used + i] = (v / 32768.0).toFloat() }
                used += count
                val rms = sqrt(squares / count)
                if (used <= RATE / 4 && rms < 600.0) noise = noise * 0.9 + rms * 0.1
                val voiced = rms > maxOf(300.0, noise * 2.8)
                if (voiced) {
                    if (voicedSamples == 0) candidateStart = used - count
                    voicedSamples += count; lastVoice = used
                    if (!speech && voicedSamples >= RATE / 10) { speech = true; speechStart = candidateStart }
                } else { voicedSamples = 0 }
                if (!speech && !voiced) noise = (noise * 0.995 + rms * 0.005).coerceAtMost(1500.0)
                val now = android.os.SystemClock.elapsedRealtime()
                if (now - lastLevel >= 160) { lastLevel = now; level((rms / 5000.0).coerceIn(0.0, 1.0)) }
                if (speech && used - lastVoice > RATE * 16 / 10) break
                if (!speech && used >= RATE * 10) break
            }
            // An energy gate avoids decoding silence; it is not a learned VAD model.
            // Keep 320 ms before onset and 650 ms after speech, without all the initial silence.
            return if (alive() && speech) samples.copyOfRange(maxOf(0, speechStart - RATE * 32 / 100), minOf(used, lastVoice + RATE * 65 / 100)) else FloatArray(0)
        } finally {
            recorder = null
            runCatching { audio.stop() }; audio.release()
            samples.fill(0f)
        }
    }
}

