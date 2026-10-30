package com.proxyslabs.haruna.models

/** No Android/native dependencies: admission and durable recovery, not an inference engine. */
data class ModelDescriptor(
    val path: String, val fileName: String, val displayName: String,
    val bytes: Long = 0, val architecture: String? = null, val quantization: String? = null,
    val profile: String = "generic"
)

data class ModelRecord(
    val selected: ModelDescriptor? = null,
    val lastSuccessful: ModelDescriptor? = null,
    val pending: ModelDescriptor? = null,
    val blockedPath: String? = null,
    val error: String? = null,
    val autoload: Boolean = true
)

interface ModelStore {
    fun read(): ModelRecord
    /** Atomic/durable. Must throw on failure, never silently acknowledge a lost journal. */
    fun write(record: ModelRecord)
}

enum class ModelState { UNLOADED, LOADING, READY, UNLOADING, SWITCHING, ERROR }
data class ModelSnapshot(
    val state: ModelState, val record: ModelRecord, val active: ModelDescriptor? = null,
    val loadMillis: Long? = null, val recoveryRequired: Boolean = false
)

class ModelSession(
    private val store: ModelStore,
    private val clock: () -> Long = { System.nanoTime() / 1_000_000 },
    private val changed: () -> Unit = {}
) {
    private val gate = Any()
    private var busy = false
    private var autoAttempted = false
    @Volatile private var current: ModelSnapshot

    init {
        val saved = store.read()
        val interrupted = saved.pending != null
        current = ModelSnapshot(
            if (interrupted || saved.blockedPath != null) ModelState.ERROR else ModelState.UNLOADED,
            if (interrupted) saved.copy(error = "O último carregamento não foi concluído. Escolha um modelo para continuar.") else saved,
            recoveryRequired = interrupted || saved.blockedPath != null
        )
    }

    fun snapshot(): ModelSnapshot = current
    fun updateDescriptor(model: ModelDescriptor): Result<Unit> {
        val result = synchronized(gate) {
            if (busy) return Result.failure(IllegalStateException("Aguarde a operação de modelo atual"))
            runCatching {
                fun updated(value: ModelDescriptor?) = if (value?.path == model.path) model else value
                val record = current.record.copy(selected = updated(current.record.selected), lastSuccessful = updated(current.record.lastSuccessful))
                store.write(record)
                current = current.copy(record = record, active = updated(current.active))
            }
        }
        notifyChanged()
        return result
    }
    fun mayAutoload(): Boolean = synchronized(gate) {
        !busy && !autoAttempted && current.active == null && current.record.autoload &&
            current.record.pending == null && current.record.blockedPath == null
    }

    /** The short reservation of an asynchronous generation shares the model admission gate. */
    fun admitGeneration(action: () -> Unit): Boolean = synchronized(gate) {
        if (busy || current.state != ModelState.READY || current.active == null) false
        else { action(); true }
    }

    fun load(model: ModelDescriptor, automatic: Boolean = false, confirmed: () -> Boolean,
        failureCleanup: () -> Unit = {}, operation: () -> Unit): Result<Unit> {
        synchronized(gate) {
            if (busy) return Result.failure(IllegalStateException("Há uma troca de modelo em andamento"))
            if (automatic && !mayAutoload()) return Result.failure(IllegalStateException("Carregamento automático suspenso; escolha um modelo em Configurações"))
            if (automatic) autoAttempted = true
            if (current.state == ModelState.READY && current.active?.path == model.path && confirmed()) return Result.success(Unit)
            val pending = current.record.copy(selected = model, pending = model, blockedPath = null, error = null, autoload = true)
            try { store.write(pending) } catch (failure: Throwable) { return Result.failure(failure) }
            busy = true
            current = ModelSnapshot(if (current.active == null) ModelState.LOADING else ModelState.SWITCHING, pending)
        }
        notifyChanged()
        val start = clock()
        val result = runCatching {
            operation()
            check(confirmed()) { "O backend não confirmou READY para o modelo solicitado" }
            synchronized(gate) {
                val ready = current.record.copy(selected = model, lastSuccessful = model, pending = null, blockedPath = null, error = null)
                store.write(ready)
                current = ModelSnapshot(ModelState.READY, ready, model, (clock() - start).coerceAtLeast(0))
            }
        }
        result.exceptionOrNull()?.let { failure ->
            // Keep admission closed until cleanup finishes, including a failed durable READY write.
            runCatching { failureCleanup() }.onFailure { failure.addSuppressed(it) }
        }
        synchronized(gate) {
            if (result.isFailure) {
                val failed = current.record.copy(pending = null, blockedPath = model.path,
                    error = (result.exceptionOrNull()?.message ?: "Falha no carregamento").take(500))
                // If this write fails, the earlier pending marker remains durable and also blocks autoload.
                runCatching { store.write(failed) }
                current = ModelSnapshot(ModelState.ERROR, failed, loadMillis = (clock() - start).coerceAtLeast(0), recoveryRequired = true)
            }
            busy = false
        }
        notifyChanged()
        return result
    }

    fun unload(operation: () -> Unit): Result<Unit> = maintenance(null, operation)
    fun remove(path: String, operation: () -> Unit): Result<Unit> = maintenance(path, operation)

    private fun maintenance(removed: String?, operation: () -> Unit): Result<Unit> {
        val before: ModelSnapshot
        synchronized(gate) {
            if (busy) return Result.failure(IllegalStateException("Aguarde a operação de modelo atual"))
            before = current
            val saved = current.record.copy(autoload = if (removed == null) false else current.record.autoload)
            try { store.write(saved) } catch (failure: Throwable) { return Result.failure(failure) }
            busy = true
            current = current.copy(state = ModelState.UNLOADING, record = saved)
        }
        notifyChanged()
        var result = runCatching { operation() }
        synchronized(gate) {
            if (result.isSuccess) {
                val record = if (removed == null) current.record.copy(pending = null, blockedPath = null, error = null)
                else current.record.copy(
                    selected = current.record.selected?.takeUnless { it.path == removed },
                    lastSuccessful = current.record.lastSuccessful?.takeUnless { it.path == removed },
                    pending = current.record.pending?.takeUnless { it.path == removed },
                    blockedPath = current.record.blockedPath?.takeUnless { it == removed }, error = null)
                val remaining = before.active?.takeIf { removed != null && it.path != removed }
                result = runCatching { store.write(record) }
                current = ModelSnapshot(if (result.isSuccess) {
                    if (remaining != null) ModelState.READY else ModelState.UNLOADED
                } else ModelState.ERROR, record.copy(error = result.exceptionOrNull()?.message), remaining)
            } else {
                current = current.copy(state = ModelState.ERROR, active = null,
                    record = current.record.copy(error = result.exceptionOrNull()?.message?.take(500)))
            }
            busy = false
        }
        notifyChanged()
        return result
    }

    private fun notifyChanged() { runCatching { changed() } }
}
