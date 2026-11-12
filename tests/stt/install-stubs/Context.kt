package android.content
import java.io.File
class Context(val filesDir:File){val contentResolver=Resolver();private val preferences=Preferences();fun getSharedPreferences(n:String,m:Int)=preferences;companion object{const val MODE_PRIVATE=0}}
class Preferences{private val values=mutableMapOf<String,String>();fun getString(k:String,d:String?)=values[k]?:d;fun edit()=this;fun putString(k:String,v:String):Preferences{values[k]=v;return this};fun commit()=true}
class Resolver{fun query(uri:android.net.Uri,p:Array<String>,s:String?,a:Array<String>?,o:String?)=Cursor(uri.file);fun openInputStream(uri:android.net.Uri)=uri.file.inputStream()}
class Cursor(val file:File):AutoCloseable{fun moveToFirst()=true;fun isNull(n:Int)=false;fun getLong(n:Int)=file.length();override fun close(){}}
