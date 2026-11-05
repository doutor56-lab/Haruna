package com.proxyslabs.haruna.image
import java.util.concurrent.locks.ReentrantLock
/** Shared with every LLM owner: images reserve before unloading text and release after native free. */
object ImageLease {val lock=ReentrantLock();@Volatile var active=false}
