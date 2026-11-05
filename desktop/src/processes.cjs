'use strict';
const {spawn}=require('node:child_process');const fs=require('node:fs');const path=require('node:path');
function launch(exe,args,options={}){
 const child=spawn(exe,args,{cwd:path.dirname(exe),windowsHide:true,shell:false,stdio:['ignore','pipe','pipe'],...options});
 // Always consume the failure before publishing the child to callers.
 const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});
 done.catch(()=>{});return{child,done};
}
async function stop(process){if(!process)return;if(process.child.exitCode!==null||process.child.signalCode)return;process.child.kill();await Promise.race([process.done.catch(()=>{}),new Promise((_,reject)=>setTimeout(()=>reject(Error('O processo nativo não encerrou.')),10000).unref())]);}
async function probe(exe,args,timeout=20000){let text='';const p=launch(exe,args);const add=b=>{if(text.length<65536)text+=b.toString().slice(0,65536-text.length);};p.child.stdout.on('data',add);p.child.stderr.on('data',add);const timer=setTimeout(()=>p.child.kill(),timeout);try{const result=await p.done;if(result.code!==0)throw Error('O runtime não pôde ser iniciado neste computador.');return text;}finally{clearTimeout(timer);}}
function pngDimensions(file){const fd=fs.openSync(file,'r');try{const b=Buffer.alloc(24);if(fs.readSync(fd,b,0,24,0)!==24||!b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||b.toString('ascii',12,16)!=='IHDR')throw Error('O motor não produziu um PNG válido.');return{width:b.readUInt32BE(16),height:b.readUInt32BE(20)};}finally{fs.closeSync(fd);}}
module.exports={launch,stop,probe,pngDimensions};
