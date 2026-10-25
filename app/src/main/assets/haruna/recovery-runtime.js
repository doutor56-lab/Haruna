// Minimal recovery runtime. Keeps the original UI usable even if app.js aborts during startup.
(() => {
  const $ = (s) => document.querySelector(s);
  const THINK_KEY = 'haruna_think_mode';
  let thinkMode = localStorage.getItem(THINK_KEY) === '1';

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

  const hideDrawer = () => {
    $('#drawer')?.classList.remove('open');
    const scrim = $('#scrim');
    if (scrim) scrim.hidden = true;
  };
  const showDrawer = () => {
    $('#drawer')?.classList.add('open');
    const scrim = $('#scrim');
    if (scrim) scrim.hidden = false;
  };
  const paintThink = () => {
    const button = $('#think');
    const label = $('#reasoningMode');
    button?.classList.toggle('active', thinkMode);
    button?.setAttribute('aria-pressed', String(thinkMode));
    if (label) {
      label.textContent = thinkMode ? 'Pensar' : 'Rápido';
      label.classList.toggle('thinking', thinkMode);
    }
  };
  const newConversation = async () => {
    const messages = $('#messages');
    if (messages) messages.innerHTML = '<div class="empty"><div class="orb">H✦</div><strong>Olá, eu sou a Haruna.</strong><span>Converse comigo. Suas conversas e memórias ficam salvas localmente neste dispositivo.</span></div>';
    hideDrawer();
    showView('chat');
    try {
      const llm = (await import('./llm-engine.js')).default;
      const status = await llm.refreshStatus();
      if (status?.modelLoaded) await llm.resetConversation();
    } catch (_) {}
  };

  document.addEventListener('click', (event) => {
    const nav = event.target.closest('.nav-item');
    if (nav) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showView(nav.dataset.view || 'chat');
      return;
    }
    const id = event.target.closest('button, #scrim')?.id;
    if (id === 'menu') { event.preventDefault(); event.stopImmediatePropagation(); showDrawer(); }
    else if (id === 'closeMenu' || id === 'scrim') { event.preventDefault(); event.stopImmediatePropagation(); hideDrawer(); }
    else if (id === 'think') { event.preventDefault(); event.stopImmediatePropagation(); thinkMode = !thinkMode; localStorage.setItem(THINK_KEY, thinkMode ? '1' : '0'); paintThink(); }
    else if (id === 'newChat' || id === 'drawerNew') { event.preventDefault(); event.stopImmediatePropagation(); newConversation(); }
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
      const prompt = /qwen3/i.test(status?.modelName || '') ? `${text}\n\n${thinkMode ? '/think' : '/no_think'}` : text;
      const result = await llm.generate([{ role: 'user', content: prompt }], {
        maxTokens: thinkMode ? 512 : 256,
        onToken: (_token, all) => {
          if (out) out.textContent = all || '✦';
        }
      });
      if (out) out.textContent = result?.text?.trim() || 'Não consegui formular uma resposta.';
    } catch (error) {
      add('assistant', `Falha local: ${error?.message || String(error)}`);
    }
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.target?.id !== 'input' || event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    $('#composer')?.requestSubmit();
  }, true);

  paintThink();
  window.__HARUNA_RECOVERY_RUNTIME__ = true;
})();
