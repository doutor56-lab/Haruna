// Version is owned by the native behavioral layer; never inferred from memory or a document.
export function behaviorProfile(){
 try{const raw=window.HarunaAndroid?.getBehaviorProfile?.(),profile=typeof raw==='string'?JSON.parse(raw):raw;
  return typeof profile?.id==='string'&&/^haruna_behavior_profile_v\d+$/.test(profile.id)?{id:profile.id,reviewNote:typeof profile.reviewNote==='string'?profile.reviewNote.slice(0,400):''}:null;
 }catch{return null}
}
export const SCENARIOS=Object.freeze({casual:'Conversa casual',playful:'Brincadeira',enthusiasm:'Entusiasmo',curiosity:'Curiosidade',technical:'Explicação técnica',disagreement:'Discordância',correction:'Correção',assistant_error:'Erro da Haruna',user_error:'Erro do usuário',changed_mind:'Mudança de opinião',uncertainty:'Desconhecimento',serious:'Assunto sério',brief:'Resposta curta',detailed:'Resposta detalhada',memory_known:'Memória disponível',memory_absent:'Ausência de memória',project:'Projeto',user_teaching:'Usuário ensinando'});
