// A short offline tone; no speech model or sound download. Failure must not block a call.
export class TurnCue {
 constructor(){this.context=null;this.source=null;this.closed=false;this.ticket=0}
 async unlock(){
  if(this.closed)return false;
  try{const Context=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Context)return false;
   this.context??=new Context();if(this.context.state==='suspended')await this.context.resume();return !this.closed&&this.context.state==='running';
  }catch{return false}
 }
 async play(volume=1){
  const ticket=++this.ticket;
  if(!await this.unlock()||this.closed||this.ticket!==ticket)return;
  const level=Math.max(0,Math.min(1,Number(volume)||0));if(!level)return;
  try{const context=this.context,source=context.createOscillator(),gain=context.createGain(),at=context.currentTime;
   this.source?.stop();this.source=source;source.type='sine';source.frequency.value=880;
   gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.07*level,at+.008);gain.gain.linearRampToValueAtTime(0,at+.08);
   source.connect(gain);gain.connect(context.destination);source.onended=()=>{source.disconnect();gain.disconnect();if(this.source===source)this.source=null};source.start(at);source.stop(at+.085);
  }catch{/* A device without audio feedback can still listen. */}
 }
 cancel(){this.ticket++;try{this.source?.stop()}catch{}this.source=null}
 close(){this.cancel();this.closed=true;try{this.context?.close().catch(()=>{})}catch{}this.context=null}
}
