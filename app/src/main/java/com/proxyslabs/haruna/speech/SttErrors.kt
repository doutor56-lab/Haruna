package com.proxyslabs.haruna.speech

import java.net.UnknownHostException
import java.net.ConnectException
import java.net.SocketTimeoutException
import javax.net.ssl.SSLException

/** UI translations only. The original exception remains available to development logs. */
object SttErrors {
    fun message(error: Throwable): String {
        val causes = generateSequence(error) { it.cause }.take(8).toList()
        return when {
            causes.any { it is UnknownHostException || it is ConnectException } -> "Não foi possível acessar o servidor. Verifique sua conexão com a internet e tente novamente."
            causes.any { it is SocketTimeoutException } -> "A conexão demorou demais. Verifique sua internet e tente novamente."
            causes.any { it is SSLException } -> "Não foi possível estabelecer uma conexão segura. Verifique a data do aparelho e sua conexão."
            causes.any { it.message?.contains("ENOSPC") == true } -> "Não há espaço suficiente para instalar este modelo."
            error is java.io.EOFException -> "O modelo parece estar incompleto ou corrompido."
            error is IllegalArgumentException || error is IllegalStateException -> error.message ?: "Este arquivo não é um modelo de reconhecimento compatível."
            else -> "Não foi possível concluir o reconhecimento local. Tente novamente ou importe um modelo compatível."
        }
    }
}
