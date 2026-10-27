export const OPENINGS=Object.freeze([
 'Oi… tem alguém aí?','Oii… alguém por aí?','Ei… você tá aí?','Olá! Acho que tenho companhia.',
 'Oi! Acho que você me encontrou.','Ei, tem alguém do outro lado?','Oii! Posso conversar com você?',
 'Olá… parece que não estou sozinha por aqui.','Opa! Alguém me escuta?','Oi! Que bom encontrar alguém por aqui.',
 'Ei… posso falar com você?','Oii! Acho que agora podemos conversar.'
]);
export const QUESTIONS=Object.freeze([
 'Oii! Como você prefere que eu te chame?','Legal, companhia! Qual nome você quer que eu use?',
 'Prazer! Tem algum nome que você prefere usar por aqui?','Então vamos nos conhecer: como posso te chamar?',
 'Que bom! Como você gosta de ser chamado?','Já que você apareceu por aqui… qual nome eu uso?',
 'Oi! Você quer me dizer como prefere ser chamado?','Podemos começar pelo básico: como posso te chamar?',
 'Bom ter você aqui. Tem algum nome que eu possa usar?','Agora sim! Como você prefere que eu te chame?'
]);
export const REACTIONS=Object.freeze([
 name=>`Prazer, ${name}! Agora já sei como te chamar.`,name=>`Fechado, ${name}. Vamos conversar!`,
 name=>`${name}, combinado. Ficou guardado por aqui.`,name=>`Oi, ${name}! Agora estamos apresentados.`,
 name=>`Certo, ${name}. Pode contar comigo por aqui.`,name=>`Beleza, ${name}! Vou usar esse nome.`,
 name=>`Prazer em te conhecer, ${name}.`,name=>`Então, ${name}, companhia oficialmente encontrada!`,
 name=>`Combinado, ${name}. Podemos seguir do seu jeito.`,name=>`Tudo certo, ${name}! Que bom te conhecer.`
]);
export function choose(list,previous=-1){const eligible=list.map((_,i)=>i).filter(i=>i!==previous);return eligible[Math.floor(Math.random()*eligible.length)]??0}
