package com.proxyslabs.haruna.image

import android.content.Context
import android.content.ContentValues
import android.content.Intent
import android.content.ClipData
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import androidx.core.content.FileProvider
import java.io.File

/** Only finished, private PNG files are exposed through a scoped read grant. */
internal object ImageFiles {
    fun writeRgb(file:File,rgb:ByteArray){
        require(rgb.size==512*512*3){"RGB inválido"}
        val pixels=IntArray(512*512){i->val n=i*3;0xff000000.toInt() or ((rgb[n].toInt() and 255) shl 16) or ((rgb[n+1].toInt() and 255) shl 8) or (rgb[n+2].toInt() and 255)}
        val bitmap=Bitmap.createBitmap(pixels,512,512,Bitmap.Config.ARGB_8888)
        try{file.outputStream().use{check(bitmap.compress(Bitmap.CompressFormat.PNG,100,it)){"Não foi possível gravar PNG"}}}finally{bitmap.recycle()}
    }
    fun validateDimensions(file:File,resolution:Int){val options=BitmapFactory.Options().apply{inJustDecodeBounds=true};BitmapFactory.decodeFile(file.absolutePath,options);check(options.outWidth==resolution&&options.outHeight==resolution){"PNG nativo inválido"}}
    fun resize(file:File,resolution:Int,nativeResolution:Int=512){
        val bitmap=BitmapFactory.decodeFile(file.absolutePath)?:error("PNG gerado inválido")
        try{check(bitmap.width==nativeResolution&&bitmap.height==nativeResolution){"Resolução nativa inesperada"}
            if(resolution!=nativeResolution){val small=Bitmap.createScaledBitmap(bitmap,resolution,resolution,true)
                try{file.outputStream().use{check(small.compress(Bitmap.CompressFormat.PNG,100,it))}}finally{if(small!==bitmap)small.recycle()}}
        }finally{bitmap.recycle()}
    }
    fun validateSize(file:File,width:Int,height:Int){val o=BitmapFactory.Options().apply{inJustDecodeBounds=true};BitmapFactory.decodeFile(file.absolutePath,o);check(o.outWidth==width&&o.outHeight==height){"PNG nativo inválido"}}
    fun finishSize(file:File,width:Int,height:Int,nativeWidth:Int,nativeHeight:Int,legacySquare:Boolean){
        val source=BitmapFactory.decodeFile(file.absolutePath)?:error("PNG gerado inválido")
        var cropped:Bitmap?=null;var scaled:Bitmap?=null
        try{check(source.width==nativeWidth&&source.height==nativeHeight){"Resolução nativa inesperada"}
            val image=if(legacySquare)source else {check(width<=nativeWidth&&height<=nativeHeight);Bitmap.createBitmap(source,(nativeWidth-width)/2,(nativeHeight-height)/2,width,height).also{cropped=it}}
            val final=if(image.width!=width||image.height!=height)Bitmap.createScaledBitmap(image,width,height,true).also{scaled=it}else image
            if(final!==source)file.outputStream().use{check(final.compress(Bitmap.CompressFormat.PNG,100,it)){"Falha ao finalizar PNG"}}
        }finally{scaled?.takeIf{it!==source&&it!==cropped}?.recycle();cropped?.takeIf{it!==source}?.recycle();source.recycle()}
    }
    fun save(app:Context,file:File){
        val resolver=app.contentResolver
        val values=ContentValues().apply{put(MediaStore.Images.Media.DISPLAY_NAME,file.name);put(MediaStore.Images.Media.MIME_TYPE,"image/png");put(MediaStore.Images.Media.RELATIVE_PATH,"Pictures/Haruna");put(MediaStore.Images.Media.IS_PENDING,1)}
        val uri=resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,values)?:error("Galeria indisponível")
        try{resolver.openOutputStream(uri).use{out->requireNotNull(out);file.inputStream().use{it.copyTo(out)}};values.clear();values.put(MediaStore.Images.Media.IS_PENDING,0);resolver.update(uri,values,null,null)}catch(e:Exception){resolver.delete(uri,null,null);throw e}
    }
    fun open(app:Context,file:File,share:Boolean){Handler(Looper.getMainLooper()).post {
        runCatching{val uri=FileProvider.getUriForFile(app,app.packageName+".images",file)
            val intent=if(share)Intent(Intent.ACTION_SEND).setType("image/png").putExtra(Intent.EXTRA_STREAM,uri)else Intent(Intent.ACTION_VIEW).setDataAndType(uri,"image/png")
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);intent.clipData=ClipData.newRawUri("Haruna",uri)
            app.startActivity(Intent.createChooser(intent,if(share)"Compartilhar imagem" else "Visualizar imagem").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))}
    }}
}

