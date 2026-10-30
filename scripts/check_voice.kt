package com.proxyslabs.haruna.speech

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

object VoiceCheck {
    @JvmStatic fun main(args: Array<String>) {
        var checks = 0
        fun test(name: String, action: () -> Unit) { action(); checks++; println("PASS voice $name") }
        test("Tiny Base Small exported INT8 pairs") {
            for (model in WhisperModels.onnx) {
                check(WhisperModels.detect(model.files.toSet()) == model)
                check(WhisperModels.byId(model.id) == model)
                check(model.url.startsWith("https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/"))
            }
        }
        test("unknown runtime and English-only package rejected") {
            check(runCatching { WhisperModels.byId("vosk") }.isFailure)
            check(runCatching { WhisperModels.detect(setOf("tiny.en-encoder.int8.onnx", "tiny.en-decoder.int8.onnx", "tiny.en-tokens.txt")) }.isFailure)
            check(runCatching { WhisperModels.detect(setOf("model.gguf", "model.pt")) }.isFailure)
        }
        test("incomplete and mixed packages rejected") {
            check(runCatching { WhisperModels.detect(WhisperModels.supported[0].files.dropLast(1).toSet()) }.isFailure)
            check(runCatching { WhisperModels.detect((WhisperModels.supported[0].files + WhisperModels.supported[1].files).toSet()) }.isFailure)
        }
        test("special-token multilingual exports accepted") {
            check(WhisperModels.hasPortuguese("<|pt|> 50267\n<|startoftranscript|> 50258\n"))
            check(WhisperModels.hasPortuguese("PHxwdHw+ 50267\nPHxzdGFydG9mdHJhbnNjcmlwdHw+ 50258\n"))
        }
        test("official mergeable-rank format accepted without special-token lines") {
            val multilingual = (0..50256).joinToString("\n") { "YQ== $it" }
            check(WhisperModels.hasPortuguese(multilingual))
            check(!WhisperModels.hasPortuguese((0..50255).joinToString("\n") { "YQ== $it" }))
            check(!WhisperModels.hasPortuguese(multilingual + "\nYQ== 50256"))
            check(!WhisperModels.hasPortuguese("invalid file"))
        }
        test("Whisper CPP verified models are distinct from ONNX and each other") {
            check(WhisperModels.cpp.size == 6)
            check(WhisperModels.supported.map { it.id }.toSet().size == 9)
            for (model in WhisperModels.cpp) {
                check(model.sha256.matches(Regex("[0-9a-f]{64}")))
                check(model.files == listOf("model.bin"))
                check(model.url.startsWith("https://huggingface.co/ggerganov/whisper.cpp/resolve/"))
                check(model.archiveBytes in 30_000_000..500_000_000)
                check(WhisperModels.byId(model.id) == model)
            }
        }
        test("minimal GGML header rejects LLM GGUF, English and corrupt dimensions before copy") {
            fun header(vocab: Int = 51865, width: Int = 384): ByteArray {
                val buffer = java.nio.ByteBuffer.allocate(48).order(java.nio.ByteOrder.LITTLE_ENDIAN)
                listOf(0x67676d6c, vocab,1500,width,6,4,448,width,6,4,80,1).forEach { buffer.putInt(it) }
                return buffer.array()
            }
            check(WhisperFileHeader.family(header()) == "tiny")
            check(runCatching { WhisperFileHeader.family(header(51864)) }.isFailure)
            check(runCatching { WhisperFileHeader.family(header(width=4096)) }.isFailure)
            check(runCatching { WhisperFileHeader.family("GGUF".toByteArray()) }.isFailure)
            check(runCatching { WhisperFileHeader.family(ByteArray(48)) }.isFailure)
        }
        test("network errors have Portuguese UI messages without raw Java DNS text") {
            val message = SttErrors.message(java.net.UnknownHostException("Unable to resolve host github.com"))
            check(message.contains("conexão") && !message.contains("Unable") && !message.contains("github.com"))
            check(SttErrors.message(java.io.EOFException()).contains("corrompido"))
            check(SttErrors.message(java.io.IOException("ENOSPC")).contains("espaço"))
        }
        test("FIFO and final drain") {
            val queue = SpeechTextQueue(); queue.offer("Primeira frase."); queue.offer("Segunda frase."); queue.finish()
            check(queue.take() == "Primeira frase."); check(queue.take() == "Segunda frase."); check(queue.take() == null)
            check(runCatching { queue.offer("late") }.isFailure)
        }
        test("producer gets bounded rejection rather than blocking the LLM") {
            val queue = SpeechTextQueue(20, 2); queue.offer("primeira"); queue.offer("segunda")
            check(runCatching { queue.offer("terceira") }.isFailure)
            queue.cancel(); check(queue.take() == null)
        }
        test("cancel clears pending text and prevents late additions") {
            val queue = SpeechTextQueue(); queue.offer("Não deve falar"); queue.cancel(); check(queue.take() == null)
            check(runCatching { queue.offer("old callback") }.isFailure)
        }
        test("empty waiting consumer wakes on cancel") {
            val queue = SpeechTextQueue(); val ready = CountDownLatch(1); val done = CountDownLatch(1)
            val consumer = Thread { ready.countDown(); check(queue.take() == null); done.countDown() }
            consumer.start(); check(ready.await(2, TimeUnit.SECONDS)); queue.cancel(); check(done.await(2, TimeUnit.SECONDS)); consumer.join()
        }
        test("consumer waits between segments without treating temporary emptiness as end") {
            val queue = SpeechTextQueue(); val first = CountDownLatch(1); val done = CountDownLatch(1)
            val received = mutableListOf<String>()
            val consumer = Thread { while (true) { val text = queue.take() ?: break; received.add(text); if (received.size == 1) first.countDown() }; done.countDown() }
            consumer.start(); queue.offer("one"); check(first.await(2, TimeUnit.SECONDS)); check(done.count == 1L)
            queue.offer("two"); queue.finish(); check(done.await(2, TimeUnit.SECONDS)); consumer.join(); check(received == listOf("one", "two"))
        }
        println("VALIDADO EM TESTE AUTOMÁTICO: $checks voice checks, no real model/audio/device execution.")
    }
}
