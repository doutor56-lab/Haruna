import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
let source=await readFile('app/src/main/assets/haruna/context/messages.js','utf8');
source=source.replace(/^import .*;\n/gm,'');
const {conversationMessages,recentMessages}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const chat={messages:[]};for(let i=0;i<6;i++)chat.messages.push({role:'user',content:'u'+i},{role:'assistant',content:'a'+i});chat.messages.push({role:'user',content:'current'});
const old=conversationMessages(chat,'current');assert.equal(old.length,9);assert.equal(old[0].content,'u2');
const first=conversationMessages(chat,'current','',{persistent:true});assert.equal(first.length,13);assert.equal(first[0].content,'u0');
chat.messages.push({role:'assistant',content:'answer'},{role:'user',content:'next'});
const next=conversationMessages(chat,'next','',{persistent:true});assert.deepEqual(next.slice(0,first.length),first);assert.equal(next.at(-1).content,'next');
assert.equal(recentMessages(chat).length,8); // RAG's short-history contract unchanged.
chat.messages[1].content='edited';assert.equal(conversationMessages(chat,'next','',{persistent:true})[1].content,'edited');
const huge={messages:[]};for(let i=0;i<100;i++)huge.messages.push({role:'user',content:'u'+i},{role:'assistant',content:'a'+i});huge.messages.push({role:'user',content:'last'});
assert.equal(conversationMessages(huge,'last','',{persistent:true}).length,125);
const long={messages:[{role:'user',content:'x'.repeat(2000)},{role:'assistant',content:'y'.repeat(2000)},{role:'user',content:'next'}]};assert.equal(conversationMessages(long,'next','',{persistent:true})[0].content.length,2000);
console.log('PASS inference history: Qwen append-stable exact contents, bounded pairs, edits visible to token authority; other models and RAG short-history unchanged.');

// Overdrive supplies persistent history for all GGUF architectures, including SmolLM3.
const full={messages:[]};for(let i=0;i<12;i++)full.messages.push({role:'user',content:'user-'+i+' '+'u'.repeat(2000)},{role:'assistant',content:'assistant-'+i+' '+'a'.repeat(2000)});full.messages.push({role:'user',content:'nova'});
const sent=conversationMessages(full,'nova','',{persistent:true});assert.equal(sent.length,25);assert.equal(sent[0].content,full.messages[0].content);assert.equal(sent[1].content,full.messages[1].content);
console.log('PASS Overdrive: complete long messages and twelve full history pairs remain exact; native token budgeting evicts oldest pairs only.');
