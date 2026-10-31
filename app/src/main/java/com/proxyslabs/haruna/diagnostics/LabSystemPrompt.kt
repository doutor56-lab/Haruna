package com.proxyslabs.haruna.diagnostics

/** Append-only, request-scoped experiment. Never replaces the production identity. */
object LabSystemPrompt {
    const val CURRENT = "current"
    const val FACTUAL = "factual_precision_experimental"
    const val ADDITION = "Em perguntas factuais, priorize precisão sobre completar uma resposta. Antes de afirmar uma causa, verifique mentalmente se a explicação é coerente. Se não souber ou não tiver confiança suficiente, diga que não tem certeza em vez de inventar uma explicação."
    fun apply(current: String, variant: String, authorizedDebugBenchmark: Boolean): String =
        if (authorizedDebugBenchmark && variant == FACTUAL) current + "\n" + ADDITION else current
}
