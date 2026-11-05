package com.proxyslabs.haruna.image

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.File

class SafetensorsInspectorTest {
    private fun checkpoint(header: String, payload: ByteArray = byteArrayOf(1, 2, 3, 4)): File {
        val file = File.createTempFile("haruna-test-", ".safetensors")
        file.deleteOnExit()
        val bytes = header.toByteArray(Charsets.UTF_8)
        file.outputStream().use { out ->
            var n = bytes.size.toLong()
            repeat(8) { out.write((n and 255L).toInt()); n = n ushr 8 }
            out.write(bytes)
            out.write(payload)
        }
        return file
    }

    @Test fun readsValidTensorHeader() {
        val f = checkpoint("""{"weight":{"dtype":"F32","shape":[1],"data_offsets":[0,4]}}""")
        val result = SafetensorsInspector.inspect(f)
        assertEquals(1, result.tensorCount)
        assertEquals(4L, result.tensorBytes)
        f.delete()
    }

    @Test fun rejectsOutOfBoundsOffsets() {
        val f = checkpoint("""{"weight":{"dtype":"F32","shape":[1],"data_offsets":[0,400]}}""")
        assertThrows(IllegalArgumentException::class.java) { SafetensorsInspector.inspect(f) }
        f.delete()
    }

    @Test fun rejectsWrongTensorByteCount() {
        val f = checkpoint("""{"weight":{"dtype":"F16","shape":[1],"data_offsets":[0,4]}}""")
        assertThrows(IllegalArgumentException::class.java) { SafetensorsInspector.inspect(f) }
        f.delete()
    }

    @Test fun rejectsOverlappingTensorData() {
        val f = checkpoint("""{"a":{"dtype":"F16","shape":[1],"data_offsets":[0,2]},"b":{"dtype":"F16","shape":[1],"data_offsets":[0,2]}}""")
        assertThrows(IllegalArgumentException::class.java) { SafetensorsInspector.inspect(f) }
        f.delete()
    }

    @Test fun rejectsTrailingUnreferencedBytes() {
        val f = checkpoint("""{"weight":{"dtype":"F16","shape":[1],"data_offsets":[0,2]}}""")
        assertThrows(IllegalArgumentException::class.java) { SafetensorsInspector.inspect(f) }
        f.delete()
    }

    @Test fun rejectsOversizedHeader() {
        val f = File.createTempFile("haruna-test-", ".safetensors")
        f.outputStream().use { out ->
            var n = 16L * 1024 * 1024 + 1
            repeat(8) { out.write((n and 255L).toInt()); n = n ushr 8 }
            out.write(byteArrayOf(123, 125))
        }
        assertThrows(IllegalArgumentException::class.java) { SafetensorsInspector.inspect(f) }
        f.delete()
    }
}
