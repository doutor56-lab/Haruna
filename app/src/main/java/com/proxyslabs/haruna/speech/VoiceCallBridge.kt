package com.proxyslabs.haruna.speech

import android.webkit.JavascriptInterface
import com.proxyslabs.haruna.MainActivity
import org.json.JSONObject

class VoiceCallBridge(private val activity: MainActivity) {
    @JavascriptInterface fun status(): String = JSONObject().put("running", VoiceCallService.running).toString()
    @JavascriptInterface fun end(): String {
        activity.runOnUiThread { activity.endBackgroundVoiceCall() }
        return "{\"status\":\"ok\"}"
    }
}
