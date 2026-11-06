package com.proxyslabs.haruna.image
import org.junit.Test
import org.junit.Assert.*
import org.json.JSONObject
class ImageOptionsTest {
    private val base=ImageOptions(1024,1024,28,5.0,2,"euler","discrete",-1,"",true,1024)
    @Test fun alignsNativeGridWithoutChangingOutput(){val p=base.updated(JSONObject("{\"width\":840,\"height\":1400,\"cfg\":6.5,\"seed\":424242}"),"safetensors");assertEquals(840,p.width);assertEquals(1400,p.height);assertEquals(864,p.nativeWidth(true));assertEquals(1408,p.nativeHeight(true));assertEquals(6.5,p.cfg,0.0);assertEquals(424242L,p.seed);assertEquals(0,p.legacySide)}
    @Test fun sd15UsesItsOwnUnetGrid(){val p=base.copy(nativeGrid=64).updated(JSONObject("{\"width\":840,\"height\":1400}"),"safetensors");assertEquals(896,p.nativeWidth(true));assertEquals(1408,p.nativeHeight(true))}
    @Test fun keepsExistingSquareGenerationWhenOnlySamplerChanges(){val p=base.updated(JSONObject("{\"cfg\":7}"),"safetensors");assertEquals(1024,p.legacySide);assertEquals(1024,p.nativeWidth(true));assertEquals(2048,base.updated(JSONObject("{\"resolution\":2048}"),"safetensors").nativeWidth(true))}
    @Test fun rejectsInvalidNativeOptions(){for(raw in listOf("{\"width\":841}","{\"height\":4096}","{\"cfg\":0}","{\"cfg\":\"NaN\"}","{\"seed\":1.5}","{\"steps\":101}","{\"clipSkip\":0}","{\"sampler\":\"fake\"}"))assertThrows(IllegalArgumentException::class.java){base.updated(JSONObject(raw),"safetensors")}}
    @Test fun mnnRetainsFixedGraphAndOwnSampler(){val m=ImageOptions(256,256,5,7.5,-1,"default","default",-1,"",false,512);val p=m.updated(JSONObject("{\"width\":288,\"height\":512,\"cfg\":6}"),"mnn");assertEquals(512,p.nativeWidth(false));assertEquals(512,p.nativeHeight(false));for(raw in listOf("{\"width\":768}","{\"negativePrompt\":\"text\"}","{\"sampler\":\"euler\"}"))assertThrows(IllegalArgumentException::class.java){m.updated(JSONObject(raw),"mnn")}}
}
