package com.proxyslabs.haruna.speech

import org.junit.Assert.*
import org.junit.Test

class WhisperVocabularyTest {
    private fun ranks(count: Int = 50257) = buildString {
        for (id in 0 until count) append(if (id == 50256) "=" else "YQ==").append(' ').append(id).append('\n')
    }
    @Test fun acceptsOfficialEmptyByteEntryInMultilingualVocabulary() {
        assertTrue(WhisperModels.hasPortuguese(ranks()))
        assertTrue(WhisperModels.hasPortuguese("<|pt|> 1\n<|startoftranscript|> 2\n"))
    }
    @Test fun rejectsEnglishTruncatedDuplicatedAndMalformedRanks() {
        assertFalse(WhisperModels.hasPortuguese(ranks(50256)))
        assertFalse(WhisperModels.hasPortuguese(ranks().replace("YQ== 7\n", "= 7\n")))
        assertFalse(WhisperModels.hasPortuguese(ranks().replace("YQ== 7\n", "YQ== 8\n")))
        assertFalse(WhisperModels.hasPortuguese(ranks().replace("YQ== 7\n", "??? 7\n")))
        assertFalse(WhisperModels.hasPortuguese(ranks()+"YQ== 50257\n"))
    }
}
