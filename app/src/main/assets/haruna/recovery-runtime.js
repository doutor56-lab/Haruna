// Minimal recovery runtime. Keeps the original UI usable even if app.js aborts during startup.
(() => {
  const $ = (s) => document.querySelector(s);
  const add = (role, text) => {
    const messages = $('#messages');
    if (!messages) return null;
    const empty = messages.querySelector('.empty');
    if (empty) empty.remove();
    const el = document.createElement('div');
    el.className = `msg ${role}`;
    if (role === 'assistant') {
      const avatar = document.createElement('div');
      avatar.className = 'avatar';
      avatar.textContent = 'H';
      el.appendChild(avatar);
    }
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = text;
    el.appendChild(bubble);
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
    return bubble;
  };

  const showView = (name) => {
    document.querySelectorAll('.view').forEach((v) => { v.hidden = true; });
    const target = $(`#${name}View`);
    if (target) target.hidden = false;
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  };

  document.addEventListener('click', (event) => {
    const nav = event.target.closest('.nav-item');
    if (!nav) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showView(nav.dataset.view || 'chat');
  }, true);

  document.addEventListener('submit', async (event) => {
    if (event.target?.id !== 'composer') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const input = $('#input');
    const text = input?.value?.trim();
    if (!text) return;
    input.value = '';
    add('user', text);

    try {
      const llm = (await import('./llm-engine.js')).default;
      const status = await llm.refreshStatus();
      if (!status?.modelLoaded) {
        add('assistant', 'Estou funcionando, mas ainda não há um modelo GGUF carregado. Abra Configurações e selecione um modelo local.');
        return;
      }
      const out = add('assistant', '✦');
      const result = await llm.generate([{ role: 'user', content: text }], {
        maxTokens: 256,
        onToken: (_token, all) => {
          if (out) out.textContent = all || '✦';
        }
      });
      if (out) out.textContent = result?.text?.trim() || 'Não consegui formular uma resposta.';
    } catch (error) {
      add('assistant', `Falha local: ${error?.message || String(error)}`);
    }
  }, true);

  // Enter sends on hardware keyboards without depending on app.js.
  document.addEventListener('keydown', (event) => {
    if (event.target?.id !== 'input' || event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    $('#composer')?.requestSubmit();
  }, true);

  window.__HARUNA_RECOVERY_RUNTIME__ = true;
})();
