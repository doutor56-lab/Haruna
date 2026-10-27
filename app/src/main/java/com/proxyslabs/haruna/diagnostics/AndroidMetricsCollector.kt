package com.proxyslabs.haruna.diagnostics

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.Debug
import android.os.Process
import android.os.SystemClock
import org.json.JSONObject
import java.io.File

/** Called by the DBG worker only. PSS sampling is capped at once per ten seconds. */
class AndroidMetricsCollector(context: Context) {
    private val app = context.applicationContext
    private var cached: JSONObject? = null
    private var lastSample = -10_000L
    private var peakPss = 0L
    private val appIdentity: JSONObject by lazy {
        runCatching {
            @Suppress("DEPRECATION")
            val info = app.packageManager.getPackageInfo(app.packageName, 0)
            JSONObject().put("version", info.versionName ?: JSONObject.NULL).put("build", info.longVersionCode)
        }.getOrElse { JSONObject() }
    }

    fun snapshot(): JSONObject {
        val now = SystemClock.elapsedRealtime()
        if (cached == null || now - lastSample >= 10_000) {
            val values = JSONObject()
            runCatching {
                val info = Debug.MemoryInfo()
                Debug.getMemoryInfo(info)
                val pss = info.totalPss.toLong() * 1024
                peakPss = maxOf(peakPss, pss)
                values.put("pssBytes", pss).put("javaPssBytes", info.dalvikPss.toLong() * 1024)
                    .put("nativePssBytes", info.nativePss.toLong() * 1024)
                    .put("otherPssBytes", info.otherPss.toLong() * 1024)
                    .put("observedPeakPssBytes", peakPss)
            }
            runCatching {
                val runtime = Runtime.getRuntime()
                values.put("javaHeapBytes", runtime.totalMemory() - runtime.freeMemory())
                    .put("nativeHeapBytes", Debug.getNativeHeapAllocatedSize())
            }
            runCatching {
                val info = ActivityManager.MemoryInfo()
                (app.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).getMemoryInfo(info)
                values.put("systemTotalBytes", info.totalMem).put("systemAvailableBytes", info.availMem)
            }
            runCatching {
                val peakKiB = File("/proc/self/status").useLines { lines ->
                    lines.firstOrNull { it.startsWith("VmHWM:") }
                        ?.substringAfter(':')?.trim()?.substringBefore(' ')?.toLongOrNull()
                }
                if (peakKiB != null) values.put("kernelPeakRssBytes", peakKiB * 1024)
            }
            cached = values; lastSample = now
        }
        val processUptime = runCatching { now - Process.getStartElapsedRealtime() }.getOrNull()
        return JSONObject().put("memory", JSONObject(cached.toString()).put("sampleAgeMs", now - lastSample))
            .put("device", JSONObject().put("manufacturer", Build.MANUFACTURER).put("model", Build.MODEL)
                .put("app", appIdentity).put("android", Build.VERSION.RELEASE).put("api", Build.VERSION.SDK_INT)
                .put("processArch", System.getProperty("os.arch") ?: JSONObject.NULL)
                .put("process64Bit", Process.is64Bit()).put("processUptimeMs", processUptime ?: JSONObject.NULL))
    }
}
