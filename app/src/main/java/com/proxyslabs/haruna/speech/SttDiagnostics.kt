package com.proxyslabs.haruna.speech

import org.json.JSONObject

/** Scalars only, process-local. No text, identifiers or audio retained. */
object SttDiagnostics {
    const val LANGUAGE = "pt"
    private var rate: Int? = null
    private var audioMs: Double? = null
    private var decodeMs: Double? = null
    private var lastOutcome: String? = null
    private var attempts = 0L
    private var successes = 0L
    @Synchronized fun begin() { audioMs = null; decodeMs = null; lastOutcome = null }
    @Synchronized fun captureRate(value: Int) { rate = value }
    @Synchronized fun captured(samples: Int) { audioMs = samples * 1000.0 / SttAudioRecorder.RATE }
    @Synchronized fun decoded(ms: Double) { decodeMs = ms.takeIf { it.isFinite() && it >= 0 } }
    @Synchronized fun finished(outcome: String) { lastOutcome = outcome; attempts++; if (outcome == "success") successes++ }
    @Synchronized fun snapshot(): JSONObject = JSONObject()
        .put("engine", "sherpa-onnx OfflineRecognizer").put("model", "Whisper Tiny multilingual INT8")
        .put("language", LANGUAGE).put("sampleRate", rate ?: JSONObject.NULL)
        .put("audioMs", audioMs ?: JSONObject.NULL).put("decodeMs", decodeMs ?: JSONObject.NULL)
        .put("rtf", if (audioMs != null && audioMs!! > 0 && decodeMs != null) decodeMs!! / audioMs!! else JSONObject.NULL)
        .put("outcome", lastOutcome ?: JSONObject.NULL).put("attempts", attempts).put("successes", successes)
}
