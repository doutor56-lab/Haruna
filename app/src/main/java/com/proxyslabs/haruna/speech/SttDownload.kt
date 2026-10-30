package com.proxyslabs.haruna.speech

import java.net.HttpURLConnection
import java.net.URI

/** Bounded explicit HTTPS redirects; no DNS bypass, cleartext fallback or hidden mirror. */
object SttDownload {
    fun open(url: String, register: (HttpURLConnection) -> Unit, check: () -> Unit): HttpURLConnection {
        var current = URI(url)
        repeat(6) {
            check()
            require(current.scheme == "https" && current.userInfo == null) { "A fonte de reconhecimento deve usar HTTPS." }
            val conn = current.toURL().openConnection() as HttpURLConnection
            register(conn)
            conn.connectTimeout = 20_000; conn.readTimeout = 30_000
            conn.instanceFollowRedirects = false
            conn.setRequestProperty("User-Agent", "Haruna-Android-STT/0.6")
            conn.setRequestProperty("Accept-Encoding", "identity")
            try {
                val code = conn.responseCode
                if (code in listOf(301, 302, 303, 307, 308)) {
                    val location = conn.getHeaderField("Location") ?: error("O servidor não informou o destino do download.")
                    current = current.resolve(location); conn.disconnect()
                } else {
                    require(code in 200..299) { "O servidor não disponibilizou o modelo (HTTP $code). Tente novamente mais tarde." }
                    return conn
                }
            } catch (failure: Throwable) { conn.disconnect(); throw failure }
        }
        error("O servidor redirecionou o download muitas vezes.")
    }
}
