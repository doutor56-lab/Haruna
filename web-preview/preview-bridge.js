/* Browser-only UI preview. Does not emulate or run the Android native engines. */
(()=>{
  'use strict';
  const KEY='haruna.web-preview.image-settings';
  const defaults={state:'NOT_INSTALLED',busy:false,imageEngineBusy:false,engineAvailable:false,generationAvailable:false,engine:'Prévia web: motor nativo indisponível',engineKind:'safetensors',previewSupported:false,showPreviews:false,performanceSupported:false,performance:'balanced',selected:null,loaded:null,models:[],generation:{},nativeProgress:[0,0,0],width:256,height:256,resolution:256,steps:5,cfg:5,clipSkip:2,sampler:'euler',scheduler:'discrete',seed:-1,negativePrompt:'',lowMemory:true,autoSave:false,batchCount:1,maxBatch:4,nativeGrid:32};
  let settings={...defaults};
  try{
    const previous=JSON.parse(localStorage.getItem(KEY)||'{}');
    for(const key of ['width','height','resolution','steps','cfg','clipSkip','sampler','scheduler','seed','negativePrompt','lowMemory','autoSave','batchCount','showPreviews'])if(Object.hasOwn(previous,key))settings[key]=previous[key];
  }catch{}
  const unavailable=()=>window.alert('A geração de imagens e a importação de modelos dependem do aplicativo Android. Esta página é apenas uma prévia da interface.');
  const status=()=>JSON.stringify(settings);
  const configure=raw=>{
    try{
      const value=typeof raw==='string'?JSON.parse(raw):raw;
      if(!value||typeof value!=='object')throw Error('Configuração inválida');
      for(const key of ['width','height','resolution','steps','cfg','clipSkip','sampler','scheduler','seed','negativePrompt','lowMemory','autoSave','batchCount','showPreviews','performance'])
        if(Object.hasOwn(value,key))settings[key]=value[key];
      localStorage.setItem(KEY,JSON.stringify(settings));
      return JSON.stringify({status:'ok'});
    }catch(error){return JSON.stringify({status:'error',error:String(error.message||error)})}
  };
  window.HarunaImages={status,configure,add:unavailable,select:unavailable,load:unavailable,unload:unavailable,remove:unavailable,cancel:()=>{},generate:()=>{unavailable();return false},cancelGeneration:()=>{},result:()=>JSON.stringify({}),save:unavailable,saveBatch:unavailable,open:unavailable};
  try{localStorage.setItem('haruna_onboarding_v1','done')}catch{}
  const banner=document.createElement('aside');
  banner.setAttribute('role','status');
  banner.className='haruna-web-preview-banner';
  banner.textContent='PRÉVIA WEB • Interface de testes — sem GGUF, voz ou geração de imagens';
  const addBanner=()=>document.body.prepend(banner);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addBanner,{once:true});
  else addBanner();
})();