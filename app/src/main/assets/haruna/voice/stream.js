import {ThinkParser} from '../streaming/think-parser.js';

/** Natural, bounded text segments. No audio buffer and no native/UI backpressure on the LLM. */
export class SentenceQueue {
 constructor(send,{minimum=48,maximum=280}={}){this.send=send;this.minimum=minimum;this.maximum=maximum;this.buffer='';this.ended=false}
 push(text){if(this.ended||!text)return;this.buffer+=text;this.flush(false)}
 reset(){this.buffer=''}
 flush(final){
  while(this.buffer.length){
   let end=0;
   for(const match of this.buffer.matchAll(/[.!?;:]["'”»)]*\s+|\n\s*\n/g)){
    const point=match.index+match[0].length;
    if(point<this.minimum)continue;
    if(point>this.maximum)break;
    const previous=this.buffer.slice(0,match.index).match(/([\p{L}.]+)$/u)?.[1]||'';
    if(match[0][0]==='.'&&(/^(sr|sra|srta|dr|dra|prof|profa|etc|ex|p\.ex)$/i.test(previous)||previous.length===1))continue;
    end=point;break;
   }
   if(!end&&this.buffer.length>this.maximum){const space=this.buffer.lastIndexOf(' ',this.maximum);end=space>40?space+1:this.maximum;if(/[\uD800-\uDBFF]/.test(this.buffer[end-1]))end--}
   if(!end&&final)end=this.buffer.length;
   if(!end)break;
   const value=this.buffer.slice(0,end).trim();this.buffer=this.buffer.slice(end);
   if(value)this.send(value);
  }
 }
 finish(){if(this.ended)return;this.flush(true);this.ended=true}
}

/** Reuses the chat markup parser; known thinking is held until its close marker or final text. */
export class SpeechStream {
 constructor({send,reset=()=>{},onError=()=>{}}){this.parser=new ThinkParser();this.queue=new SentenceQueue(send);this.resetNative=reset;this.onError=onError;this.guard=null;this.tail='';this.ended=false;this.sent=0;
  this.queue.send=value=>{send(value);this.sent++};}
 protect(action){if(this.ended)return;try{action()}catch(error){this.ended=true;this.queue.reset();this.onError(error)}}
 push(delta,thinking=false){this.protect(()=>{
  if(this.guard===null)this.guard=thinking;
  const closed=(this.tail+delta).toLowerCase().includes('</think>');this.tail=(this.tail+delta).slice(-7);
  const change=this.parser.feed(delta);
  if(change.reset){this.queue.reset();if(this.sent){this.resetNative();this.sent=0}}
  if(this.guard){if(!closed)return;this.guard=false;this.queue.push(this.parser.snapshot())}
  else this.queue.push(change.append);
 })}
 finish(finalText){this.protect(()=>{
  if(this.guard||this.parser.rawLength===0){this.queue.reset();this.queue.push(finalText||'')}
  else this.queue.push(this.parser.finish().append);
  this.queue.finish();this.ended=true;
 })}
 cancel(){this.ended=true;this.queue.reset()}
}
