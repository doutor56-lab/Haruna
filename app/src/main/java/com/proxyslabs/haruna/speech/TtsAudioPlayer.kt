package com.proxyslabs.haruna.speech

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.Handler
import android.os.Looper

/** Bounded streaming writes; stop() flushes queued PCM immediately. No WAV files. */
class TtsAudioPlayer(context: Context, private val focusLost: () -> Unit) {
    private val manager = context.getSystemService(AudioManager::class.java)
    private val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
    private val focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
        .setAudioAttributes(attributes).setOnAudioFocusChangeListener({ if (it < 0) focusLost() }, Handler(Looper.getMainLooper())).build()
    private val lock = Any()
    private var track: AudioTrack? = null
    private var sampleRate = 0
    private var written = 0L
    fun begin(rate: Int) {
        require(manager.requestAudioFocus(focus) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) { "Não foi possível obter a saída de áudio" }
        synchronized(lock) {
            sampleRate = rate; written = 0
            val buffer = maxOf(AudioTrack.getMinBufferSize(rate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_FLOAT), rate / 5 * 4)
            track = AudioTrack.Builder().setAudioAttributes(attributes)
                .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_FLOAT).setSampleRate(rate).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                .setBufferSizeInBytes(buffer).setTransferMode(AudioTrack.MODE_STREAM).build().also { it.play() }
        }
    }
    fun write(samples: FloatArray, alive: () -> Boolean) {
        var offset = 0
        while (offset < samples.size && alive()) {
            val n = synchronized(lock) { track?.write(samples, offset, minOf(2048, samples.size - offset), AudioTrack.WRITE_NON_BLOCKING) ?: return }
            require(n >= 0) { "Falha na reprodução ($n)" }
            if (n == 0) Thread.sleep(10) else { offset += n; written += n }
        }
    }
    fun drain(alive: () -> Boolean) {
        while (alive()) {
            val played = synchronized(lock) { track?.playbackHeadPosition?.toLong()?.and(0xffffffffL) ?: return }
            if (played >= written) return
            Thread.sleep(15)
        }
    }
    fun stop() {
        synchronized(lock) { track?.let { runCatching { it.pause(); it.flush(); it.release() } }; track = null }
        manager.abandonAudioFocusRequest(focus)
    }
}
