// Navigation-only organization. Existing controls and persistence remain untouched.
const settings = document.querySelector('#settingsView');
const memory = document.querySelector('#memoryView');
const library = document.querySelector('#libraryView');

if (settings) {
  const groups = [
    ['models', 'Modelos locais', 'Modelos instalados, desempenho e motores'],
    ['images', 'Geração de imagens', 'Modelos e preferências de imagens'],
    ['vision', 'Interpretação de imagens', 'Modelos para analisar imagens'],
    ['voice', 'Voz e conversação', 'Reconhecimento, fala e conversa por voz'],
    ['privacy', 'Privacidade e armazenamento', 'Dados e processamento local'],
    ['general', 'Geral', 'Aparência e outras preferências']
  ];
  const navigation = document.createElement('div');
  navigation.className = 'settings-category-nav';
  navigation.setAttribute('aria-label', 'Categorias de configurações');
  const heading = document.createElement('div');
  heading.className = 'settings-category-heading';
  heading.hidden = true;
  const back = document.createElement('button');
  back.type = 'button';
  back.textContent = '‹ Todas as configurações';
  const title = document.createElement('strong');
  heading.append(back, title);
  const cards = document.createElement('div');
  cards.className = 'settings-category-grid';
  navigation.append(heading, cards);
  settings.querySelector('.page-head')?.after(navigation);
  let selected = null;
  const categoryOf = node => {
    if (node.id === 'localModels' || node.querySelector('#modelList')) return 'models';
    if (node.classList.contains('vision-settings')) return 'vision';
    if (node.classList.contains('recognition-settings') || node.classList.contains('speech-settings') || node.classList.contains('voice-settings')) return 'voice';
    if (node.dataset.modelGroup === 'images' || node.classList.contains('image-settings')) return 'images';
    const name = (node.querySelector('.section-title strong,h3')?.textContent || '').toLowerCase();
    if (/imagem|difus[aã]o/.test(name)) return /interpreta|vis[aã]o/.test(name) ? 'vision' : 'images';
    if (/voz|fala|reconhec|ditado|conversa por voz/.test(name)) return 'voice';
    if (/privacidade|armazenamento/.test(name)) return 'privacy';
    return 'general';
  };
  const apply = () => {
    const sections = [...settings.children].filter(n => n.classList.contains('page-card'));
    for (const section of sections) section.hidden = selected !== null && categoryOf(section) !== selected;
    cards.hidden = selected !== null;
    heading.hidden = selected === null;
    if (selected) title.textContent = groups.find(g => g[0] === selected)?.[1] || '';
    for (const button of cards.children) {
      const count = sections.filter(s => categoryOf(s) === button.dataset.category).length;
      button.hidden = count === 0;
    }
  };
  for (const [key, label, description] of groups) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'settings-category-button';
    button.dataset.category = key;
    const strong = document.createElement('strong');
    strong.textContent = label;
    const small = document.createElement('small');
    small.textContent = description;
    const arrow = document.createElement('span');
    arrow.textContent = '›';
    arrow.setAttribute('aria-hidden', 'true');
    button.append(strong, small, arrow);
    button.addEventListener('click', () => { selected = key; apply(); settings.scrollTop = 0; });
    cards.append(button);
  }
  window.addEventListener('haruna-open-settings-category', event => { const category = event.detail?.category; if (groups.some(group => group[0] === category)) { selected = category; apply(); settings.scrollTop = 0; } });
  back.addEventListener('click', () => { selected = null; apply(); settings.scrollTop = 0; });
  // Only direct-child additions are observed: dynamically registered controls
  // appear in the correct category without replacing or cloning their nodes.
  const observer = new MutationObserver(() => apply());
  observer.observe(settings, { childList: true });
  apply();
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
