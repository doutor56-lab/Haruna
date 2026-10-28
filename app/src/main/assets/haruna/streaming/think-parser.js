// Incremental, bounded marker look-behind. This is markup handling, never a repetition filter.
const OPEN='<think>',CLOSE='</think>';
export class ThinkParser{
 constructor(){this.tail='';this.hidden=false;this.parts=[];this.length=0;this.rawLength=0;this.leading=true;this.ended=false}
 feed(delta){
  if(this.ended)return {append:'',reset:false};
  this.rawLength+=delta.length;
  const text=this.tail+delta;this.tail='';let at=0,append='',reset=false;
  const visible=s=>{
   if(this.hidden||!s)return;
   if(this.leading){s=s.trimStart();if(s)this.leading=false}
   if(s){this.parts.push(s);this.length+=s.length;append+=s}
  };
  while(at<text.length){
   const next=text.indexOf('<',at);
   if(next<0){visible(text.slice(at));break}
   visible(text.slice(at,next));at=next;
   const rest=text.slice(at,at+CLOSE.length).toLowerCase();
   if(rest.startsWith(OPEN)){this.hidden=true;at+=OPEN.length;continue}
   if(rest.startsWith(CLOSE)){
    // Some templates open thinking before generation; an orphan closing marker
    // ends that implicit block, as the previous preview did. Never inspect prose.
    if(!this.hidden){this.parts=[];this.length=0;append='';reset=true;this.leading=true}
    this.hidden=false;at+=CLOSE.length;continue;
   }
   if(OPEN.startsWith(rest)||CLOSE.startsWith(rest)){this.tail=text.slice(at);break}
   visible('<');at++;
  }
  return {append,reset};
 }
 snapshot(){return this.parts.join('')}
 finish(){
  if(this.ended)return {append:'',reset:false};
  let append=this.hidden?'':this.tail;this.tail='';
  if(this.leading){append=append.trimStart();if(append)this.leading=false}
  if(append){this.parts.push(append);this.length+=append.length}
  this.ended=true;return {append,reset:false};
 }
}
