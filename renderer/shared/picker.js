(() => {
  const t = (key) => (window.i18n ? window.i18n.t(key) : key);
  const pad = (value) => String(value).padStart(2, '0');

  function todayISO() {
    const now = new Date();
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  function parseISO(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
  }

  function formatDate(value) {
    const parts = parseISO(value);
    return parts ? `${pad(parts.d)}.${pad(parts.m + 1)}.${parts.y}` : '';
  }

  function get(input) {
    if (!input) return '';
    if (input.dataset.pickerReady === '1') return input.dataset.value || '';
    return input.value || '';
  }

  function set(input, value) {
    if (!input) return;
    const next = value || '';
    if (input.dataset.pickerReady === '1') {
      input.dataset.value = next;
      input.value = input.dataset.picker === 'date' ? formatDate(next) : next;
    } else {
      input.value = next;
    }
  }

  let active = null;

  function close() {
    if (!active) return;
    if (active.button) {
      active.button.classList.remove('open');
      active.button.setAttribute('aria-expanded', 'false');
    }
    active.popup.remove();
    active = null;
    document.removeEventListener('mousedown', onDocDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('resize', close);
  }

  function onDocDown(event) {
    if (!active) return;
    if (active.popup.contains(event.target)) return;
    if (active.button && active.button.contains(event.target)) return;
    if (active.input === event.target) return;
    close();
  }

  function onKeyDown(event) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close();
  }

  function onPick(input, value) {
    set(input, value);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function position(input, popup) {
    const rect = input.getBoundingClientRect();
    const margin = 8;
    const gap = 6;
    const width = popup.offsetWidth;
    const height = popup.offsetHeight;
    let left = Math.min(Math.max(margin, rect.left), window.innerWidth - width - margin);
    let top = rect.bottom + gap;
    if (top + height > window.innerHeight - margin) {
      const above = rect.top - gap - height;
      top = above >= margin ? above : Math.max(margin, window.innerHeight - height - margin);
    }
    popup.style.left = `${Math.round(Math.max(margin, left))}px`;
    popup.style.top = `${Math.round(top)}px`;
  }

  function open(input, kind, options = {}) {
    if (!input || input.disabled) return;
    close();
    const popup = document.createElement('div');
    popup.className = kind === 'date'
      ? 'picker-popup picker-calendar'
      : kind === 'time'
        ? 'picker-popup picker-time'
        : 'picker-popup picker-tags';
    if (kind === 'date') buildCalendar(input, popup);
    else if (kind === 'time') buildTime(input, popup);
    else if (kind === 'tags') buildTags(input, popup, options.tags || [], options.onHide);
    document.body.appendChild(popup);
    position(input, popup);
    if (typeof popup.refreshLayout === 'function') popup.refreshLayout();
    active = { input, popup, kind, button: options.button || null };
    if (options.button) {
      options.button.classList.add('open');
      options.button.setAttribute('aria-expanded', 'true');
    }
    document.addEventListener('mousedown', onDocDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', close);
    if (kind === 'tags') {
      input.focus({ preventScroll: true });
      return;
    }
    const focusTarget = popup.querySelector('.pp-day.selected, .pp-item.selected, .pp-day.today');
    if (focusTarget) focusTarget.focus({ preventScroll: true });
  }

  function buildCalendar(input, popup) {
    const selected = parseISO(get(input));
    const todayValue = todayISO();
    const today = parseISO(todayValue);
    let view = selected ? new Date(selected.y, selected.m, 1) : new Date(today.y, today.m, 1);

    const head = document.createElement('div');
    head.className = 'pp-head';
    const prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'pp-nav';
    prev.textContent = '‹';
    prev.setAttribute('aria-label', t('nav.prev'));
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'pp-nav';
    next.textContent = '›';
    next.setAttribute('aria-label', t('nav.next'));
    const title = document.createElement('div');
    title.className = 'pp-title';
    head.append(prev, title, next);

    const week = document.createElement('div');
    week.className = 'pp-week';
    for (let i = 0; i < 7; i += 1) {
      const cell = document.createElement('span');
      cell.textContent = window.i18n ? window.i18n.weekdayShort((i + 1) % 7) : '';
      week.appendChild(cell);
    }

    const grid = document.createElement('div');
    grid.className = 'pp-grid';

    function isoOf(date) {
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    function isSelected(date) {
      return !!selected && date.getFullYear() === selected.y && date.getMonth() === selected.m && date.getDate() === selected.d;
    }

    function render() {
      title.textContent = window.i18n
        ? `${window.i18n.month(view.getMonth())} ${view.getFullYear()}`
        : `${view.getMonth() + 1}.${view.getFullYear()}`;
      grid.replaceChildren();
      const first = new Date(view.getFullYear(), view.getMonth(), 1);
      const offset = (first.getDay() + 6) % 7;
      const start = new Date(view.getFullYear(), view.getMonth(), 1 - offset);
      for (let i = 0; i < 42; i += 1) {
        const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        const iso = isoOf(date);
        const day = document.createElement('button');
        day.type = 'button';
        day.className = 'pp-day';
        day.textContent = String(date.getDate());
        if (date.getMonth() !== view.getMonth()) day.classList.add('out');
        if (iso === todayValue) day.classList.add('today');
        if (isSelected(date)) day.classList.add('selected');
        day.addEventListener('click', () => {
          onPick(input, iso);
          close();
        });
        grid.appendChild(day);
      }
    }
    render();

    prev.addEventListener('click', () => {
      view = new Date(view.getFullYear(), view.getMonth() - 1, 1);
      render();
    });
    next.addEventListener('click', () => {
      view = new Date(view.getFullYear(), view.getMonth() + 1, 1);
      render();
    });

    const foot = document.createElement('div');
    foot.className = 'pp-foot';
    const todayBtn = document.createElement('button');
    todayBtn.type = 'button';
    todayBtn.className = 'pp-btn';
    todayBtn.textContent = t('nav.today');
    todayBtn.addEventListener('click', () => {
      onPick(input, todayValue);
      close();
    });
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'pp-btn';
    clearBtn.textContent = t('picker.clear');
    clearBtn.addEventListener('click', () => {
      onPick(input, '');
      close();
    });
    foot.append(todayBtn, clearBtn);
    popup.append(head, week, grid, foot);
  }

  function buildTime(input, popup) {
    const current = get(input);
    const parts = current ? current.split(':') : [];
    const now = new Date();
    let selectedHour = parts.length === 2 ? Number(parts[0]) : now.getHours();
    let selectedMinute = parts.length === 2 ? Number(parts[1]) : now.getMinutes();
    if (!Number.isFinite(selectedHour)) selectedHour = 0;
    if (!Number.isFinite(selectedMinute)) selectedMinute = 0;

    function makeColumn(headKey, values) {
      const column = document.createElement('div');
      column.className = 'pp-col';
      const head = document.createElement('div');
      head.className = 'pp-col-head';
      head.textContent = t(headKey);
      const body = document.createElement('div');
      body.className = 'pp-col-body';
      const items = [];
      values.forEach((value) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'pp-item';
        item.dataset.value = String(value);
        item.textContent = pad(value);
        body.appendChild(item);
        items.push(item);
      });
      column.append(head, body);
      return { column, body, items };
    }

    const hours = makeColumn('picker.hours', Array.from({ length: 24 }, (_, i) => i));
    const minutes = makeColumn('picker.minutes', Array.from({ length: 60 }, (_, i) => i));

    function paint() {
      hours.items.forEach((item) => item.classList.toggle('selected', Number(item.dataset.value) === selectedHour));
      minutes.items.forEach((item) => item.classList.toggle('selected', Number(item.dataset.value) === selectedMinute));
    }

    function center(body, item) {
      if (!item) return;
      body.scrollTop = item.offsetTop - body.clientHeight / 2 + item.offsetHeight / 2;
    }

    function write() {
      onPick(input, `${pad(selectedHour)}:${pad(selectedMinute)}`);
    }

    hours.body.addEventListener('click', (event) => {
      const item = event.target.closest('.pp-item');
      if (!item) return;
      selectedHour = Number(item.dataset.value);
      write();
      paint();
      center(minutes.body, minutes.items[selectedMinute]);
    });

    minutes.body.addEventListener('click', (event) => {
      const item = event.target.closest('.pp-item');
      if (!item) return;
      selectedMinute = Number(item.dataset.value);
      write();
      close();
    });

    const columns = document.createElement('div');
    columns.className = 'pp-time-cols';
    columns.append(hours.column, minutes.column);

    const foot = document.createElement('div');
    foot.className = 'pp-foot';
    const nowBtn = document.createElement('button');
    nowBtn.type = 'button';
    nowBtn.className = 'pp-btn';
    nowBtn.textContent = t('picker.now');
    nowBtn.addEventListener('click', () => {
      const moment = new Date();
      onPick(input, `${pad(moment.getHours())}:${pad(moment.getMinutes())}`);
      close();
    });
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'pp-btn';
    clearBtn.textContent = t('picker.clear');
    clearBtn.addEventListener('click', () => {
      onPick(input, '');
      close();
    });
    foot.append(nowBtn, clearBtn);
    popup.append(columns, foot);

    paint();
    popup.refreshLayout = () => {
      center(hours.body, hours.items[selectedHour]);
      center(minutes.body, minutes.items[selectedMinute]);
    };
  }

  function parseTagList(value) {
    return String(value || '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  function buildTags(input, popup, tags, onHide) {
    let currentList = [...tags];
    const head = document.createElement('div');
    head.className = 'pp-head';
    const title = document.createElement('div');
    title.className = 'pp-title';
    title.textContent = t('tags.title');
    head.appendChild(title);
    popup.appendChild(head);

    const list = document.createElement('div');
    list.className = 'pp-tags-list';
    popup.appendChild(list);

    function writeTags(listNow) {
      input.value = listNow.join(', ');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      renderList();
    }

    function renderList() {
      list.replaceChildren();
      if (!currentList.length) {
        const empty = document.createElement('p');
        empty.className = 'pp-empty';
        empty.textContent = t('tags.none');
        list.appendChild(empty);
        return;
      }
      const selected = new Set(parseTagList(input.value).map((tag) => tag.toLowerCase()));
      for (const tag of currentList) {
        const row = document.createElement('div');
        row.className = 'pp-tag-row';
        const main = document.createElement('button');
        main.type = 'button';
        main.className = selected.has(tag.toLowerCase()) ? 'pp-tag selected' : 'pp-tag';
        const mark = document.createElement('span');
        mark.className = 'pp-tag-mark';
        const label = document.createElement('span');
        label.textContent = `#${tag}`;
        main.append(mark, label);
        main.addEventListener('click', () => {
          const listNow = parseTagList(input.value);
          const index = listNow.findIndex((item) => item.toLowerCase() === tag.toLowerCase());
          if (index >= 0) listNow.splice(index, 1);
          else if (listNow.length < 5) listNow.push(tag);
          writeTags(listNow);
        });
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'pp-tag-del';
        del.textContent = '×';
        del.title = t('tags.delete');
        del.setAttribute('aria-label', t('tags.delete'));
        del.addEventListener('click', () => {
          const listNow = parseTagList(input.value).filter((item) => item.toLowerCase() !== tag.toLowerCase());
          input.value = listNow.join(', ');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          currentList = currentList.filter((item) => item.toLowerCase() !== tag.toLowerCase());
          renderList();
          if (typeof onHide === 'function') onHide(tag);
        });
        row.append(main, del);
        list.appendChild(row);
      }
    }
    renderList();

    const foot = document.createElement('div');
    foot.className = 'pp-foot';
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'pp-btn';
    clear.textContent = t('tags.clear');
    clear.addEventListener('click', () => writeTags([]));
    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'pp-btn';
    done.textContent = t('tags.done');
    done.addEventListener('click', () => close());
    foot.append(clear, done);
    popup.appendChild(foot);
  }

  function toggleTags(input, tags, button, onHide) {
    if (active && active.kind === 'tags' && active.input === input) {
      close();
      return;
    }
    open(input, 'tags', { tags, button, onHide });
  }

  function openChoices(anchor, items, selected, onPick) {
    if (!anchor) return;
    if (active && active.kind === 'choices' && active.input === anchor) {
      close();
      return;
    }
    close();
    const popup = document.createElement('div');
    popup.className = 'picker-popup picker-choices';
    const list = document.createElement('div');
    list.className = 'pp-choices-list';
    for (const item of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = item.value === selected ? 'pp-choice selected' : 'pp-choice';
      button.dataset.value = item.value;
      button.textContent = item.label;
      button.addEventListener('click', () => {
        onPick(item.value);
        close();
      });
      list.appendChild(button);
    }
    popup.appendChild(list);
    document.body.appendChild(popup);
    popup.style.minWidth = `${Math.round(anchor.getBoundingClientRect().width)}px`;
    position(anchor, popup);
    active = { input: anchor, popup, kind: 'choices', button: anchor };
    anchor.classList.add('open');
    anchor.setAttribute('aria-expanded', 'true');
    document.addEventListener('mousedown', onDocDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', close);
    const selectedButton = popup.querySelector('.pp-choice.selected');
    if (selectedButton) selectedButton.focus({ preventScroll: true });
  }

  function refreshPlaceholders() {
    document.querySelectorAll('input[data-picker]').forEach((input) => {
      if (input.dataset.picker === 'date') input.placeholder = t('picker.datePh');
      else input.placeholder = t('picker.timePh');
    });
  }

  function enhance(input) {
    if (input.dataset.pickerReady === '1') return;
    const kind = input.type;
    if (kind !== 'date' && kind !== 'time') return;
    const initial = input.value;
    input.dataset.picker = kind;
    input.dataset.pickerReady = '1';
    input.type = 'text';
    input.readOnly = true;
    input.classList.add('picker-input');
    const field = document.createElement('span');
    field.className = `picker-field ${kind}`;
    input.parentNode.insertBefore(field, input);
    field.appendChild(input);
    input.addEventListener('click', () => open(input, kind));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open(input, kind);
      }
    });
    set(input, initial);
  }

  function init() {
    document.querySelectorAll('input[type="date"], input[type="time"]').forEach(enhance);
    refreshPlaceholders();
  }

  window.ppPicker = { get, set, open, close, init, toggleTags, openChoices };

  if (window.i18n) window.i18n.onLanguageChange(refreshPlaceholders);
  init();
})();
