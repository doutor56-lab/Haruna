// Adapted from the user-provided Haruna Voice Orb reference.
// Decorative flow only: no microphone, audio analysis, synthetic voice level or global hooks.
const TAU=Math.PI*2,POINTS=72;
const ACTIVE=new Set(['listening','thinking','speaking']);
const BLOBS=[
 {color:'67,56,202',distance:.40,rx:.95,ry:.45,speed:.65,phase:0,alpha:.85,blend:'source-over'},
 {color:'139,45,211',distance:.44,rx:.85,ry:.40,speed:-.55,phase:3,alpha:.72,blend:'source-over'},
 {color:'216,180,255',distance:.33,rx:.74,ry:.30,speed:.85,phase:1.5,alpha:.65,blend:'screen'},
 {color:'249,239,255',distance:.38,rx:.55,ry:.24,speed:-.7,phase:5,alpha:.60,blend:'screen'}
];
export class VoiceOrb{
 constructor(host){
  this.host=host;this.canvas=document.createElement('canvas');this.canvas.className='voice-orb-paint';this.canvas.setAttribute('aria-hidden','true');
  this.visible=false;this.disposed=false;this.raf=0;this.timer=0;this.state='idle';this.level=0;this.target=0;this.time=0;this.last=0;this.radii=new Float32Array(POINTS+1);
  try{this.ctx=this.canvas.getContext('2d',{alpha:true})}catch{this.ctx=null}
  if(!this.ctx){host.dataset.orbRenderer='css';return}
  this.media=window.matchMedia('(prefers-reduced-motion: reduce)');
  this.visibilityChanged=()=>{this.stop();this.queue(true)};
  document.addEventListener('visibilitychange',this.visibilityChanged);this.media.addEventListener?.('change',this.visibilityChanged);
  this.resizeObserver=new ResizeObserver(()=>{this.fit();this.queue(true)});this.resizeObserver.observe(host);
  host.append(this.canvas);host.classList.add('orb-canvas-ready');host.dataset.orbRenderer='canvas';
 }
 canRender(){return !!this.ctx&&!this.disposed&&this.visible&&!document.hidden}
 animated(){return ACTIVE.has(this.state)&&!this.media.matches}
 fit(){
  const width=this.host.clientWidth;if(!width||!this.ctx||this.disposed)return;
  const side=Math.min(320,Math.max(128,Math.round(width*1.24*Math.min(window.devicePixelRatio||1,1.25))));
  if(this.canvas.width===side&&this.canvas.height===side)return;
  this.canvas.width=this.canvas.height=side;this.size=side;const x=this.ctx,r=side*.4;x.save();x.translate(side/2,side/2);
  this.halo=x.createRadialGradient(0,0,r*.7,0,0,r*1.24);this.halo.addColorStop(0,'rgba(139,92,246,.18)');this.halo.addColorStop(1,'rgba(139,92,246,0)');
  this.base=x.createRadialGradient(-r*.08,r*.25,r*.04,0,0,r*1.15);this.base.addColorStop(0,'#eee4ff');this.base.addColorStop(.36,'#b79aff');this.base.addColorStop(.7,'#7440d6');this.base.addColorStop(1,'#2b1265');
  this.edge=x.createRadialGradient(0,-r*.1,r*.5,0,0,r*1.1);this.edge.addColorStop(0,'rgba(15,4,40,0)');this.edge.addColorStop(1,'rgba(15,4,40,.48)');x.restore();
 }
 setVisible(value){this.visible=!!value;this.stop();if(this.visible){this.fit();this.queue(true)}}
 setPhase(phase){
  const state=['starting','transcribing'].includes(phase)?'thinking':ACTIVE.has(phase)?phase:'idle';
  if(this.state===state)return;this.state=state;this.level=this.target=0;this.stop();this.queue(true);
 }
 setLevel(value){
  this.target=['listening','speaking'].includes(this.state)&&Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;
  if(this.media&&!this.media.matches&&ACTIVE.has(this.state))this.queue();
 }
 queue(immediate=false){
  if(!this.canRender()||this.raf||this.timer)return;
  const run=()=>{this.raf=requestAnimationFrame(now=>{this.raf=0;if(!this.canRender())return;try{this.draw(now)}catch{this.destroy();return}if(this.animated())this.queue()})};
  if(immediate)run();else this.timer=setTimeout(()=>{this.timer=0;run()},this.state==='thinking'?80:50);
 }
 stop(){if(this.raf)cancelAnimationFrame(this.raf);clearTimeout(this.timer);this.raf=this.timer=0;this.last=0}
 draw(now){
  if(!this.size)return;
  const dt=this.last?Math.min(.1,(now-this.last)/1000):0;this.last=now;if(!this.media.matches)this.time+=dt;
  this.level+=(this.target-this.level)*.25;const L=this.media.matches?0:this.level,t=this.time,W=this.size,R=W*.4,x=this.ctx;
  x.clearRect(0,0,W,W);x.save();x.translate(W/2,W/2);x.fillStyle=this.halo;x.fillRect(-W/2,-W/2,W,W);
  for(let i=0;i<=POINTS;i++){
   const a=i/POINTS*TAU,wave=Math.sin(3*a+t*1.6)*.55+Math.sin(5*a-t*1.2)*.25+Math.sin(2*a+t*.8)*.2;
   this.radii[i]=R*(1+wave*(.005+.045*L+(this.state==='thinking'?.01:0)));
  }
  const outline=()=>{x.beginPath();for(let i=0;i<=POINTS;i++){const a=i/POINTS*TAU,px=Math.cos(a)*this.radii[i],py=Math.sin(a)*this.radii[i];if(i)x.lineTo(px,py);else x.moveTo(px,py)}x.closePath()};
  outline();x.fillStyle=this.base;x.fill();x.save();x.clip();
  for(const b of BLOBS){
   const angle=t*b.speed*.45+b.phase,d=R*b.distance,rx=R*b.rx;
   x.save();x.translate(Math.cos(angle)*d,Math.sin(angle*1.25)*d);x.rotate(angle*.65+b.phase);x.scale(1,b.ry/b.rx);x.globalCompositeOperation=b.blend;
   const g=x.createRadialGradient(0,0,0,0,0,rx);g.addColorStop(0,`rgba(${b.color},${b.alpha})`);g.addColorStop(.55,`rgba(${b.color},${b.alpha*.35})`);g.addColorStop(1,`rgba(${b.color},0)`);
   x.fillStyle=g;x.beginPath();x.arc(0,0,rx,0,TAU);x.fill();x.restore();
  }
  x.fillStyle=this.edge;x.fillRect(-R*1.2,-R*1.2,R*2.4,R*2.4);
  const light=x.createRadialGradient(-R*.2,-R*.5,0,-R*.2,-R*.5,R*.65);light.addColorStop(0,'rgba(255,255,255,.35)');light.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=light;x.fillRect(-R,-R,R*2,R*2);x.restore();
  outline();let rim='rgba(216,190,255,.5)';if(x.createConicGradient){rim=x.createConicGradient(t*.25,0,0);rim.addColorStop(0,'rgba(255,255,255,.62)');rim.addColorStop(.3,'rgba(167,139,250,.18)');rim.addColorStop(.6,'rgba(233,176,255,.5)');rim.addColorStop(1,'rgba(255,255,255,.62)')}
  x.strokeStyle=rim;x.lineWidth=Math.max(1,W*.003);x.stroke();x.restore();
 }
 destroy(){
  if(this.disposed)return;this.stop();this.disposed=true;this.resizeObserver?.disconnect();
  if(this.visibilityChanged){document.removeEventListener('visibilitychange',this.visibilityChanged);this.media?.removeEventListener?.('change',this.visibilityChanged)}
  this.canvas.remove();this.canvas.width=this.canvas.height=0;this.host.classList.remove('orb-canvas-ready');this.host.dataset.orbRenderer='css';this.ctx=null;this.halo=this.base=this.edge=null;
 }
}
