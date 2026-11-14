package com.proxyslabs.haruna.speech

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

/** User-started downloads only. No boot restart or claim of surviving a force-stop. */
class SpeechDownloadService : Service() {
    companion object {
        const val OPEN_DOWNLOADS = "haruna_voice_downloads"
        const val OPEN_KIND = "haruna_voice_download_kind"
        private const val CHANNEL = "haruna_voice_downloads"
        private const val CANCEL = "cancel_voice_downloads"
        private val jobs = ConcurrentHashMap<String, String>()
        private val results = ConcurrentHashMap<String, String>()
        @Volatile private var instance: SpeechDownloadService? = null
        fun begin(context: Context, kind: String) {
            results.remove(kind)
            jobs[kind] = if (kind == "stt") "Reconhecimento de voz" else "Voz da Haruna"
            try { context.startForegroundService(Intent(context, SpeechDownloadService::class.java)) }
            catch (failure: Exception) { jobs.remove(kind); throw failure }
        }
        fun progress(kind: String, value: JSONObject) {
            if (!jobs.containsKey(kind) || value.optBoolean("meter")) return
            val state = value.optString("state")
            if (state in setOf("installed", "error", "cancelled")) results[kind] = state
            val label = when (value.optString("state")) {
                "downloading" -> "Baixando"
                "importing" -> "Copiando"
                "extracting" -> "Extraindo"
                "validating" -> "Verificando"
                "finalizing", "installed" -> "Concluindo"
                "cancelling", "cancelled" -> "Cancelando"
                else -> return
            }
            val total = value.optLong("totalBytes", 0)
            val percent = if (total > 0) " · ${(100.0 * value.optLong("copiedBytes", 0) / total).toInt().coerceIn(0, 100)}%" else ""
            jobs[kind] = "$label ${if (kind == "stt") "reconhecimento" else "voz"}$percent"
            instance?.refresh()
        }
        fun finish(kind: String) {
            jobs.remove(kind)
            val result = results.remove(kind)
            instance?.let { if (result == "installed" || result == "error") it.completed(kind, result); it.refresh(force = true) }
        }
    }
    private val main = android.os.Handler(android.os.Looper.getMainLooper())
    private var lastUpdate = 0L
    private var lastStartId = 0
    private var gracefulStop = false
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onCreate() {
        super.onCreate(); instance = this
        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL, "Downloads de voz", NotificationManager.IMPORTANCE_LOW))
    }
    private fun openApp(kind: String? = null): PendingIntent = PendingIntent.getActivity(this, if (kind == "stt") 22 else if (kind == "tts") 23 else 20,
            Intent(this, com.proxyslabs.haruna.MainActivity::class.java).putExtra(OPEN_DOWNLOADS, true).putExtra(OPEN_KIND, kind).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    private fun notification(): Notification {
        val cancel = PendingIntent.getService(this, 21, Intent(this, SpeechDownloadService::class.java).setAction(CANCEL),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        return NotificationCompat.Builder(this, CHANNEL).setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("Haruna · preparando voz").setContentText(jobs.values.joinToString(" · "))
            .setContentIntent(openApp(jobs.keys.singleOrNull())).setOngoing(true).setOnlyAlertOnce(true)
            .setProgress(0, 0, true).addAction(0, "Cancelar downloads", cancel).build()
    }
    private fun completed(kind: String, state: String) {
        main.post { runCatching {
            getSystemService(NotificationManager::class.java).notify(if (kind == "stt") 6010 else 6011,
                NotificationCompat.Builder(this, CHANNEL).setSmallIcon(com.proxyslabs.haruna.R.drawable.ic_voice_notification)
                    .setContentTitle(if (state == "installed") "Modelo de voz instalado" else "Não foi possível instalar o modelo")
                    .setContentText(if (kind == "stt") "Reconhecimento de voz" else "Voz da Haruna")
                    .setContentIntent(openApp(kind)).setAutoCancel(true).build())
        } }
    }
    private fun refresh(force: Boolean = false) {
        main.post {
            if (instance !== this) return@post
            if (jobs.isEmpty()) { gracefulStop = stopSelfResult(lastStartId); return@post }
            val now = SystemClock.elapsedRealtime()
            if (force || now - lastUpdate >= 1000) {
                lastUpdate = now; getSystemService(NotificationManager::class.java).notify(6007, notification())
            }
        }
    }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        lastStartId = startId; gracefulStop = false
        try { startForeground(6007, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC) }
        catch (failure: Exception) { SpeechRuntime.cancelDownloads(); stopSelf(); return START_NOT_STICKY }
        if (intent?.action == CANCEL) { SpeechRuntime.cancelDownloads(); gracefulStop = stopSelfResult(startId) }
        else refresh(force = true)
        return START_NOT_STICKY
    }
    override fun onTimeout(startId: Int, fgsType: Int) { SpeechRuntime.cancelDownloads(); stopSelf() }
    override fun onDestroy() {
        val owns = instance === this
        if (owns) instance = null
        main.removeCallbacksAndMessages(null)
        if (owns && !gracefulStop && jobs.isNotEmpty()) SpeechRuntime.cancelDownloads()
        stopForeground(STOP_FOREGROUND_REMOVE); super.onDestroy()
    }
}
