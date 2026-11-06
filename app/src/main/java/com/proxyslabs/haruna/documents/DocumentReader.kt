package com.proxyslabs.haruna.documents

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.exifinterface.media.ExifInterface
import com.googlecode.tesseract.android.TessBaseAPI
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.io.MemoryUsageSetting
import com.tom_roush.pdfbox.text.PDFTextStripper
import org.mozilla.universalchardet.UniversalDetector
import java.io.File
import java.nio.charset.Charset
import java.util.concurrent.atomic.AtomicBoolean

/** Library parsers and Android rendering; one page/bitmap retained at a time. */
class DocumentReader(private val app:Context){
    private val ocrGate=Any()
    @Volatile private var ocr:TessBaseAPI?=null
    fun cancel(){synchronized(ocrGate){ocr?.stop()}}
    private fun check(cancel:AtomicBoolean){check(!cancel.get()){ "Operação cancelada" }}
    fun bitmap(file:File,maxSide:Int=2400):Bitmap{
        val bounds=BitmapFactory.Options().apply{inJustDecodeBounds=true};BitmapFactory.decodeFile(file.path,bounds)
        require(bounds.outWidth>0&&bounds.outHeight>0){"Imagem inválida"};val opts=BitmapFactory.Options().apply{inSampleSize=1};while(maxOf(bounds.outWidth,bounds.outHeight)/opts.inSampleSize>maxSide*2)opts.inSampleSize*=2
        var b=BitmapFactory.decodeFile(file.path,opts)?:error("Não foi possível abrir a imagem")
        val exif=runCatching{ExifInterface(file)}.getOrNull();val matrix=Matrix();if(exif?.isFlipped==true)matrix.postScale(-1f,1f);val rotation=exif?.rotationDegrees?:0;if(rotation!=0)matrix.postRotate(rotation.toFloat())
        if(!matrix.isIdentity){val next=Bitmap.createBitmap(b,0,0,b.width,b.height,matrix,true);if(next!==b)b.recycle();b=next}
        val scale=minOf(1.0,maxSide.toDouble()/maxOf(b.width,b.height));if(scale<1){val next=Bitmap.createScaledBitmap(b,maxOf(1,(b.width*scale).toInt()),maxOf(1,(b.height*scale).toInt()),true);if(next!==b)b.recycle();b=next};if(b.hasAlpha()){val flat=Bitmap.createBitmap(b.width,b.height,Bitmap.Config.ARGB_8888);flat.eraseColor(Color.WHITE);android.graphics.Canvas(flat).drawBitmap(b,0f,0f,null);b.recycle();b=flat};return b
    }
    fun render(file:File,page:Int,maxSide:Int=2400):Bitmap{
        ParcelFileDescriptor.open(file,ParcelFileDescriptor.MODE_READ_ONLY).use{fd->PdfRenderer(fd).use{pdf->require(page in 1..pdf.pageCount){"Página inválida"};pdf.openPage(page-1).use{p->val scale=minOf(3.0,maxSide.toDouble()/maxOf(p.width,p.height));val b=Bitmap.createBitmap(maxOf(1,(p.width*scale).toInt()),maxOf(1,(p.height*scale).toInt()),Bitmap.Config.ARGB_8888);try{b.eraseColor(Color.WHITE);p.render(b,null,null,PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);return b}catch(t:Throwable){b.recycle();throw t}}}}
    }
    private fun openOcr():TessBaseAPI{
        synchronized(ocrGate){ocr?.let{return it}}
        val root=File(app.filesDir,"tesseract");val data=File(root,"tessdata").apply{mkdirs()}
        val hashes=mapOf("eng" to "7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2","por" to "c4932b937207a9514b7514d518b931a99938c02a28a5a5a553f8599ed58b7deb")
        for((lang,hash) in hashes){val target=File(data,"$lang.traineddata");if(!target.isFile||digest(target)!=hash){val temp=File(data,"$lang.part");try{app.assets.open("tessdata/$lang.traineddata").use{input->temp.outputStream().use{input.copyTo(it)}};check(digest(temp)==hash){"Idioma OCR incompleto"};check(temp.renameTo(target))}finally{temp.delete()}}}
        val tess=TessBaseAPI();try{check(tess.init(root.path,"por+eng")){"Não foi possível iniciar o OCR português/inglês"};synchronized(ocrGate){ocr=tess};return tess}catch(t:Throwable){tess.recycle();throw t}
    }
    fun recognize(bitmap:Bitmap,page:Int,cancel:AtomicBoolean):String{
        check(cancel);val tess=openOcr();check(cancel);tess.setImage(bitmap);try{
            // This API explicitly documents HOCR as interruptible; getUTF8Text alone is not.
            tess.getHOCRText(maxOf(0,page-1));check(cancel);return tess.getUTF8Text().orEmpty()
        }finally{tess.clear()}
    }
    fun closeOcr(){synchronized(ocrGate){val t=ocr;ocr=null;t?.recycle()}}
    fun extract(file:File,format:String,cancel:AtomicBoolean,progress:(Int,Int?)->Unit,page:(Int,Int?,String,String)->Unit):Int{
        try{return when(format){
            "pdf"->{PDFBoxResourceLoader.init(app);PDDocument.load(file,MemoryUsageSetting.setupTempFileOnly()).use{pdf->val total=pdf.numberOfPages;require(total>0){"PDF vazio"};val stripper=PDFTextStripper();for(n in 1..total){check(cancel);stripper.startPage=n;stripper.endPage=n;val text=stripper.getText(pdf).trim();val (body,kind)=if(text.count{it.isLetterOrDigit()}>=32)text to "pdf_text" else {val b=render(file,n);try{val scanned=recognize(b,n,cancel);(if(scanned.length>text.length)scanned else text) to "ocr"}finally{b.recycle()}};page(n,n,kind,body);progress(n,total)};total}}
            "txt","md","csv","json","log"->{val charset=detect(file);var section=0;file.reader(charset).buffered(8192).use{r->val buf=CharArray(6000);while(true){check(cancel);val n=r.read(buf);if(n<0)break;section++;var body=String(buf,0,n);if(Character.isHighSurrogate(buf[n-1])){val extra=r.read();if(extra>=0)body+=extra.toChar()};if(section==1)body=body.removePrefix("\uFEFF");page(section,null,"text:${charset.name()}",body);progress(section,null)}};0}
            "image"->{val b=bitmap(file);try{page(1,null,"ocr",recognize(b,1,cancel))}finally{b.recycle()};progress(1,1);0}
            else->error("Formato não suportado")
        }}finally{closeOcr()}
    }
    companion object{
        fun digest(file:File):String{val md=java.security.MessageDigest.getInstance("SHA-256");file.inputStream().use{r->val buf=ByteArray(131072);while(true){val n=r.read(buf);if(n<0)break;md.update(buf,0,n)}};return md.digest().joinToString(""){"%02x".format(it)}}
        fun detect(file:File):Charset{val b=ByteArray(65536);val n=file.inputStream().use{it.read(b)};if(n>=3&&b[0]==0xef.toByte()&&b[1]==0xbb.toByte()&&b[2]==0xbf.toByte())return Charsets.UTF_8;if(n>=2&&b[0]==0xff.toByte()&&b[1]==0xfe.toByte())return Charsets.UTF_16;if(n>=2&&b[0]==0xfe.toByte()&&b[1]==0xff.toByte())return Charsets.UTF_16;val d=UniversalDetector(null);if(n>0)d.handleData(b,0,n);d.dataEnd();return runCatching{Charset.forName(d.detectedCharset?:"UTF-8")}.getOrDefault(Charsets.UTF_8)}
    }
}
