package com.proxyslabs.haruna

import android.text.InputType
import android.webkit.JsPromptResult
import android.webkit.JsResult
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.widget.EditText
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity

/** Keep JS confirmation semantics while using the Haruna dialog theme. */
class HarunaWebChromeClient(private val activity: AppCompatActivity) : WebChromeClient() {
    private var current: AlertDialog? = null

    private fun show(message: String, result: JsResult, prompt: String? = null, alert: Boolean = false) {
        current?.dismiss()
        if (activity.isFinishing || activity.isDestroyed) { result.cancel(); return }
        val builder = AlertDialog.Builder(activity, R.style.Theme_Haruna_Dialog)
            .setTitle("Haruna")
            .setMessage(message)
        val field = if (prompt != null) EditText(builder.context).apply {
            setText(prompt)
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
            minLines = 2
            maxLines = 8
            val padding = (16 * resources.displayMetrics.density).toInt()
            setPadding(padding, padding, padding, padding)
            setTextColor(android.graphics.Color.parseColor("#F7F5FF"))
        } else null
        if (field != null) builder.setView(field)
        var settled = false
        fun cancel() { if (!settled) { settled = true; result.cancel() } }
        builder.setPositiveButton(if (alert) "Entendi" else if (prompt != null) "Salvar" else "Confirmar") { _, _ ->
            settled = true
            if (result is JsPromptResult && field != null) result.confirm(field.text.toString()) else result.confirm()
        }
        if (!alert) builder.setNegativeButton("Cancelar") { _, _ -> cancel() }
        val dialog = builder.create()
        dialog.setOnCancelListener { cancel() }
        dialog.setOnDismissListener { cancel(); if (current === dialog) current = null }
        current = dialog
        dialog.show()
    }

    override fun onJsAlert(view: WebView, url: String, message: String, result: JsResult): Boolean {
        show(message, result, alert = true); return true
    }
    override fun onJsConfirm(view: WebView, url: String, message: String, result: JsResult): Boolean {
        show(message, result); return true
    }
    override fun onJsPrompt(view: WebView, url: String, message: String, defaultValue: String?, result: JsPromptResult): Boolean {
        show(message, result, prompt = defaultValue ?: ""); return true
    }
    fun dispose() { current?.dismiss(); current = null }
}
