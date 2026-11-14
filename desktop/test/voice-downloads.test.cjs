'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const models=require('../src/voice-models.cjs'),{Voice}=require('../src/voice.cjs');
test('official multilingual ranks accept final = marker and reject corrupt/English vocabulary',()=>{
 const ranks=Array.from({length:50257},(_,i)=>(i===50256?'=':'YQ==')+' '+i);
 assert(models.hasPortuguese(ranks.join('\n')));
 assert(models.hasPortuguese('<|pt|> 1\n<|startoftranscript|> 2'));
 assert(!models.hasPortuguese(ranks.slice(0,50256).join('\n')));
 const duplicate=[...ranks];duplicate[1]='YQ== 0';assert(!models.hasPortuguese(duplicate.join('\n')));
 const wrongMarker=[...ranks];wrongMarker[12]='= 12';assert(!models.hasPortuguese(wrongMarker.join('\n')));
 const invalid=[...ranks];invalid[1]='??? 1';assert(!models.hasPortuguese(invalid.join('\n')));
 assert(!models.hasPortuguese(Array(50257).fill('not a vocabulary').join('\n')));
});
test('voice installation remains busy through cleanup, ignores another motor cancel, and survives playback stop (fake installer)',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'haruna-download-')),original=models.install,events=[];
 const voice=new Voice(root,e=>events.push(e),'unused-vad');let release,signal;
 models.install=async(r,s,file,abort,progress)=>{signal=abort;progress('downloading',25,100);await new Promise(resolve=>release=resolve);abort.throwIfAborted();};
 try{
  const pending=voice.install('stt',models.catalog[0].id);
  assert.equal(voice.status('stt').installing,true);assert.equal(voice.status('stt').installingModel,'Whisper Tiny');
  voice.stop();voice.stopTts();assert.equal(voice.status('stt').state,'downloading');
  voice.cancelInstallation('tts');assert.equal(signal.aborted,false);
  voice.cancelInstallation('stt');assert.equal(signal.aborted,true);release();await pending;
  assert.equal(voice.status('stt').installing,false);assert.equal(voice.status('stt').state,'cancelled');
  assert.equal(events.at(-1).status.installing,false);
  const completed=voice.install('tts');release();await completed;
  assert.equal(voice.status('tts').state,'installed');assert.equal(voice.status('tts').installing,false);
 }finally{models.install=original;voice.close();fs.rmSync(root,{recursive:true,force:true});}
});
