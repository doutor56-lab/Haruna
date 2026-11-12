package com.proxyslabs.haruna.speech

import org.json.JSONObject

/** Scalars only, process-local. No text, identifiers or audio retained. */
object SttDiagnostics {
    const val LANGUAGE = "pt"
    private var modelName = "Whisper Tiny multilingual INT8"
    @Synchronized fun model(name: String) { modelName = name }
    private var engineName = "sherpa-onnx OfflineRecognizer"
    private var loadMs: Double? = null
    private var reused: Boolean? = null
    @Synchronized fun prepared(engine: String, reusedModel: Boolean, ms: Double) { engineName=engine; reused=reusedModel; loadMs=ms.takeIf { it.isFinite() && it>=0 } }
    private var rate: Int? = null
    private var audioMs: Double? = null
    private var decodeMs: Double? = null
    private var lastOutcome: String? = null
    private var attempts = 0L
    private var successes = 0L
    @Synchronized fun begin() { audioMs = null; decodeMs = null; loadMs = null; reused = null; lastOutcome = null }
    @Synchronized fun captureRate(value: Int) { rate = value }
    @Synchronized fun captured(samples: Int) { audioMs = samples * 1000.0 / SttAudioRecorder.RATE }
    @Synchronized fun decoded(ms: Double) { decodeMs = ms.takeIf { it.isFinite() && it >= 0 } }
    @Synchronized fun finished(outcome: String) { lastOutcome = outcome; attempts++; if (outcome == "success") successes++ }
    @Synchronized fun snapshot(): JSONObject = JSONObject()
        .put("engine", engineName).put("modelLoadMs", loadMs ?: JSONObject.NULL).put("sessionReused", reused ?: JSONObject.NULL).put("model", modelName)
        .put("language", LANGUAGE).put("sampleRate", rate ?: JSONObject.NULL)
        .put("audioMs", audioMs ?: JSONObject.NULL).put("decodeMs", decodeMs ?: JSONObject.NULL)
        .put("rtf", if (audioMs != null && audioMs!! > 0 && decodeMs != null) decodeMs!! / audioMs!! else JSONObject.NULL)
        .put("outcome", lastOutcome ?: JSONObject.NULL).put("attempts", attempts).put("successes", successes)
}
