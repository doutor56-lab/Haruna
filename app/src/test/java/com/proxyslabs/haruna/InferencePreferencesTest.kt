package com.proxyslabs.haruna

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class InferencePreferencesTest {
    @Test fun officialSmolDefaultsDoNotChangeOtherModels() {
        val smol = InferencePreferences.resolve("SmolLM3-3B Q4")
        assertEquals(0.6, smol.getDouble("temperature"), 0.0)
        assertEquals(0.95, smol.getDouble("topP"), 0.0)
        assertEquals("smollm3", smol.getString("profile"))
        assertEquals(0.3, InferencePreferences.resolve("Phi-4 Mini").getDouble("temperature"), 0.0)
        assertEquals(0.3, InferencePreferences.resolve("Qwen3.5 2B").getDouble("temperature"), 0.0)
    }
    @Test fun customParametersRemainIndependentAndRestoreDoesNotMutateDefaults() {
        val value = InferencePreferences.resolve("SmolLM3").put("temperature", 0.8).put("threads", 2).put("threadsBatch", 6)
        val custom = InferencePreferences.resolve("SmolLM3", value)
        assertEquals(2, custom.getInt("threads")); assertEquals(6, custom.getInt("threadsBatch"))
        assertEquals("custom", custom.getString("profile"))
        assertEquals(0.6, InferencePreferences.resolve("SmolLM3").getDouble("temperature"), 0.0)
        value.put("nBatch", 512).put("nUbatch", 128)
        assertEquals(128, InferencePreferences.validate(value).getInt("nUbatch"))
    }
    @Test fun rejectsInvalidConfigurationBeforeItReachesJni() {
        for ((key, value) in listOf("temperature" to "0.8", "topP" to 0, "seed" to -2, "seed" to 4294967295L, "threads" to 17, "nCtx" to 1500, "nCtx" to 1024, "nUbatch" to 1024)) {
            assertTrue(key, runCatching { InferencePreferences.validate(InferencePreferences.resolve("SmolLM3").put(key, value)) }.isFailure)
        }
        assertEquals(4294967294L, InferencePreferences.validate(InferencePreferences.resolve("SmolLM3").put("seed",4294967294L)).getLong("seed"))
    }
}
