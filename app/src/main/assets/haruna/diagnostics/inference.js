// Scalar observations for the existing DBG. No text, IDs in reports, audio or documents.
let prep=null,current=null,discarded=0;
export function discardedStreamEvent(){discarded++}
const clock=()=>performance.now();
export function preparationStarted(){prep={started:clock(),contextMs:null}}
export function contextPrepared(){if(prep)prep.contextMs=clock()-prep.started}
export function requestStarted(id){
 current={id,started:clock(),contextMs:prep?.contextMs??null,clientFirstDeltaMs:null,
  clientFirstDomMs:null,clientFirstVisibleMs:null,clientTotalMs:null,presentationSpanMs:null,
  visualUpdates:0,receivedDeltas:0,outputUtf16:0,firstAck:false,finalAck:false};prep=null;
}
export function deltaReceived(id){
 if(current?.id!==id)return;
 current.receivedDeltas++;
 if(current.clientFirstDeltaMs===null)current.clientFirstDeltaMs=clock()-current.started;
}
function scalars(){
 if(!current)return {};
 return Object.fromEntries(Object.entries(current).filter(([key])=>!['id','started','firstAck','finalAck'].includes(key)));
}
function ack(phase){
 if(!current)return;
 try{window.HarunaDiagnostics?.observePresentation(current.id,JSON.stringify({phase,...scalars()}))}catch{}
}
export function domUpdated(length,visible){
 if(!current||current.finalAck)return;
 const t=clock()-current.started;
 current.visualUpdates++;current.outputUtf16=Math.max(0,length);
 if(current.clientFirstDomMs===null)current.clientFirstDomMs=t;
 if(visible&&current.clientFirstVisibleMs===null){
  current.clientFirstVisibleMs=t;
  if(!current.firstAck){current.firstAck=true;ack('first')}
 }
}
export function presentationFinished(length,visible){
 if(!current||current.finalAck)return;
 domUpdated(length,visible);
 current.clientTotalMs=clock()-current.started;
 if(current.clientFirstVisibleMs!==null)current.presentationSpanMs=current.clientTotalMs-current.clientFirstVisibleMs;
 current.finalAck=true;ack('final');
}
export function inferenceMetrics(){return {...scalars(),discardedStreamEvents:discarded}}
