// Preserve existing Settings cards and place model-related controls inside Local Models.
const settings = document.querySelector('#settingsView');
const memory = document.querySelector('#memoryView');
const library = document.querySelector('#libraryView');

if (settings) {
  const host = settings.querySelector('#localModels');
  const futureCard = document.createElement('section');
  futureCard.className = 'page-card haruna-future-settings';
  futureCard.innerHTML = '<div class="section-title"><strong>Geral</strong></div><p><strong>Novidades em desenvolvimento</strong></p><p>Esta seção será destinada a novas configurações e recursos da Haruna.</p><p>Futuramente, poderão ser adicionadas opções de idioma, notificações, personalização e outras preferências.</p><p class="settings-note">Essas funcionalidades ainda não estão disponíveis.</p>';
  settings.append(futureCard);
  if (host) {
    const details = document.createElement('details');
    details.className = 'model-extra-settings';
    const summary = document.createElement('summary');
    summary.textContent = 'Outras configurações de modelos';
    const tabs = document.createElement('div');
    tabs.className = 'model-extra-tabs';
    tabs.setAttribute('role', 'tablist');
    const panelsHost = document.createElement('div');
    panelsHost.className = 'model-extra-content';
    details.append(summary, tabs, panelsHost);
    host.append(details);
    const groups = [['images','Geração de imagens'],['vision','Interpretação de imagens'],['voice','Voz']];
    const panels = new Map();
    let selected = 'images';
    const render = () => {
      for (const [key, panel] of panels) panel.hidden = key !== selected;
      for (const button of tabs.children) button.setAttribute('aria-selected', String(button.dataset.category === selected));
    };
    for (const [key, label] of groups) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.category = key;
      button.setAttribute('role','tab');
      button.textContent = label;
      const panel = document.createElement('section');
      panel.className = 'model-extra-panel';
      panels.set(key, panel);
      tabs.append(button);
      panelsHost.append(panel);
      button.addEventListener('click', () => { selected = key; render(); });
    }
    const categoryOf = node => {
      if (node.classList.contains('vision-settings')) return 'vision';
      if (node.classList.contains('recognition-settings') || node.classList.contains('speech-settings') || node.classList.contains('voice-settings')) return 'voice';
      if (node.dataset.modelGroup === 'images' || node.classList.contains('image-settings')) return 'images';
      const heading = (node.querySelector('.section-title strong,h3')?.textContent || '').toLowerCase();
      if (/interpreta.*imagem|vis[aã]o/.test(heading)) return 'vision';
      if (/gera.*imagem|difus[aã]o|modelo.*imagem/.test(heading)) return 'images';
      if (/voz|fala|reconhec|ditado/.test(heading)) return 'voice';
      return null;
    };
    const organize = () => {
      for (const node of [...settings.children]) {
        if (!node.classList.contains('page-card') || node === host) continue;
        const category = categoryOf(node);
        if (category) panels.get(category).append(node);
      }
      render();
    };
    new MutationObserver(organize).observe(settings, {childList:true});
    organize();
    window.addEventListener('haruna-open-settings-category', event => {
      const category = event.detail?.category;
      if (!panels.has(category)) return;
      details.open = true;
      selected = category;
      render();
      host.scrollIntoView({block:'start'});
    });
  }
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
