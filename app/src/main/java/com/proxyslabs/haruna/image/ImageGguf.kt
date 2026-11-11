package com.proxyslabs.haruna.image

import java.io.File
import java.io.RandomAccessFile

/** Bounded container inspection, not a tokenizer or inference engine. Never reads weight payloads. */
internal object ImageGguf {
    private val layouts=mapOf(0 to (1L to 4L),1 to (1L to 2L),2 to (32L to 18L),3 to (32L to 20L),6 to (32L to 22L),7 to (32L to 24L),8 to (32L to 34L),10 to (256L to 84L),11 to (256L to 110L),12 to (256L to 144L),13 to (256L to 176L),14 to (256L to 210L),15 to (256L to 292L),30 to (1L to 2L))
    fun tensors(file:File):Map<String,SafetensorsArchitecture.Tensor> = RandomAccessFile(file,"r").use { r ->
        fun bounded(){require(r.filePointer<=minOf(file.length(),32L*1024*1024)){"Cabeçalho GGUF de imagem excessivo ou truncado"}}
        fun u32():Long {bounded();return Integer.toUnsignedLong(Integer.reverseBytes(r.readInt()))}
        fun u64():Long {bounded();return java.lang.Long.reverseBytes(r.readLong()).also{require(it>=0){"GGUF inválido"}}}
        fun string():String {val n=u64();require(n<=16L*1024*1024);val bytes=ByteArray(n.toInt());r.readFully(bytes);bounded();return bytes.toString(Charsets.UTF_8)}
        fun skipValue(type:Int,depth:Int=0){require(depth<=1);when(type){0,1,7->r.skipBytes(1);2,3->r.skipBytes(2);4,5,6->r.skipBytes(4);10,11,12->r.skipBytes(8);8->{val n=u64();require(n<=16L*1024*1024);r.seek(Math.addExact(r.filePointer,n))};9->{val child=u32().toInt();val count=u64();require(count<=1000000&&child!=9);repeat(count.toInt()){skipValue(child,depth+1)}};else->error("Tipo GGUF incompatível")};bounded()}
        require(u32()==0x46554747L&&u32() in 2L..3L){"GGUF de imagem inválido"};val count=u64();val metadata=u64();require(count in 1..100000&&metadata<=100000);var alignment=32L
        repeat(metadata.toInt()){val key=string();require(key.length<=1024);val type=u32().toInt();if(key=="general.alignment"){require(type==4);alignment=u32();require(alignment in 1..4096&&alignment and (alignment-1)==0L)}else skipValue(type)}
        val tensors=linkedMapOf<String,SafetensorsArchitecture.Tensor>();val spans=mutableListOf<Pair<Long,Long>>()
        repeat(count.toInt()){val name=string();require(name.length in 1..1024&&!tensors.containsKey(name));val dimensions=u32();require(dimensions in 1..4);val dims=List(dimensions.toInt()){u64().also{require(it>0)}};val type=u32().toInt();val layout=layouts[type]?:error("Quantização GGUF de imagem não suportada neste importador");val offset=u64();val n=dims.fold(1L){a,b->Math.multiplyExact(a,b)};require(n%layout.first==0L&&dims.first()%layout.first==0L);val bytes=Math.multiplyExact(n/layout.first,layout.second);spans.add(offset to Math.addExact(offset,bytes));tensors[name]=SafetensorsArchitecture.Tensor("GGUF_$type",dims.reversed())}
        bounded();val data=(r.filePointer+alignment-1)/alignment*alignment;spans.sortBy{it.first};var end=0L;for(span in spans){require(span.first>=end&&span.second<=file.length()-data){"Pesos GGUF incompletos ou sobrepostos"};end=span.second};tensors
    }
}
