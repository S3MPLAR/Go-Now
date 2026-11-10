(() => {
  const api = window.api;
  const t = (key, params) => window.i18n.t(key, params);
  const input = document.getElementById('quickInput');
  const preview = document.getElementById('quickPreview');
  const hint = document.getElementById('quickHint');

  let parsed = { title: '', date: null, time: null, tags: [], important: false, notify: true };

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function toDateString(dt) {
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  }

  function addDays(dateStr, days) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
    dt.setDate(dt.getDate() + days);
    return toDateString(dt);
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const today = toDateString(new Date());
    if (dateStr === today) return t('quick.today');
    if (dateStr === addDays(today, 1)) return t('quick.tomorrow');
    const [y, m, d] = dateStr.split('-').map(Number);
    const year = y !== new Date().getFullYear() ? ` ${y}` : '';
    return `${d} ${window.i18n.month(m - 1)}${year}`;
  }

  function render() {
    parsed = window.quickParse.parseQuickAdd(input.value, new Date(), window.i18n.getLanguage());
    preview.replaceChildren();
    const chips = [];
    if (!parsed.notify) {
      chips.push({ text: t('quick.noDue'), cls: 'no-due' });
    } else {
      if (parsed.date) chips.push({ text: formatDate(parsed.date), cls: 'date' });
      if (parsed.time) chips.push({ text: parsed.time, cls: 'time' });
    }
    if (parsed.important) chips.push({ text: t('quick.important'), cls: 'important' });
    for (const tag of parsed.tags) chips.push({ text: `#${tag}`, cls: 'tag' });

    for (const item of chips) {
      const chip = document.createElement('span');
      chip.className = `quick-chip ${item.cls}`;
      chip.textContent = item.text;
      preview.appendChild(chip);
    }
    if (!chips.length) {
      const empty = document.createElement('span');
      empty.className = 'quick-empty';
      empty.textContent = t('quick.example');
      preview.appendChild(empty);
    }
    hint.textContent = t('quick.hint');
  }

  async function submit() {
    const title = parsed.title.trim();
    if (!title) return;
    await api.addTask({
      title,
      date: parsed.notify ? parsed.date : null,
      time: parsed.notify ? parsed.time : null,
      recurrence: 'none',
      notify: parsed.notify,
      note: '',
      important: parsed.important,
      tags: parsed.tags
    });
    input.value = '';
    render();
    api.hideQuick();
  }

  input.addEventListener('input', render);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      api.hideQuick();
    }
  });

  api.onQuickShow(() => {
    input.value = '';
    render();
    input.focus();
  });

  api.getTheme().then((theme) => {
    document.documentElement.dataset.theme = theme || 'peach';
  });
  api.onThemeChanged((theme) => {
    document.documentElement.dataset.theme = theme;
  });
  window.i18n.onLanguageChange(() => render());

  render();
  input.focus();
})();
