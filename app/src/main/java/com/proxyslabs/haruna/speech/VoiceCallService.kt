package com.proxyslabs.haruna.speech

import android.app.*
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat

/** Only an explicitly started call. No boot restore, sticky restart, audio storage or network. */
class VoiceCallService : Service() {
    companion object {
        const val STOP = "com.proxyslabs.haruna.STOP_VOICE_CALL"
        private const val CHANNEL = "haruna_local_call"
        @Volatile var running = false
            private set
        @Volatile private var starting = false
        val active: Boolean get() = running || starting
        @Synchronized fun start(context: android.content.Context) {
            if (active) return
            starting = true
            try { context.startForegroundService(Intent(context, VoiceCallService::class.java)) }
            catch (failure: Exception) { starting = false; throw failure }
        }
        fun stop(context: android.content.Context) { starting = false; context.stopService(Intent(context, VoiceCallService::class.java)) }
    }
    private val timeoutHandler = android.os.Handler(android.os.Looper.getMainLooper())
    private var ownsCall = false
    private var wake: PowerManager.WakeLock? = null
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == STOP) {
            // The UI owner stops microphone, TTS and generation; also stop the service itself.
            sendBroadcast(Intent(STOP).setPackage(packageName))
            stopSelf(); return START_NOT_STICKY
        }
        if (running) return START_NOT_STICKY
        try {
            val notifications = getSystemService(NotificationManager::class.java)
            notifications.createNotificationChannel(NotificationChannel(CHANNEL, "Chamada local da Haruna", NotificationManager.IMPORTANCE_LOW))
            val open = PendingIntent.getActivity(this, 0, Intent(this, com.proxyslabs.haruna.MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            val stop = PendingIntent.getService(this, 1, Intent(this, VoiceCallService::class.java).setAction(STOP), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            val notification = NotificationCompat.Builder(this, CHANNEL)
                .setSmallIcon(com.proxyslabs.haruna.R.drawable.ic_voice_notification)
                .setContentTitle("Haruna · chamada local")
                .setContentText("Microfone e voz locais. Toque para voltar ou encerre a chamada.")
                .setContentIntent(open).setOngoing(true).setCategory(NotificationCompat.CATEGORY_CALL)
                .addAction(0, "Encerrar", stop).build()
            startForeground(6006, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
            running = true; starting = false; ownsCall = true
            if (wake == null) wake = getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Haruna:LocalVoiceCall").apply {
                setReferenceCounted(false); acquire(60 * 60 * 1000L)
            }
            // Calls have a finite upper lifetime; the UI can explicitly start another afterwards.
            timeoutHandler.postDelayed({
                if (ownsCall) { sendBroadcast(Intent(STOP).setPackage(packageName)); stopSelf() }
            }, 60 * 60 * 1000L)
        } catch (failure: Exception) {
            starting = false
            android.util.Log.w("HarunaVoice", "Foreground call unavailable", failure)
            sendBroadcast(Intent(STOP).setPackage(packageName)); stopSelf()
        }
        return START_NOT_STICKY
    }
    override fun onTaskRemoved(rootIntent: Intent?) { sendBroadcast(Intent(STOP).setPackage(packageName)); stopSelf(); super.onTaskRemoved(rootIntent) }
    override fun onDestroy() {
        if (ownsCall) sendBroadcast(Intent(STOP).setPackage(packageName))
        ownsCall = false
        timeoutHandler.removeCallbacksAndMessages(null)
        running = false; starting = false
        wake?.let { if (it.isHeld) it.release() }; wake = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }
}
