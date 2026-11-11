'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const fs=require('node:fs'),path=require('node:path');
let cancelled=false,ocr=null;
parentPort.on('message',m=>{if(m==='cancel'){cancelled=true;ocr?.terminate();}});
const check=()=>{if(cancelled)throw Error('cancelled');};
const page=(section,number,kind,text)=>{check();parentPort.postMessage({type:'page',section,page:number,kind,text});};
async function recognize(image){check();if(!ocr){const {createWorker,OEM}=require('tesseract.js');ocr=await createWorker(['por','eng'],OEM.LSTM_ONLY,{langPath:workerData.languages,gzip:false,cacheMethod:'none',logger:()=>{}});}check();return (await ocr.recognize(image)).data.text;}
async function pdf(renderOnly=false){
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const sdk=path.dirname(require.resolve('pdfjs-dist/package.json'));
 const task=getDocument({data:new Uint8Array(await fs.promises.readFile(workerData.file)),isEvalSupported:false,useSystemFonts:true,cMapUrl:path.join(sdk,'cmaps')+path.sep,cMapPacked:true,standardFontDataUrl:path.join(sdk,'standard_fonts')+path.sep,wasmUrl:path.join(sdk,'wasm')+path.sep,disableFontFace:true});
 let doc;try{doc=await task.promise;check();const numbers=renderOnly?[workerData.page]:Array.from({length:doc.numPages},(_,i)=>i+1);
 for(const n of numbers){check();const p=await doc.getPage(n);try{let text='';if(!renderOnly){const content=await p.getTextContent();text=content.items.map(i=>i.str+(i.hasEOL?'\n':' ')).join('').trim();}
  if(renderOnly||text.replace(/[^\p{L}\p{N}]/gu,'').length<32){const viewport=p.getViewport({scale:Math.min(3,Math.min(renderOnly?1400:2400,2400)/Math.max(p.view[2]-p.view[0],p.view[3]-p.view[1]))});const factory=new doc.canvasFactory.constructor({});const {canvas,context}=factory.create(Math.max(1,Math.floor(viewport.width)),Math.max(1,Math.floor(viewport.height)));
   try{await p.render({canvasContext:context,viewport}).promise;check();const png=canvas.toBuffer('image/png');if(renderOnly){await fs.promises.writeFile(workerData.output,png);parentPort.postMessage({type:'rendered'});}else{const scanned=await recognize(png);page(n,n,'ocr',scanned.length>text.length?scanned:text);}}finally{factory.destroy({canvas,context});}
  }else page(n,n,'pdf_text',text);
  parentPort.postMessage({type:'progress',completed:n,total:doc.numPages});
 }finally{p.cleanup();}}
 return doc.numPages;
 }finally{await task.destroy();}
}
(async()=>{let pages=0;
 if(workerData.format==='pdf')pages=await pdf(!!workerData.render);
 else if(workerData.format==='image')page(1,null,'ocr',await recognize(workerData.file));
 else{const h=await fs.promises.open(workerData.file,'r');try{const sample=Buffer.alloc(65536);const {bytesRead}=await h.read(sample,0,sample.length,0);const b=sample.subarray(0,bytesRead);let charset='utf-8';if(b[0]===255&&b[1]===254)charset='utf-16le';else if(b[0]===254&&b[1]===255)charset='utf-16be';else{try{new TextDecoder('utf-8',{fatal:true}).decode(b,{stream:true});}catch{charset='windows-1252';}}
 const decoder=new TextDecoder(charset);let pending='',section=0;for await(const bytes of fs.createReadStream(workerData.file,{highWaterMark:8192})){check();pending+=decoder.decode(bytes,{stream:true});while(pending.length>=6000){let end=6000;if(/[\uD800-\uDBFF]/.test(pending[end-1]))end--;page(++section,null,'text:'+charset,pending.slice(0,end));pending=pending.slice(end);}}pending+=decoder.decode();if(pending)page(++section,null,'text:'+charset,pending);}
 finally{await h.close();}}
 check();parentPort.postMessage({type:'done',pages});
})().catch(()=>{parentPort.postMessage({type:'error',cancelled});}).finally(async()=>{await ocr?.terminate();parentPort.close();});
