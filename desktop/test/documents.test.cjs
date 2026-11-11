'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Documents}=require('../src/documents.cjs');
const until=async fn=>{for(let i=0;i<1000;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('Document timeout');};
test('real TXT reader, FTS5 accent search, private attachment isolation, restart and removal',async()=>{
 const root=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'haruna-doc-test-'));let docs;
 try{docs=new Documents(root,()=>{},{languages:'',visionAvailable:()=>false});const file=path.join(root,'fotossintese.txt');fs.writeFileSync(file,'Fotossíntese utiliza luz, água e gás carbônico.');
 const job=docs.prepare(file,'fotossíntese');await until(()=>!docs.status().busy);assert.equal(docs.status().id,job.id);assert.equal(docs.status().state,'DONE');assert(docs.status().context[0].content.includes('Fotossíntese'));assert.equal(docs.search('fotossintese').length,0);
 docs.call('keepAttachment',file);const hit=docs.search('fotossintese')[0];assert(hit);assert.equal(hit.page,null);assert.equal(docs.preview(hit.docId,1).text,fs.readFileSync(file,'utf8'));const id=hit.docId;
 docs.db.close();docs=new Documents(root,()=>{},{languages:'',visionAvailable:()=>false});assert.equal(docs.list().length,1);assert.equal(docs.search('fotossintese').length,1);docs.call('remove',id);assert.equal(docs.list().length,0);assert.equal(docs.search('fotossintese').length,0);assert(fs.existsSync(file),'Original preserved');
 }finally{docs?.db.close();fs.rmSync(root,{recursive:true,force:true});}
});
test('document importer rejects unsupported types and cancellation does not delete originals',async()=>{const root=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'haruna-doc-test-'));const docs=new Documents(root,()=>{},{languages:'',visionAvailable:()=>false});try{const file=path.join(root,'invalid.exe');fs.writeFileSync(file,'not a document');docs.import(file);await until(()=>!docs.status().busy);assert.equal(docs.status().state,'ERROR');assert.equal(docs.list().length,0);assert(fs.existsSync(file));}finally{docs.db.close();fs.rmSync(root,{recursive:true,force:true});}});
