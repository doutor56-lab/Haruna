// Actual renderer with deterministic DOM/canvas/scheduler doubles; no neural/audio claim.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const file=path.resolve(process.argv[2]||'app/src/main/assets/haruna/voice/orb.js');
 assert(!/getUserMedia|AudioContext|fetch\(|setInterval|textContent|innerHTML/.test(fs.readFileSync(file,'utf8')));
 const {VoiceOrb}=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(file,'utf8')).toString('base64'));
 const keys=['window','document','ResizeObserver','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout'];const old=Object.fromEntries(keys.map(k=>[k,global[k]]));
 let now=0,id=0,draws=0,available=true;const raf=new Map(),timers=new Map(),visibility=new Set(),changes=new Set();
 const context=new Proxy({clearRect(){draws++},createRadialGradient:()=>({addColorStop(){}}),createConicGradient:()=>({addColorStop(){}})},{get:(o,k)=>k in o?o[k]:()=>{}});
 const media={matches:false,addEventListener:(n,f)=>changes.add(f),removeEventListener:(n,f)=>changes.delete(f)};
 function host(){const classes=new Set();return {clientWidth:240,dataset:{},children:[],classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k)},append(c){this.children.push(c);c.parent=this}}}
 global.window={devicePixelRatio:4,matchMedia:()=>media};
 global.document={hidden:false,addEventListener:(n,f)=>visibility.add(f),removeEventListener:(n,f)=>visibility.delete(f),createElement(tag){assert.equal(tag,'canvas');return {width:300,height:150,setAttribute(){},getContext:()=>available?context:null,remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this)}}}};
 global.ResizeObserver=class{constructor(cb){this.callback=cb}observe(){}disconnect(){this.disconnected=true}};
 global.requestAnimationFrame=f=>{raf.set(++id,f);return id};global.cancelAnimationFrame=i=>raf.delete(i);
 global.setTimeout=(f,ms)=>{timers.set(++id,{f,due:now+ms});return id};global.clearTimeout=i=>timers.delete(i);
 const flush=()=>{const todo=[...raf.values()];raf.clear();for(const f of todo)f(now)};
 const tick=ms=>{now+=ms;for(const [k,v]of [...timers])if(v.due<=now){timers.delete(k);v.f()}flush()};
 try{
  const h=host(),r=new VoiceOrb(h);r.setVisible(true);flush();assert.equal(h.dataset.orbRenderer,'canvas');assert(r.canvas.width<=320);assert.equal(r.canvas.width,r.canvas.height);
  const idle=draws;tick(500);assert.equal(draws,idle);assert.equal(timers.size+raf.size,0);
  r.setPhase('listening');for(let i=0;i<30;i++)r.setLevel(.7);assert(raf.size+timers.size<=1);flush();const start=draws;for(let i=0;i<20;i++)tick(50);assert(draws-start<=20);assert(r.level>.6&&r.level<.71);
  r.setPhase('speaking');flush();for(let i=0;i<10;i++)tick(50);assert.equal(r.level,0);assert.equal(r.target,0); // no fabricated audio amplitude
  r.setLevel(2);assert.equal(r.target,1);r.setLevel(NaN);assert.equal(r.target,0);r.setLevel(-1);assert.equal(r.target,0);
  r.setVisible(false);const mini=draws;tick(1000);assert.equal(draws,mini);assert.equal(raf.size+timers.size,0);r.setVisible(true);flush();
  document.hidden=true;for(const f of visibility)f();const hidden=draws;tick(1000);assert.equal(draws,hidden);document.hidden=false;for(const f of visibility)f();flush();
  media.matches=true;for(const f of changes)f();flush();const reduced=draws;r.setLevel(.8);tick(500);assert.equal(draws,reduced);assert.equal(raf.size+timers.size,0);
  media.matches=false;for(const f of changes)f();flush();r.destroy();assert.equal(h.children.length,0);assert.equal(r.canvas.width,0);assert.equal(r.ctx,null);assert(r.resizeObserver.disconnected);assert.equal(visibility.size+changes.size+raf.size+timers.size,0);
  available=false;const fallbackHost=host(),fallback=new VoiceOrb(fallbackHost);fallback.setVisible(true);fallback.setPhase('listening');fallback.setLevel(.8);assert.equal(fallbackHost.dataset.orbRenderer,'css');assert.equal(fallbackHost.children.length,0);fallback.destroy();assert.equal(visibility.size+changes.size+raf.size+timers.size,0);
  console.log('PASS real orb: bounded buffer and cadence, actual-level-only deformation, idle/mini/background/reduced-motion pause, cleanup and CSS fallback (DOM/canvas doubles).');
 }finally{for(const k of keys)if(old[k]===undefined)delete global[k];else global[k]=old[k]}
})().catch(e=>{console.error(e);process.exit(1)});
