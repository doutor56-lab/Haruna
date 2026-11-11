// Node-only regression: real script, simulated DOM; no Android/device claim.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=process.argv[2]||'app/src/main/assets/haruna';
const app=fs.readFileSync(root+'/app.js','utf8');
const syntax=spawnSync(process.execPath,['--check','--input-type=module'],{input:app,encoding:'utf8'});
assert.equal(syntax.status,0,syntax.stderr);
function element(){const classes=new Set();return {attrs:{},events:{},hidden:true,classList:{contains:k=>classes.has(k),toggle(k,on){on?classes.add(k):classes.delete(k)}},setAttribute(k,v){this.attrs[k]=v},addEventListener(k,f){this.events[k]=f}}}
const els=Object.fromEntries(['menu','drawer','scrim','closeMenu'].map(k=>[k,element()]));
const events={},properties={};let wide=false;
const document={getElementById:k=>els[k],documentElement:{style:{setProperty(k,v){properties[k]=v}}},addEventListener(k,f){events[k]=f}};
const window={matchMedia:()=>({matches:wide}),addEventListener(k,f){events[k]=f}};
vm.runInNewContext(fs.readFileSync(root+'/drawer-toggle.js','utf8'),{document,window});
const open=()=>els.drawer.classList.contains('open');
assert.equal(open(),false);
els.menu.events.click();assert(open());assert.equal(els.menu.attrs['aria-expanded'],'true');assert.equal(els.scrim.hidden,false);
els.menu.events.click();assert.equal(open(),false);
els.menu.events.click();els.closeMenu.events.click();assert.equal(open(),false);
els.menu.events.click();els.scrim.events.click();assert.equal(open(),false);
els.menu.events.click();events.keydown({key:'Escape'});assert.equal(open(),false);
wide=true;els.menu.events.click();assert(open());assert(els.scrim.hidden);assert.equal(properties['--haruna-sidebar-width'],'clamp(200px,22vw,240px)');
wide=false;events.resize();assert.equal(els.scrim.hidden,false);
console.log('PASS app syntax; real drawer controller open/close/reopen, close button, scrim, Escape and landscape/portrait synchronization (simulated DOM).');
