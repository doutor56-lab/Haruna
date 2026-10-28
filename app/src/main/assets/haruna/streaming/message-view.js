import {ThinkParser} from './think-parser.js';

/** One active bubble, one RAF, one checkpoint timer. No whole-response work on a chunk. */
export function createMessageView({bubble,container,onVisual,checkpoint,checkpointMs=2000}){
 const parser=new ThinkParser();
 let frame=null,timer=null,queued=[],reset=false,node=null,closed=false,dirty=false;
 let follow=container.scrollHeight-container.clientHeight-container.scrollTop<=48;
 const scroll=()=>{follow=container.scrollHeight-container.clientHeight-container.scrollTop<=48};
 container.addEventListener('scroll',scroll,{passive:true});
 function flush(){
  if(frame!==null){cancelAnimationFrame(frame);frame=null}
  if(closed||(!reset&&!queued.length))return;
  if(!bubble.isConnected){queued=[];reset=false;return}
  if(!node){bubble.textContent='';node=document.createTextNode('');bubble.appendChild(node)}
  if(reset)node.data='';
  if(queued.length)node.appendData(queued.join(''));
  queued=[];reset=false;
  if(follow)container.scrollTop=container.scrollHeight;
  onVisual(parser.rawLength,parser.length>0);
 }
 function accept(change){
  if(change.reset){queued=[];reset=true}
  if(change.append)queued.push(change.append);
  if((reset||queued.length)&&frame===null)frame=requestAnimationFrame(flush);
 }
 function save(){
  if(timer!==null){clearTimeout(timer);timer=null}
  if(!dirty)return;
  try{checkpoint(parser.snapshot());dirty=false}catch{/* Mandatory final persistence reports storage errors. */}
 }
 const pagehide=()=>save();
 const visibility=()=>{if(document.visibilityState==='hidden')save()};
 window.addEventListener('pagehide',pagehide);
 document.addEventListener('visibilitychange',visibility);
 return {
  push(delta){
   if(closed)return;
   accept(parser.feed(delta));dirty=true;
   if(timer===null)timer=setTimeout(save,checkpointMs);
  },
  finish(){
   if(closed)return {text:parser.snapshot(),follow};
   accept(parser.finish());flush();closed=true;
   if(frame!==null)cancelAnimationFrame(frame);
   if(timer!==null)clearTimeout(timer);
   container.removeEventListener('scroll',scroll);
   window.removeEventListener('pagehide',pagehide);
   document.removeEventListener('visibilitychange',visibility);
   queued=[];
   return {text:parser.snapshot(),follow};
  }
 };
}
