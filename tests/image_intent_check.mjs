import assert from 'node:assert/strict';
import {imageCandidate,imageDecision} from '../app/src/main/assets/haruna/image-intent.js';
const explicit=[
 'Crie uma imagem de um touro.','Gera uma foto de uma bola','Faça uma ilustração de uma floresta',
 'Desenha um gato','Desenhe um papagaio amarelo','Ilustre um castelo','Pinte uma paisagem','Renderize um robô',
 'Haruna, crie uma imagem de um dragão','Oi Haruna, por favor gere uma imagem de um gato',
 'Por favor, crie uma imagem de um touro.','Me faça um desenho de uma casa','Faz pra mim uma arte de um gato',
 'Cria um avatar de um mago','Crie um papel de parede de montanhas','Gere um pôster de astronomia',
 'Quero uma imagem de um touro','Eu quero uma foto de um cachorro','Queria um desenho de um barco',
 'Gostaria de uma ilustração de um jardim','Preciso de uma capa para um livro de ficção',
 'Quero que você crie uma imagem de uma floresta','Gostaria de ver uma imagem de um castelo',
 'Você pode criar uma imagem de um gato?','Poderia me fazer um retrato de uma princesa?',
 'Consegue desenhar um gato?','Dá pra gerar uma imagem de um pássaro?',
 'Seria possível criar uma imagem de uma floresta?','Haruna, vc consegue gerar uma foto de um dragão?',
 'Criar uma imagem de um gato','Gerar uma foto de uma lua','Faça outra imagem de um cão',
 'Crie 4 imagens de gatos','Gere duas imagens de um carro','Crie uma imagem realista de um cachorro',
 'Please create a picture of a cat','Can you draw a cat?','Could you generate an image of a castle?',
 'I want an illustration of a garden','Create a portrait of a wizard',
 'Pode fazer uma imagem, por favor?','Haruna, poderia, por favor, criar uma imagem de um gato?',
 'Gostaria que você fizesse uma imagem de uma árvore','Quero que crie uma imagem de um gato',
 'Crie uma imagem de um gato que não está molhado','Draw an image of a do not enter sign',
 'Cria aí pra mim um desenho de uma cidade','Faça-me uma imagem de um céu estrelado',
];
const negative=[
 'oi','Olá Haruna','Bom dia','Como gerar uma imagem?','Você consegue criar imagens?',
 'Você pode criar uma imagem?','Pode desenhar?','Explique como criar uma imagem','O que é uma imagem?',
 'Não crie uma imagem de um touro','Não quero uma imagem de um gato','Quero saber como gerar imagens',
 'Se eu pedir, você cria uma imagem?','Qual modelo é melhor para criar imagens?',
 'Crie um texto sobre uma imagem','Faça um resumo de um livro','Faça uma análise desta imagem',
 'Me fala sobre o bico do papagaio','Analise esta foto','Descreva uma imagem de um gato',
 'Crie uma imagem Docker para o projeto','Crie uma imagem ISO','Crie uma imagem mental de um gato',
 'Quero a imagem anterior','Quero uma imagem que você gerou ontem','Quero uma imagem Docker',
 '"Crie uma imagem de um gato" é um exemplo de comando','Como você desenha um gato?',
 'Create a text about image generation','Do not create an image of a cat',
 'Pinte esta imagem','Desenhe uma conclusão','Pinte o desenho anterior',
];
const never={generate:async()=>{throw Error('Explicit requests and normal chat must not need a classifier or loaded LLM.')}};
for(const text of explicit){assert.equal(imageCandidate(text),true,text);assert.equal(await imageDecision(never,text),true,text);}
for(const text of negative){assert.equal(imageCandidate(text),false,text);assert.equal(await imageDecision(never,text),false,text);}
let calls=0;const original='Que tal uma imagem de um touro?';
const llm={generate:async(messages,o)=>{calls++;assert(messages[0].content.includes(JSON.stringify(original)));assert.equal(o.enableThinking,false);assert.equal(o.maxTokens,64);o.onToken('{"action":"generate_image"}')}};
assert.equal(await imageDecision(llm,original),true);assert.equal(calls,1);
for(const text of ['Vou gerar para você!','{"action":"text"}','null','[]','{"action":"generate_image","prompt":"rewritten"}'])assert.equal(await imageDecision({generate:async(m,o)=>o.onToken(text)},original),false,text);
for(const chunks of [['<think>classificar</think>','{"action":"generate_image"}'],['classificar</thi','nk>{"action":"generate_image"}'],['```json\n','{"action":"generate_image"}','\n```']])assert.equal(await imageDecision({generate:async(m,o)=>chunks.forEach(t=>o.onToken(t))},original),true);
assert.equal(await imageDecision({refreshStatus:async()=>({modelLoaded:false}),...never},original),false);
console.log(`PASS: ${explicit.length} explicit requests; ${negative.length} non-image/negated/meta/capability requests; soft requests require a bounded structured decision (FAKE LLM). Original prompt preserved.`);
