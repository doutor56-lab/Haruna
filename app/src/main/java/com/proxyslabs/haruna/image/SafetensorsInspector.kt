package com.proxyslabs.haruna.image

import org.json.JSONObject
import java.io.DataInputStream
import java.io.File
import java.io.InputStream

/** Bounded header validation; native load remains the final compatibility check. */
object SafetensorsInspector {
    private const val MAX_HEADER_BYTES=16L*1024*1024
    data class Result(val tensorCount:Int,val tensorBytes:Long,val fileBytes:Long,val architectureHint:SafetensorsArchitecture.Hint,val sd15Compatible:Boolean=false,val sdxlCompatible:Boolean=false)
    internal data class Header(val prefix:ByteArray,val json:ByteArray,val result:Result,val tensors:Map<String,SafetensorsArchitecture.Tensor>)
    private data class Span(val start:Long,val end:Long)
    private val bitsPerElement=mapOf("BOOL" to 8,"U8" to 8,"I8" to 8,"F8_E5M2" to 8,"F8_E4M3" to 8,"F8_E8M0" to 8,"I16" to 16,"U16" to 16,"F16" to 16,"BF16" to 16,"I32" to 32,"U32" to 32,"F32" to 32,"I64" to 64,"U64" to 64,"F64" to 64,"F4" to 4,"F6_E2M3" to 6,"F6_E3M2" to 6)
    private fun integer(value:Any):Long {require(value is Number){"Inteiro inválido no cabeçalho"};val n=value.toLong();require(value.toDouble()==n.toDouble()){ "Inteiro inválido no cabeçalho" };return n}
    internal fun readHeader(input:InputStream):Header {
        val source=DataInputStream(input);val prefix=ByteArray(8);source.readFully(prefix)
        require(prefix[7].toInt() and 128==0){"Cabeçalho inválido"};var length=0L
        for(i in 0..7)length=length or ((prefix[i].toLong() and 255) shl (8*i))
        require(length in 2..MAX_HEADER_BYTES){"Cabeçalho safetensors inválido ou muito grande"}
        val header=ByteArray(length.toInt());source.readFully(header);val json=JSONObject(header.toString(Charsets.UTF_8));require(json.length()<=100001){"Tensores demais"}
        val spans=mutableListOf<Span>();val tensors=linkedMapOf<String,SafetensorsArchitecture.Tensor>()
        for(name in json.keys()) {
            if(name=="__metadata__"){json.getJSONObject(name);continue}
            require(name.length in 1..1024){"Nome de tensor inválido"}
            val tensor=json.getJSONObject(name);val dtype=tensor.getString("dtype");val bits=bitsPerElement[dtype]?:throw IllegalArgumentException("Tipo de tensor não reconhecido")
            val shape=tensor.getJSONArray("shape");require(shape.length()<=8){"Dimensões demais"};val dims=mutableListOf<Long>();var elements=1L
            for(i in 0 until shape.length()){val n=integer(shape.get(i));require(n>=0){"Dimensão inválida"};elements=Math.multiplyExact(elements,n);dims.add(n)}
            val size=Math.addExact(Math.multiplyExact(elements,bits.toLong()),7)/8
            val offsets=tensor.getJSONArray("data_offsets");require(offsets.length()==2){"Offsets inválidos"};val start=integer(offsets.get(0));val end=integer(offsets.get(1))
            require(start>=0&&end>=start&&end-start==size&&end<=ImagePackage.maxBytes){"Tensor fora dos limites ou tamanho inválido"}
            spans.add(Span(start,end));tensors[name]=SafetensorsArchitecture.Tensor(dtype,dims)
        }
        require(spans.isNotEmpty()){ "Nenhum tensor encontrado" };spans.sortWith(compareBy<Span>{it.start}.thenBy{it.end});var cursor=0L
        for(span in spans){require(span.start==cursor){"Tensores sobrepostos ou dados não contíguos"};cursor=span.end}
        val fileBytes=Math.addExact(Math.addExact(8,length),cursor);require(fileBytes<=ImagePackage.maxBytes){"Checkpoint excede 8 GiB"}
        return Header(prefix,header,Result(spans.size,cursor,fileBytes,SafetensorsArchitecture.detect(tensors.keys.asSequence()),SafetensorsArchitecture.supportsCheckpoint(tensors),SafetensorsArchitecture.supportsSdxl(tensors)),tensors)
    }
    internal fun tensorMap(file:File):Map<String,SafetensorsArchitecture.Tensor> = file.inputStream().buffered().use{val header=readHeader(it);require(header.result.fileBytes==file.length()){ "Componente safetensors incompleto" };header.tensors}
    fun inspect(file:File):Result {require(file.isFile&&file.length()>=10){"Arquivo safetensors vazio ou inválido"};return file.inputStream().buffered().use{val result=readHeader(it).result;require(result.fileBytes==file.length()){ "Dados extras ou truncados no arquivo" };result}}
}
