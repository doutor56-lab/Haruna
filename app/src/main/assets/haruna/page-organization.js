// Preserve existing Settings cards and place model-related controls inside Local Models.
const settings = document.querySelector('#settingsView');
const memory = document.querySelector('#memoryView');
const library = document.querySelector('#libraryView');

if (settings) {
  // Keep native voice, recognition and image controls at their original DOM
  // locations. Moving live controls can break event bindings and voice setup.
  const futureCard = document.createElement('section');
  futureCard.className = 'page-card haruna-future-settings';
  futureCard.innerHTML = '<div class="section-title"><strong>Geral</strong></div><p><strong>Novidades em desenvolvimento</strong></p><p>Futuramente, esta seção poderá incluir idioma, notificações e outras preferências.</p><p class="settings-note">Essas funcionalidades ainda não estão disponíveis.</p>';
  const footer = settings.querySelector('footer,.haruna-credits');
  if (footer) footer.before(futureCard);
  else settings.append(futureCard);
}

if (memory && library) {
  const head = library.querySelector('.page-head');
  const intro = document.createElement('p');
  intro.className = 'settings-note';
  intro.textContent = 'Documentos e arquivos usados como conhecimento local.';
  head?.append(intro);

  const knowledgeCard = memory.querySelector('#knowledgeList')?.closest('.page-card');
  if (knowledgeCard) {
    const heading = knowledgeCard.querySelector('.section-title strong');
    if (heading) heading.textContent = 'Adicionar conhecimento';
    library.append(knowledgeCard);
  }

  const placeDocuments = () => {
    // The document module inserts this section asynchronously after #knowledgeList.
    // Keep it in Biblioteca, not in Memória, without recreating its event handlers.
    const documents = document.querySelector('.document-library');
    if (documents && documents.parentElement !== library) library.append(documents);
  };
  placeDocuments();
  new MutationObserver(placeDocuments).observe(library, { childList: true });

  const memoryCards = [...memory.children].filter(el => el.classList.contains('page-card'));
  const learning = memoryCards.filter(el => !el.querySelector('#memoryItems'));
  const saved = memoryCards.find(el => el.querySelector('#memoryItems'));
  if (saved) memory.insertBefore(saved, learning[0] || null);
  const title = memory.querySelector('.page-head p');
  if (title) title.textContent = 'Memórias salvas e aprendizado local.';
}
