package android.content
import android.content.res.Configuration
interface ComponentCallbacks2 { fun onTrimMemory(level:Int); fun onLowMemory();fun onConfigurationChanged(newConfig:Configuration);companion object{const val TRIM_MEMORY_RUNNING_LOW=10} }
open class Context {
 val callbacks=mutableSetOf<ComponentCallbacks2>()
 fun getSharedPreferences(name:String,mode:Int)=Preferences()
 fun checkSelfPermission(name:String)=0
 fun getSystemService(name:String):Any=android.app.ActivityManager()
 fun registerComponentCallbacks(c:ComponentCallbacks2){callbacks.add(c)}
 fun unregisterComponentCallbacks(c:ComponentCallbacks2){callbacks.remove(c)}
 companion object{const val MODE_PRIVATE=0;const val ACTIVITY_SERVICE="activity"}
}
class Preferences {fun getFloat(key:String,fallback:Float)=fallback;fun getInt(key:String,fallback:Int)=if(key=="speaker")0 else fallback;fun getString(key:String,fallback:String?)=fallback;fun putInt(key:String,value:Int)=this;fun putFloat(key:String,value:Float)=this;fun putString(key:String,value:String)=this;fun remove(key:String)=this;
fun getBoolean(key:String,fallback:Boolean)=fallback;fun edit()=this;fun putBoolean(key:String,value:Boolean)=this;fun apply(){} }
