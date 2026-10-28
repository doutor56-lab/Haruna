package com.proxyslabs.haruna

import android.content.Context

/** Process owner. Contains application context only, never an Activity or WebView. */
object HarunaRuntime {
    private var instance: LlamaCppBackend? = null
    @Synchronized fun backend(context: Context): LlamaCppBackend =
        instance ?: LlamaCppBackend(context.applicationContext).also { instance = it }

    /** Process-level shutdown only; Activity recreation must merely detach its bridge. */
    @Synchronized fun shutdown() { instance?.destroy(); instance = null }
}
