package com.proxyslabs.haruna.speech

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Future
import java.util.concurrent.RejectedExecutionException

/** Existing heavy-engine transitions drain idle voice caches on their owning workers. */
internal object IdleSpeechSessions {
    private val owners = ConcurrentHashMap<Any, () -> Future<*>?>()
    fun register(owner: Any, release: () -> Future<*>?) { owners[owner] = release }
    fun unregister(owner: Any) { owners.remove(owner) }
    fun releaseIdle() {
        val work = owners.values.toList().mapNotNull { release ->
            try { release() } catch (_: RejectedExecutionException) { null } // Owner closed concurrently.
        }
        work.forEach { it.get() }
    }
}
