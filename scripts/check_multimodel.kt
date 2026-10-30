package com.proxyslabs.haruna.models

import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

object MultimodelCheck {
    private class MemoryStore(var value: ModelRecord = ModelRecord()) : ModelStore {
        var reject = false
        override fun read() = value
        override fun write(record: ModelRecord) { check(!reject) { "disk failure" }; value = record }
    }
    private class FakeNative {
        var resident: String? = null
        var kv: String? = null
        var peak = 0
        val events = mutableListOf<String>()
        fun replace(path: String) {
            events.add("unload:${resident}"); resident = null; kv = null
            check(resident == null)
            resident = path; peak = maxOf(peak, 1); kv = "fresh:$path:${events.size}"
            events.add("ready:$path")
        }
        fun unload() { events.add("unload:$resident"); resident = null; kv = null }
    }
    @JvmStatic fun main(args: Array<String>) {
        var checks = 0
        fun test(name: String, body: () -> Unit) { body(); checks++; println("PASS $name") }
        val a = ModelDescriptor("/private/a.gguf", "a.gguf", "Qwen3.5")
        val b = ModelDescriptor("/private/b.gguf", "b.gguf", "Phi-4")
        val store = MemoryStore(); val engine = FakeNative()
        val session = ModelSession(store)
        fun load(model: ModelDescriptor) = session.load(model, confirmed = { engine.resident == model.path }) { engine.replace(model.path) }
        test("1 no model, no generation") {
            check(session.snapshot().state == ModelState.UNLOADED)
            check(!session.admitGeneration { error("must not enter") })
        }
        test("2 valid load requires backend confirmation") {
            check(load(a).isSuccess); check(session.snapshot().active == a)
            check(store.value.lastSuccessful == a && store.value.pending == null)
        }
        test("3 load failure is ERROR and recoverable") {
            val failed = session.load(b, confirmed = { false }) { engine.unload(); error("invalid GGUF") }
            check(failed.isFailure); check(session.snapshot().state == ModelState.ERROR)
            check(session.snapshot().active == null && store.value.selected == b && store.value.lastSuccessful == a)
            check(!ModelSession(store).mayAutoload())
            check(load(a).isSuccess)
        }
        test("4 A to B releases old KV before new model") {
            val old = engine.kv; check(load(b).isSuccess)
            check(engine.events.takeLast(2) == listOf("unload:${a.path}", "ready:${b.path}"))
            check(engine.kv != old && engine.peak == 1)
        }
        test("5 B to A") { check(load(a).isSuccess); check(engine.resident == a.path) }
        test("6 simultaneous loads rejected; generation blocked while switching") {
            val entered = CountDownLatch(1); val release = CountDownLatch(1)
            var first: Result<Unit>? = null
            val worker = Thread {
                first = session.load(b, confirmed = { engine.resident == b.path }) {
                    entered.countDown(); check(release.await(5, TimeUnit.SECONDS)); engine.replace(b.path)
                }
            }
            worker.start(); check(entered.await(5, TimeUnit.SECONDS))
            try {
                check(session.snapshot().state == ModelState.SWITCHING)
                check(store.value.pending == b && session.snapshot().active == null)
                check(load(a).isFailure)
                check(session.unload { error("not allowed") }.isFailure)
                check(!session.admitGeneration { error("not allowed") })
            } finally { release.countDown(); worker.join(5000) }
            check(!worker.isAlive && first?.isSuccess == true)
        }
        test("7 unload acknowledgement and no automatic restart after explicit unload") {
            check(session.unload { engine.unload() }.isSuccess)
            check(session.snapshot().active == null && engine.kv == null)
            check(!ModelSession(store).mayAutoload())
        }
        test("8 READY cannot be fabricated") {
            check(session.load(a, confirmed = { false }) {}.isFailure)
            check(session.snapshot().state == ModelState.ERROR && session.snapshot().active == null)
        }
        test("9 selected and last successful persist but RAM does not") {
            check(load(a).isSuccess)
            val restarted = ModelSession(store)
            check(restarted.snapshot().record.selected == a && restarted.snapshot().record.lastSuccessful == a)
            check(restarted.snapshot().active == null && restarted.snapshot().state == ModelState.UNLOADED)
        }
        test("10 interrupted load survives repeated restarts, manual alternative works") {
            val interrupted = MemoryStore(ModelRecord(selected = b, lastSuccessful = a, pending = b))
            repeat(2) { check(!ModelSession(interrupted).mayAutoload()) }
            val recovered = ModelSession(interrupted)
            check(recovered.snapshot().recoveryRequired)
            check(recovered.load(a, confirmed = { true }) {}.isSuccess)
            check(interrupted.value.pending == null && interrupted.value.blockedPath == null)
        }
        test("11 chat belongs to caller and survives model switch") {
            val chat = mutableListOf("user: hello", "assistant: hello"); val before = chat.toList()
            check(load(b).isSuccess); check(load(a).isSuccess); check(chat == before)
        }
        test("12 context does not survive model replacement") {
            val old = engine.kv; check(load(b).isSuccess); check(engine.kv != old)
            check(session.admitGeneration { check(engine.resident == b.path) })
        }
        test("13 metadata names, generic models and explicit override") {
            check(ModelProfiles.resolve(mapOf("general.architecture" to "qwen35"), "opaque.gguf").displayName == "Qwen3.5")
            check(ModelProfiles.resolve(mapOf("general.name" to "Phi-4-mini-instruct"), "opaque.gguf").displayName == "Phi-4")
            check(ModelProfiles.resolve(mapOf("general.name" to "Other model"), "phi-4.gguf").displayName == "Other model")
            check(ModelProfiles.resolve(emptyMap(), "qwen35.gguf", "Minha voz").displayName == "Minha voz")
            check(ModelProfiles.resolve(emptyMap(), "other.gguf").maxTokens == null)
        }
        test("14 disk failure before load prevents native entry") {
            val failedStore = MemoryStore(); failedStore.reject = true
            val failed = ModelSession(failedStore)
            var enteredNative = false
            check(failed.load(a, confirmed = { true }) { enteredNative = true }.isFailure)
            check(!enteredNative)
            check(failed.snapshot().state == ModelState.UNLOADED)
        }
        test("15 READY write failure keeps crash guard and hides active") {
            val failingStore = MemoryStore(); val failing = ModelSession(failingStore)
            check(failing.load(a, confirmed = { true }) { failingStore.reject = true }.isFailure)
            check(failing.snapshot().active == null && failingStore.value.pending == a)
            check(!ModelSession(failingStore).mayAutoload())
        }
        test("16 rename active is durable without reload") {
            val renamed = b.copy(displayName = "Modelo principal")
            check(session.updateDescriptor(renamed).isSuccess)
            check(session.snapshot().active?.displayName == "Modelo principal")
            check(store.value.lastSuccessful?.displayName == "Modelo principal")
        }
        test("17 delete active acknowledges unload, removes stale selection") {
            check(session.remove(b.path) { engine.unload() }.isSuccess)
            check(session.snapshot().active == null && session.snapshot().record.selected == null)
        }
        test("18 GGUF metadata parser reads metadata, rejects malformed input") {
            val file = File.createTempFile("haruna-metadata-", ".gguf")
            try {
                val bytes = java.io.ByteArrayOutputStream()
                fun int(value: Int) { bytes.write(ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt(value).array()) }
                fun long(value: Long) { bytes.write(ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN).putLong(value).array()) }
                fun string(value: String) { val data = value.toByteArray(); long(data.size.toLong()); bytes.write(data) }
                bytes.write("GGUF".toByteArray()); int(3); long(0); long(2)
                string("general.name"); int(8); string("Phi-4-mini-instruct")
                string("general.file_type"); int(4); int(15)
                file.writeBytes(bytes.toByteArray())
                val metadata = GgufMetadata.read(file)
                check(ModelProfiles.resolve(metadata, "unknown.gguf").displayName == "Phi-4")
                check(ModelProfiles.quantization(metadata["general.file_type"]) == "Q4_K_M")
                file.writeBytes(byteArrayOf(1, 2, 3)); check(GgufMetadata.read(file).isEmpty())
            } finally { file.delete() }
        }
        test("19 failed-load cleanup cannot retire a newer model") {
            val isolatedStore = MemoryStore(); val isolated = ModelSession(isolatedStore)
            val cleanup = CountDownLatch(1); val release = CountDownLatch(1)
            val worker = Thread {
                check(isolated.load(a, confirmed = { false }, failureCleanup = {
                    cleanup.countDown(); check(release.await(5, TimeUnit.SECONDS))
                }) {}.isFailure)
            }
            worker.start(); check(cleanup.await(5, TimeUnit.SECONDS))
            try {
                check(isolated.load(b, confirmed = { true }) { error("cannot enter before previous cleanup") }.isFailure)
                check(!isolated.admitGeneration { error("cannot generate while cleaning up") })
            } finally { release.countDown(); worker.join(5000) }
            check(!worker.isAlive)
            check(isolated.load(b, confirmed = { true }) {}.isSuccess)
        }
        test("20 metadata observation stops before tokenizer string arrays") {
            val file = File.createTempFile("haruna-vocab-budget-", ".gguf")
            try {
                val bytes = java.io.ByteArrayOutputStream()
                fun int(value: Int) { bytes.write(ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt(value).array()) }
                fun long(value: Long) { bytes.write(ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN).putLong(value).array()) }
                fun string(value: String) { val data = value.toByteArray(); long(data.size.toLong()); bytes.write(data) }
                bytes.write("GGUF".toByteArray()); int(3); long(0); long(3)
                string("general.name"); int(8); string("Known label")
                string("tokenizer.ggml.tokens"); int(9); int(8); long(1); string("not needed")
                string("general.architecture"); int(8); string("qwen35")
                file.writeBytes(bytes.toByteArray())
                val partial = GgufMetadata.read(file)
                check(partial["general.name"] == "Known label")
                check("general.architecture" !in partial) // No vocabulary walk merely to discover later metadata.
            } finally { file.delete() }
        }
        println("VALIDADO EM TESTE AUTOMÁTICO: $checks checks; fake backend, no GGUF inference/device.")
    }
}
