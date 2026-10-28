// Existing RAG fast path, model-free: substitute only its storage dependency, not routing/enrichment.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
globalThis.window={addEventListener(){},dispatchEvent(){}};
globalThis.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options.detail}};
let searches=0;
globalThis.__harunaEmptyKnowledge={list:()=>[],search:async()=>{searches++;throw Error('Empty catalog must not search')}};
let source=await readFile(new URL('../app/src/main/assets/haruna/retrieval/enrich.js',import.meta.url),'utf8');
source=source.replace("import knowledge from '../knowledge-store.js';","const knowledge=globalThis.__harunaEmptyKnowledge;");
source=source.replace("from './policy.js'",`from '${new URL('../app/src/main/assets/haruna/retrieval/policy.js',import.meta.url).href}'`);
const {enrichOnDemand}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
for(const text of ['Oi','Explique por que o céu parece azul.','Consulte o Segundo Cérebro: qual é a palavra-chave do Projeto Aurora?']){
 const result=await enrichOnDemand(text,{structured:true});assert.equal(result.text,text);assert.deepEqual(result.references,[]);
}
assert.equal(searches,0);
console.log('PASS: unchanged RAG empty-catalog fast path performs zero searches.');
