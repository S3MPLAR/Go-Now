(() => {
const api = window.api;
const t = (key, params) => window.i18n.t(key, params);

const dayView = document.getElementById('dayView');
const weekView = document.getElementById('weekView');
const dayTitle = document.getElementById('dayTitle');
const dayStats = document.getElementById('dayStats');
const dayList = document.getElementById('dayList');
const dayEmpty = document.getElementById('dayEmpty');
const overdueWrap = document.getElementById('overdueWrap');
const overdueList = document.getElementById('overdueList');
const noDueWrap = document.getElementById('noDueWrap');
const noDueList = document.getElementById('noDueList');
const weekGrid = document.getElementById('weekGrid');
const rangeLabel = document.getElementById('rangeLabel');
const tabDay = document.getElementById('tabDay');
const tabWeek = document.getElementById('tabWeek');
const searchView = document.getElementById('searchView');
const searchInput = document.getElementById('searchInput');
const searchClear = document.getElementById('searchClear');
const filterChips = document.getElementById('filterChips');
const activeTagChip = document.getElementById('activeTagChip');
const searchStats = document.getElementById('searchStats');
const searchResults = document.getElementById('searchResults');
const searchEmpty = document.getElementById('searchEmpty');
const clearDoneBtn = document.getElementById('clearDoneBtn');
const purgeArchiveBtn = document.getElementById('purgeArchiveBtn');
const toast = document.getElementById('toast');
const toastText = document.getElementById('toastText');
const toastUndo = document.getElementById('toastUndo');
const statsToggle = document.getElementById('statsToggle');
const statsBody = document.getElementById('statsBody');
const statsCard = statsToggle.closest('.stats-card');
const statToday = document.getElementById('statToday');
const statWeek = document.getElementById('statWeek');
const statsChart = document.getElementById('statsChart');
const statsHint = document.getElementById('statsHint');
const titleInput = document.getElementById('titleInput');
const dateInput = document.getElementById('dateInput');
const timeInput = document.getElementById('timeInput');
const repeatInput = document.getElementById('repeatInput');
const repeatBtn = document.getElementById('repeatBtn');
const repeatInterval = document.getElementById('repeatInterval');
const tagsInput = document.getElementById('tagsInput');
const tagsToggle = document.getElementById('tagsToggle');
const importantToggle = document.getElementById('importantToggle');
const noteInput = document.getElementById('noteInput');
const noNotifyToggle = document.getElementById('noNotifyToggle');
const noNotifyHint = document.getElementById('noNotifyHint');

function growNote() {
  noteInput.style.height = 'auto';
  noteInput.style.height = `${noteInput.scrollHeight}px`;
}
const addCardTitle = document.getElementById('addCardTitle');
const addSubmit = document.getElementById('addSubmit');
const cancelEdit = document.getElementById('cancelEdit');
const hotkeyInput = document.getElementById('hotkeyInput');
const hotkeyHint = document.getElementById('hotkeyHint');
const quickHotkeyInput = document.getElementById('quickHotkeyInput');
const quickHotkeyHint = document.getElementById('quickHotkeyHint');
const hotkeyResetBtn = document.getElementById('hotkeyReset');
const quickHotkeyResetBtn = document.getElementById('quickHotkeyReset');
const addForm = document.getElementById('addForm');
const autostartToggle = document.getElementById('autostartToggle');
const openPlannerToggle = document.getElementById('openPlannerToggle');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const openDataBtn = document.getElementById('openDataBtn');
const cleanupSelect = document.getElementById('cleanupSelect');
const cleanupHint = document.getElementById('cleanupHint');
const dataHint = document.getElementById('dataHint');
const appVersion = document.getElementById('appVersion');
const mcpBtn = document.getElementById('mcpBtn');
const paletteOverlay = document.getElementById('paletteOverlay');
const paletteInput = document.getElementById('paletteInput');
const paletteList = document.getElementById('paletteList');
const mcpOverlay = document.getElementById('mcpOverlay');
const mcpClose = document.getElementById('mcpClose');
const mcpClients = document.getElementById('mcpClients');
const mcpMissing = document.getElementById('mcpMissing');
const brandLogo = document.getElementById('brandLogo');
const logoPreview = document.getElementById('logoPreview');
const logoHint = document.getElementById('logoHint');
const themeGrid = document.getElementById('themeGrid');
const languageRow = document.getElementById('languageRow');
const logoChooseBtn = document.getElementById('logoChooseBtn');
const logoResetBtn = document.getElementById('logoResetBtn');
const soundSelectBtn = document.getElementById('soundSelectBtn');
const soundSelectLabel = document.getElementById('soundSelectLabel');
const soundPreviewBtn = document.getElementById('soundPreviewBtn');
const soundVolume = document.getElementById('soundVolume');
const soundVolumeValue = document.getElementById('soundVolumeValue');
const soundHint = document.getElementById('soundHint');
const soundNameOverlay = document.getElementById('soundNameOverlay');
const soundNameInput = document.getElementById('soundNameInput');
const soundNameHint = document.getElementById('soundNameHint');
const soundNameSave = document.getElementById('soundNameSave');
const soundNameCancel = document.getElementById('soundNameCancel');
const tagSoundTagBtn = document.getElementById('tagSoundTagBtn');
const tagSoundTagLabel = document.getElementById('tagSoundTagLabel');
const tagSoundSoundBtn = document.getElementById('tagSoundSoundBtn');
const tagSoundSoundLabel = document.getElementById('tagSoundSoundLabel');
const tagSoundSave = document.getElementById('tagSoundSave');
const tagSoundList = document.getElementById('tagSoundList');
const tagSoundHint = document.getElementById('tagSoundHint');
const settingsToggle = document.getElementById('settingsToggle');
const settingsBody = document.getElementById('settingsBody');
const settingsCard = settingsToggle.closest('.settings-card');
const pinBtn = document.getElementById('pinBtn');
const pinHint = document.getElementById('pinHint');
const widgetOnTopLine = document.getElementById('widgetOnTopLine');
const widgetOnTopToggle = document.getElementById('widgetOnTopToggle');

let allTasks = [];
let archivedTasks = [];
let canPinWidget = true;
let widgetState = { visible: false, pinned: false };
let selectedDate = todayString();
let view = 'day';
let editingId = null;
let dragTaskId = null;
let searchQuery = '';
let searchFilter = 'all';
let activeTag = null;
let searchDebounce = null;
let toastTimer = null;
let toastAction = null;
let knownTags = [];
let hiddenTags = [];

function hideToast() {
  clearTimeout(toastTimer);
  toast.hidden = true;
  toastAction = null;
}

function showToast(message, action) {
  clearTimeout(toastTimer);
  toastText.textContent = message;
  toastAction = action || null;
  toastUndo.hidden = !toastAction;
  toast.hidden = false;
  toastTimer = setTimeout(hideToast, 6000);
}

toastUndo.addEventListener('click', async () => {
  const action = toastAction;
  hideToast();
  if (action) await action();
});

function pad(value) {
  return String(value).padStart(2, '0');
}

function toDateString(dt) {
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function todayString() {
  return toDateString(new Date());
}

function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function addDays(dateStr, days) {
  const dt = parseDate(dateStr);
  dt.setDate(dt.getDate() + days);
  return toDateString(dt);
}

function startOfWeek(dateStr) {
  const dt = parseDate(dateStr);
  const offset = (dt.getDay() + 6) % 7;
  dt.setDate(dt.getDate() - offset);
  return toDateString(dt);
}

function shortDate(dateStr) {
  const dt = parseDate(dateStr);
  return `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}`;
}

function recurrenceLabel(recurrence, interval) {
  if (recurrence === 'daily') return t('rec.daily');
  if (recurrence === 'weekly') return t('rec.weekly');
  if (recurrence === 'monthly') return t('rec.monthly');
  if (recurrence === 'weekdays') return t('rec.weekdays');
  if (recurrence === 'everyN') return t('rec.everyN', { count: interval || 2 });
  return '';
}

function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const ai = a.important ? 1 : 0;
    const bi = b.important ? 1 : 0;
    if (ai !== bi) return bi - ai;
    const ao = Number.isFinite(a.order) ? a.order : Number.MAX_SAFE_INTEGER;
    const bo = Number.isFinite(b.order) ? b.order : Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    const at = a.time || '99:99';
    const bt = b.time || '99:99';
    if (at !== bt) return at < bt ? -1 : 1;
    return (a.createdAt || '') < (b.createdAt || '') ? -1 : 1;
  });
}

function tasksFor(dateStr) {
  return sortTasks(allTasks.filter((task) => task.date === dateStr));
}

async function refresh() {
  const [tasks, archived, hidden] = await Promise.all([
    api.listTasks(),
    api.listArchived(),
    api.getHiddenTags()
  ]);
  allTasks = tasks;
  archivedTasks = archived;
  hiddenTags = hidden;
  collectTags();
  renderStats();
  render();
}

function doneDateKey(task) {
  if (!task.done || !task.doneAt) return null;
  const dt = new Date(task.doneAt);
  if (Number.isNaN(dt.getTime())) return null;
  return toDateString(dt);
}

function renderStats() {
  const counts = new Map();
  for (const task of allTasks.concat(archivedTasks)) {
    const key = doneDateKey(task);
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }
  const today = todayString();
  const todayCount = counts.get(today) || 0;
  const days = [];
  let weekCount = 0;
  for (let i = 6; i >= 0; i -= 1) {
    const key = addDays(today, -i);
    const count = counts.get(key) || 0;
    weekCount += count;
    days.push({ key, count });
  }
  statToday.textContent = String(todayCount);
  statWeek.textContent = String(weekCount);

  statsChart.replaceChildren();
  const max = Math.max(1, ...days.map((day) => day.count));
  for (const day of days) {
    const bar = document.createElement('div');
    bar.className = 'stats-bar';
    bar.title = `${formatGroupDate(day.key)}: ${day.count}`;

    const track = document.createElement('div');
    track.className = 'stats-bar-track';
    const fill = document.createElement('div');
    fill.className = 'stats-bar-fill';
    fill.style.height = `${Math.round((day.count / max) * 100)}%`;
    track.appendChild(fill);

    const label = document.createElement('span');
    label.className = 'stats-bar-label';
    label.textContent = window.i18n.weekdayShort(parseDate(day.key).getDay());

    bar.append(track, label);
    statsChart.appendChild(bar);
  }
  const cleanup = cleanupSelect.value;
  statsHint.textContent = cleanup === 'never' ? '' : t('stats.window', { days: cleanup });
}

function collectTags() {
  const seen = new Map();
  const hidden = new Set((hiddenTags || []).map((tag) => tag.toLowerCase()));
  for (const task of allTasks.concat(archivedTasks)) {
    for (const tag of task.tags || []) {
      const key = tag.toLowerCase();
      if (hidden.has(key)) continue;
      if (!seen.has(key)) seen.set(key, tag);
    }
  }
  knownTags = [...seen.values()].sort((a, b) => a.localeCompare(b));
}

function isSearchActive() {
  return !!searchQuery.trim() || !!activeTag || searchFilter !== 'all';
}

function render() {
  if (isSearchActive()) {
    dayView.hidden = true;
    weekView.hidden = true;
    searchView.hidden = false;
    renderSearch();
  } else {
    searchView.hidden = true;
    if (view === 'day') {
      dayView.hidden = false;
      weekView.hidden = true;
      renderDay();
    } else {
      dayView.hidden = true;
      weekView.hidden = false;
      renderWeek();
    }
  }
  tabDay.classList.toggle('active', view === 'day');
  tabWeek.classList.toggle('active', view === 'week');
}

function syncSearchUi() {
  filterChips.querySelectorAll('.filter-chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.filter === searchFilter);
  });
  searchClear.hidden = !isSearchActive();
  if (activeTag) {
    activeTagChip.hidden = false;
    activeTagChip.textContent = `#${activeTag} ×`;
  } else {
    activeTagChip.hidden = true;
  }
}

function clearSearch() {
  searchQuery = '';
  searchInput.value = '';
  searchFilter = 'all';
  activeTag = null;
  syncSearchUi();
}

function setTagFilter(tag) {
  activeTag = activeTag && activeTag.toLowerCase() === tag.toLowerCase() ? null : tag;
  syncSearchUi();
  render();
}

function formatGroupDate(dateStr) {
  if (dateStr === todayString()) return t('nav.today');
  const dt = parseDate(dateStr);
  const year = dt.getFullYear() !== new Date().getFullYear() ? ` ${dt.getFullYear()}` : '';
  return `${window.i18n.weekdayFull(dt.getDay())}, ${dt.getDate()} ${window.i18n.month(dt.getMonth())}${year}`;
}

function renderSearch() {
  const query = searchQuery.trim().toLowerCase();
  const tag = activeTag ? activeTag.toLowerCase() : null;
  const source = searchFilter === 'archived' ? archivedTasks : allTasks;
  let tasks = source.filter((task) => {
    if (tag && !(task.tags || []).some((item) => item.toLowerCase() === tag)) return false;
    if (searchFilter === 'active' && task.done) return false;
    if (searchFilter === 'done' && !task.done) return false;
    if (!query) return true;
    if (query.startsWith('#')) {
      return (task.tags || []).some((item) => item.toLowerCase().includes(query.slice(1)));
    }
    const text = `${task.title || ''}\n${task.note || ''}\n${(task.tags || []).join(' ')}`.toLowerCase();
    return text.includes(query);
  });
  searchStats.textContent = t('search.count', { count: tasks.length });
  clearDoneBtn.hidden = !(searchFilter === 'done' && tasks.length > 0);
  purgeArchiveBtn.hidden = !(searchFilter === 'archived' && tasks.length > 0);

  const groups = new Map();
  for (const task of tasks) {
    const key = task.date || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(task);
  }
  const keys = [...groups.keys()].sort((a, b) => {
    if (!a) return 1;
    if (!b) return -1;
    return a < b ? -1 : 1;
  });

  searchResults.replaceChildren();
  for (const key of keys) {
    const group = document.createElement('div');
    group.className = 'search-group';

    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'search-group-head';
    head.textContent = key ? formatGroupDate(key) : t('day.noDue');
    head.title = t('search.openDay');
    head.addEventListener('click', () => {
      clearSearch();
      selectedDate = key || todayString();
      view = 'day';
      render();
    });
    group.appendChild(head);

    const list = document.createElement('ul');
    list.className = 'day-list';
    for (const task of sortTasks(groups.get(key))) list.appendChild(buildDayRow(task));
    group.appendChild(list);
    searchResults.appendChild(group);
  }
  searchResults.hidden = tasks.length === 0;
  searchEmpty.hidden = tasks.length > 0;
}

function renderDay() {
  const dt = parseDate(selectedDate);
  dayTitle.textContent = `${window.i18n.weekdayFull(dt.getDay())}, ${dt.getDate()} ${window.i18n.month(dt.getMonth())}`;
  rangeLabel.textContent = `${window.i18n.month(dt.getMonth())} ${dt.getFullYear()}`;

  const tasks = tasksFor(selectedDate);
  const today = todayString();
  const overdueTasks = sortTasks(allTasks.filter((task) => task.date && task.date < today && !task.done));
  const noDueTasks = sortTasks(allTasks.filter((task) => !task.date));
  const done = tasks.filter((task) => task.done).length;
  dayStats.textContent = tasks.length ? t('day.stats', { done, total: tasks.length }) : '';

  dayList.replaceChildren();
  for (const task of tasks) dayList.appendChild(buildDayRow(task, { draggable: true }));

  overdueList.replaceChildren();
  for (const task of overdueTasks) overdueList.appendChild(buildDayRow(task, { overdue: true }));
  overdueWrap.hidden = overdueTasks.length === 0;

  noDueList.replaceChildren();
  for (const task of noDueTasks) noDueList.appendChild(buildDayRow(task));
  noDueWrap.hidden = noDueTasks.length === 0;

  dayEmpty.hidden = tasks.length > 0 || noDueTasks.length > 0 || overdueTasks.length > 0;
  dayList.hidden = tasks.length === 0;
}

function buildDayRow(task, options = {}) {
  const isArchived = options.archived === true || task.archived === true;
  const li = document.createElement('li');
  li.className = `${task.done ? 'day-item done' : 'day-item'}${isArchived ? ' archived' : ''}`;
  li.dataset.id = task.id;
  li.tabIndex = -1;
  li.addEventListener('mousedown', (event) => {
    if (!event.target.closest('button')) li.focus();
  });

  const check = document.createElement('button');
  check.className = task.done ? 'checkbox checked' : 'checkbox';
  check.type = 'button';
  check.disabled = isArchived;
  check.title = task.done ? t('task.markUndone') : t('task.markDone');
  check.setAttribute('aria-label', check.title);
  check.addEventListener('click', async () => {
    check.disabled = true;
    await api.toggleTask(task.id, !task.done);
    if (task.done) {
      showToast(t('toast.restored', { title: task.title }), async () => {
        await api.toggleTask(task.id, true);
        await refresh();
      });
    } else {
      showToast(t('toast.done', { title: task.title }), async () => {
        await api.toggleTask(task.id, false);
        await refresh();
      });
    }
    refresh();
  });

  const flag = document.createElement('button');
  flag.className = task.important ? 'flag-btn active' : 'flag-btn';
  flag.type = 'button';
  flag.title = t('task.importantToggle');
  flag.setAttribute('aria-pressed', task.important ? 'true' : 'false');
  flag.textContent = '!';
  flag.addEventListener('click', async () => {
    flag.disabled = true;
    await api.updateTask(task.id, { important: !task.important });
    refresh();
  });

  const body = document.createElement('div');
  body.className = 'day-item-body';

  const top = document.createElement('div');
  top.className = 'day-item-top';

  const title = document.createElement('span');
  title.className = 'day-item-title';
  title.textContent = task.title;
  top.appendChild(title);

  if (task.recurrence !== 'none') {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = recurrenceLabel(task.recurrence, task.recurrenceInterval);
    top.appendChild(badge);
  }

  if (Array.isArray(task.tags) && task.tags.length) {
    const tags = document.createElement('span');
    tags.className = 'task-tags';
    for (const tag of task.tags) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'tag-chip';
      chip.textContent = `#${tag}`;
      chip.title = t('tags.filter');
      chip.addEventListener('click', () => setTagFilter(tag));
      tags.appendChild(chip);
    }
    top.appendChild(tags);
  }

  body.appendChild(top);

  if (task.note) {
    const note = document.createElement('div');
    note.className = 'day-item-note';
    note.textContent = task.note;
    body.appendChild(note);
  }

  li.appendChild(check);
  if (!isArchived) li.appendChild(flag);
  li.appendChild(body);

  if (task.time) {
    const time = document.createElement('span');
    time.className = 'day-item-time';
    time.textContent = task.time;
    li.appendChild(time);
  }

  if (options.overdue && task.date) {
    const dateBadge = document.createElement('span');
    dateBadge.className = 'day-item-date';
    dateBadge.textContent = shortDate(task.date);
    li.appendChild(dateBadge);

    const move = document.createElement('button');
    move.className = 'move-btn';
    move.type = 'button';
    move.title = t('task.moveToday');
    move.textContent = '»';
    move.addEventListener('click', async () => {
      move.disabled = true;
      await api.updateTask(task.id, { date: todayString() });
      refresh();
    });
    li.appendChild(move);
  }

  if (!isArchived) {
    const edit = document.createElement('button');
    edit.className = 'edit-btn';
    edit.type = 'button';
    edit.title = t('task.edit');
    edit.addEventListener('click', () => startEdit(task));
    li.appendChild(edit);
  }

  if (isArchived) {
    const restore = document.createElement('button');
    restore.className = 'restore-btn';
    restore.type = 'button';
    restore.title = t('archive.restore');
    restore.setAttribute('aria-label', restore.title);
    restore.textContent = '↩';
    restore.addEventListener('click', async () => {
      restore.disabled = true;
      await api.unarchiveTask(task.id);
      showToast(t('toast.unarchived', { title: task.title }), async () => {
        await api.archiveTask(task.id);
        await refresh();
      });
      refresh();
    });
    li.appendChild(restore);
  }

  const del = document.createElement('button');
  del.className = 'del-btn';
  del.type = 'button';
  del.title = isArchived ? t('archive.deleteForever') : t('task.delete');
  del.setAttribute('aria-label', del.title);
  del.addEventListener('click', async () => {
    if (isArchived && !window.confirm(t('archive.deleteForeverConfirm', { title: task.title }))) return;
    del.disabled = true;
    const snapshot = { ...task };
    await api.removeTask(task.id);
    showToast(t('toast.deleted', { title: task.title }), async () => {
      await api.restoreTask(snapshot);
      await refresh();
    });
    refresh();
  });
  li.appendChild(del);

  if (options.draggable && !isArchived) attachDrag(li, task);

  return li;
}

function attachDrag(li, task) {
  li.draggable = true;
  li.addEventListener('mousedown', (event) => {
    li.draggable = !event.target.closest('button');
  });
  li.addEventListener('dragstart', (event) => {
    if (!li.draggable) {
      event.preventDefault();
      return;
    }
    dragTaskId = task.id;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', task.id);
    li.classList.add('dragging');
  });
  li.addEventListener('dragend', () => {
    li.classList.remove('dragging');
    dragTaskId = null;
    clearDropMarkers();
  });
  li.addEventListener('dragover', (event) => {
    if (!dragTaskId || dragTaskId === task.id) return;
    event.preventDefault();
    const rect = li.getBoundingClientRect();
    const before = event.clientY < rect.top + rect.height / 2;
    li.classList.toggle('drop-before', before);
    li.classList.toggle('drop-after', !before);
  });
  li.addEventListener('dragleave', () => {
    li.classList.remove('drop-before', 'drop-after');
  });
  li.addEventListener('drop', async (event) => {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData('text/plain') || dragTaskId;
    const rect = li.getBoundingClientRect();
    const before = event.clientY < rect.top + rect.height / 2;
    clearDropMarkers();
    if (!sourceId || sourceId === task.id) return;
    await reorderDay(sourceId, task.id, before);
  });
}

function clearDropMarkers() {
  document.querySelectorAll('.drop-before, .drop-after').forEach((element) => {
    element.classList.remove('drop-before', 'drop-after');
  });
}

async function reorderDay(sourceId, targetId, before) {
  const dayTasks = sortTasks(allTasks.filter((task) => task.date === selectedDate));
  const ids = dayTasks.map((task) => task.id).filter((id) => id !== sourceId);
  const targetIndex = ids.indexOf(targetId);
  if (targetIndex < 0) return;
  ids.splice(before ? targetIndex : targetIndex + 1, 0, sourceId);
  await Promise.all(ids.map((id, index) => api.updateTask(id, { order: index })));
  await refresh();
}

function renderWeek() {
  const start = startOfWeek(selectedDate);
  const end = addDays(start, 6);
  const startDt = parseDate(start);
  const endDt = parseDate(end);
  if (startDt.getMonth() === endDt.getMonth()) {
    rangeLabel.textContent = `${startDt.getDate()} – ${endDt.getDate()} ${window.i18n.month(endDt.getMonth())} ${endDt.getFullYear()}`;
  } else {
    rangeLabel.textContent = `${startDt.getDate()} ${window.i18n.month(startDt.getMonth())} – ${endDt.getDate()} ${window.i18n.month(endDt.getMonth())} ${endDt.getFullYear()}`;
  }

  const today = todayString();
  weekGrid.replaceChildren();

  for (let i = 0; i < 7; i += 1) {
    const dateStr = addDays(start, i);
    const dt = parseDate(dateStr);
    const col = document.createElement('div');
    col.className = 'week-col' + (dateStr === today ? ' today' : '');

    const head = document.createElement('button');
    head.className = 'week-col-head';
    head.type = 'button';
    head.title = t('week.openDay');
    head.textContent = `${window.i18n.weekdayShort(dt.getDay())} ${shortDate(dateStr)}`;
    head.addEventListener('click', () => {
      selectedDate = dateStr;
      view = 'day';
      render();
    });
    col.appendChild(head);

    const body = document.createElement('div');
    body.className = 'week-col-body';

    body.addEventListener('dragover', (event) => {
      if (!dragTaskId) return;
      event.preventDefault();
      col.classList.add('drop-target');
    });
    body.addEventListener('dragleave', (event) => {
      if (event.target === body) col.classList.remove('drop-target');
    });
    body.addEventListener('drop', async (event) => {
      event.preventDefault();
      col.classList.remove('drop-target');
      const id = event.dataTransfer.getData('text/plain') || dragTaskId;
      if (!id) return;
      const task = allTasks.find((item) => item.id === id);
      if (!task || task.date === dateStr) return;
      const maxOrder = allTasks
        .filter((item) => item.date === dateStr && Number.isFinite(item.order))
        .reduce((max, item) => Math.max(max, item.order), -1);
      await api.updateTask(id, { date: dateStr, order: maxOrder + 1 });
      await refresh();
    });

    for (const task of tasksFor(dateStr)) {
      body.appendChild(buildWeekTask(task));
    }

    const add = document.createElement('button');
    add.className = 'week-add';
    add.type = 'button';
    add.title = t('week.addDay');
    add.textContent = '+';
    add.addEventListener('click', () => {
      ppPicker.set(dateInput, dateStr);
      titleInput.focus();
    });
    body.appendChild(add);

    col.appendChild(body);
    weekGrid.appendChild(col);
  }
}

function buildWeekTask(task) {
  const row = document.createElement('div');
  row.className = task.done ? 'week-task done' : 'week-task';
  row.dataset.id = task.id;
  row.draggable = true;
  row.addEventListener('mousedown', (event) => {
    row.draggable = !event.target.closest('button');
  });
  row.addEventListener('dragstart', (event) => {
    if (!row.draggable) {
      event.preventDefault();
      return;
    }
    dragTaskId = task.id;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', task.id);
    row.classList.add('dragging');
  });
  row.addEventListener('dragend', () => {
    row.classList.remove('dragging');
    dragTaskId = null;
    clearDropMarkers();
  });

  const check = document.createElement('button');
  check.className = task.done ? 'checkbox checked' : 'checkbox';
  check.type = 'button';
  check.addEventListener('click', async (event) => {
    event.stopPropagation();
    check.disabled = true;
    await api.toggleTask(task.id, !task.done);
    if (task.done) {
      showToast(t('toast.restored', { title: task.title }), async () => {
        await api.toggleTask(task.id, true);
        await refresh();
      });
    } else {
      showToast(t('toast.done', { title: task.title }), async () => {
        await api.toggleTask(task.id, false);
        await refresh();
      });
    }
    refresh();
  });

  const title = document.createElement('span');
  title.className = 'week-task-title';
  title.textContent = task.time ? `${task.title} · ${task.time}` : task.title;

  row.appendChild(check);
  row.appendChild(title);
  return row;
}

function navigate(days) {
  selectedDate = addDays(selectedDate, view === 'week' ? days * 7 : days);
  render();
}

document.getElementById('btnPrev').addEventListener('click', () => {
  clearSearch();
  navigate(-1);
});
document.getElementById('btnNext').addEventListener('click', () => {
  clearSearch();
  navigate(1);
});
document.getElementById('btnToday').addEventListener('click', () => {
  clearSearch();
  selectedDate = todayString();
  render();
});

tabDay.addEventListener('click', () => {
  clearSearch();
  view = 'day';
  render();
});

tabWeek.addEventListener('click', () => {
  clearSearch();
  view = 'week';
  render();
});

searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    searchQuery = searchInput.value;
    syncSearchUi();
    render();
  }, 150);
});

searchInput.addEventListener('search', () => {
  clearTimeout(searchDebounce);
  searchQuery = searchInput.value;
  syncSearchUi();
  render();
});

searchClear.addEventListener('click', () => {
  clearSearch();
  render();
});

filterChips.addEventListener('click', (event) => {
  const chip = event.target.closest('.filter-chip');
  if (!chip) return;
  searchFilter = chip.dataset.filter;
  syncSearchUi();
  render();
});

activeTagChip.addEventListener('click', () => {
  activeTag = null;
  syncSearchUi();
  render();
});

clearDoneBtn.addEventListener('click', async () => {
  const doneTasks = allTasks.filter((task) => task.done);
  if (!doneTasks.length) return;
  if (!window.confirm(t('search.clearDoneConfirm', { count: doneTasks.length }))) return;
  for (const task of doneTasks) await api.archiveTask(task.id);
  showToast(t('toast.archivedCount', { count: doneTasks.length }), async () => {
    for (const task of doneTasks) await api.unarchiveTask(task.id);
    await refresh();
  });
  await refresh();
});

purgeArchiveBtn.addEventListener('click', async () => {
  if (!archivedTasks.length) return;
  if (!window.confirm(t('archive.purgeConfirm', { count: archivedTasks.length }))) return;
  const snapshots = archivedTasks.map((task) => ({ ...task }));
  await api.purgeArchived(0);
  showToast(t('toast.purged', { count: snapshots.length }), async () => {
    for (const snapshot of snapshots) await api.restoreTask(snapshot);
    await refresh();
  });
  await refresh();
});

function setNoNotifyUi(noNotify) {
  noNotifyToggle.checked = noNotify;
  dateInput.disabled = noNotify;
  timeInput.disabled = noNotify;
  repeatInput.disabled = noNotify;
  repeatBtn.disabled = noNotify;
  repeatInterval.disabled = noNotify;
  noNotifyHint.hidden = !noNotify;
}

const RECURRENCE_VALUES = ['none', 'daily', 'weekly', 'monthly', 'weekdays', 'everyN'];

function clampInterval(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 2;
  return Math.min(365, Math.max(2, Math.round(number)));
}

function repeatLabel(value, interval) {
  if (value === 'daily') return t('repeat.daily');
  if (value === 'weekly') return t('repeat.weekly');
  if (value === 'monthly') return t('repeat.monthly');
  if (value === 'weekdays') return t('repeat.weekdays');
  if (value === 'everyN') return t('repeat.everyN', { count: interval });
  return t('repeat.none');
}

function setRepeat(value, interval) {
  const next = RECURRENCE_VALUES.includes(value) ? value : 'none';
  repeatInput.value = next;
  if (interval != null) repeatInterval.value = String(clampInterval(interval));
  const count = clampInterval(repeatInterval.value);
  repeatInterval.value = String(count);
  repeatInterval.hidden = next !== 'everyN';
  repeatBtn.textContent = repeatLabel(next, count);
}

function parseTags(value) {
  return String(value || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function nextOrderFor(date) {
  const list = allTasks.filter((task) => task.date === date && Number.isFinite(task.order));
  if (!list.length) return null;
  return Math.max(...list.map((task) => task.order)) + 1;
}

function startEdit(task) {
  editingId = task.id;
  addCardTitle.textContent = t('edit.title');
  addSubmit.textContent = t('button.save');
  cancelEdit.hidden = false;
  titleInput.value = task.title;
  setNoNotifyUi(task.notify === false);
  ppPicker.set(dateInput, task.date || '');
  ppPicker.set(timeInput, task.time || '');
  setRepeat(task.recurrence || 'none', task.recurrenceInterval || 2);
  importantToggle.checked = !!task.important;
  tagsInput.value = (task.tags || []).join(', ');
  noteInput.value = task.note || '';
  growNote();
  titleInput.focus();
  titleInput.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function resetAddMode(clear) {
  editingId = null;
  addCardTitle.textContent = t('add.title');
  addSubmit.textContent = t('button.add');
  cancelEdit.hidden = true;
  if (clear) {
    titleInput.value = '';
    tagsInput.value = '';
    importantToggle.checked = false;
    noteInput.value = '';
    growNote();
    setNoNotifyUi(false);
    ppPicker.set(dateInput, todayString());
    ppPicker.set(timeInput, '');
    setRepeat('none');
  }
}

cancelEdit.addEventListener('click', () => {
  resetAddMode(true);
  render();
});

addForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const title = titleInput.value.trim();
  if (!title) return;
  const noNotify = noNotifyToggle.checked;
  const important = importantToggle.checked;
  const tags = parseTags(tagsInput.value);
  const payload = noNotify
    ? { title, date: null, time: null, recurrence: 'none', recurrenceInterval: null, notify: false, note: noteInput.value.trim(), important, tags }
    : {
        title,
        date: ppPicker.get(dateInput) || todayString(),
        time: ppPicker.get(timeInput) || null,
        recurrence: repeatInput.value,
        recurrenceInterval: repeatInput.value === 'everyN' ? Number(repeatInterval.value) : null,
        notify: true,
        note: noteInput.value.trim(),
        important,
        tags
      };
  const wasEditing = !!editingId;
  if (!wasEditing && payload.date) {
    const next = nextOrderFor(payload.date);
    if (next != null) payload.order = next;
  }
  if (wasEditing) {
    await api.updateTask(editingId, payload);
  } else {
    await api.addTask(payload);
  }
  resetAddMode(true);
  titleInput.focus();
  await refresh();
  if (!wasEditing && view === 'day' && payload.date) selectedDate = payload.date;
  render();
});

noNotifyToggle.addEventListener('change', () => {
  const noNotify = noNotifyToggle.checked;
  dateInput.disabled = noNotify;
  timeInput.disabled = noNotify;
  repeatInput.disabled = noNotify;
  noNotifyHint.hidden = !noNotify;
});

addForm.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && editingId) {
    resetAddMode(true);
    render();
  }
});

openPlannerToggle.addEventListener('change', async () => {
  await api.setOpenPlanner(openPlannerToggle.checked);
});

exportBtn.addEventListener('click', async () => {
  const result = await api.exportData();
  if (result && result.count != null) dataHint.textContent = t('data.exported', { count: result.count });
  else if (result && result.error) dataHint.textContent = t('data.failed');
});

importBtn.addEventListener('click', async () => {
  const result = await api.importData();
  if (result && result.count != null) {
    dataHint.textContent = t('data.imported', { count: result.count });
    await refresh();
  } else if (result && result.error) {
    dataHint.textContent = t('data.failed');
  }
});

openDataBtn.addEventListener('click', () => api.openDataFolder());

cleanupSelect.addEventListener('change', async () => {
  const result = await api.setCleanup(cleanupSelect.value);
  cleanupSelect.value = result.value;
  cleanupHint.textContent = result.archived ? t('cleanup.archived', { count: result.archived }) : t('cleanup.hint');
  renderStats();
  if (result.archived) await refresh();
});

async function loadCleanup() {
  const value = await api.getCleanup();
  cleanupSelect.value = ['never', '30', '90'].includes(value) ? value : 'never';
}

document.getElementById('btnMin').addEventListener('click', () => api.minimizePlanner());
document.getElementById('btnClose').addEventListener('click', () => api.hidePlanner());

const btnMax = document.getElementById('btnMax');

function updateMaxButton(maximized) {
  btnMax.classList.toggle('restore', !!maximized);
  btnMax.title = maximized ? t('window.restore') : t('window.maximize');
  btnMax.setAttribute('aria-label', btnMax.title);
}

btnMax.addEventListener('click', async () => {
  const maximized = await api.toggleMaximize();
  updateMaxButton(maximized);
});

api.onPlannerMaximized((maximized) => updateMaxButton(maximized));

noteInput.addEventListener('input', growNote);

tagsToggle.addEventListener('click', () => {
  if (window.ppPicker && ppPicker.toggleTags) {
    ppPicker.toggleTags(tagsInput, knownTags, tagsToggle, async (tag) => {
      const hidden = await api.hideTag(tag);
      hiddenTags = Array.isArray(hidden) ? hidden : hiddenTags;
      collectTags();
    });
  }
});

repeatBtn.addEventListener('click', () => {
  if (repeatBtn.disabled || !window.ppPicker || !ppPicker.openChoices) return;
  ppPicker.openChoices(repeatBtn, [
    { value: 'none', label: t('repeat.none') },
    { value: 'daily', label: t('repeat.daily') },
    { value: 'weekly', label: t('repeat.weekly') },
    { value: 'monthly', label: t('repeat.monthly') },
    { value: 'weekdays', label: t('repeat.weekdays') },
    { value: 'everyN', label: t('repeat.everyN', { count: clampInterval(repeatInterval.value) }) }
  ], repeatInput.value, (value) => {
    setRepeat(value);
    if (value === 'everyN') repeatInterval.focus();
  });
});

repeatInterval.addEventListener('input', () => {
  if (repeatInput.value === 'everyN') setRepeat('everyN');
});
repeatInterval.addEventListener('change', () => {
  if (repeatInput.value === 'everyN') setRepeat('everyN');
});

autostartToggle.addEventListener('change', async () => {
  await api.setAutostart(autostartToggle.checked);
});

function applyWidgetState(state) {
  widgetState = {
    visible: !!(state && state.visible),
    pinned: !!(state && state.pinned)
  };
  if (!canPinWidget) {
    pinHint.textContent = t('pin.floating');
    return;
  }
  if (widgetState.visible && widgetState.pinned) {
    pinBtn.textContent = t('pin.pinned');
    pinBtn.disabled = true;
    pinHint.textContent = t('pin.hint');
  } else if (!widgetState.visible) {
    pinBtn.textContent = t('pin.show');
    pinBtn.disabled = false;
    pinHint.textContent = t('pin.hiddenHint');
  } else {
    pinBtn.textContent = t('pin.button');
    pinBtn.disabled = false;
    pinHint.textContent = t('pin.hint');
  }
}

pinBtn.addEventListener('click', async () => {
  pinBtn.disabled = true;
  pinBtn.textContent = t('pin.pinning');
  try {
    const ok = await api.pinWidget();
    if (ok) {
      applyWidgetState({ visible: true, pinned: true });
    } else {
      pinBtn.textContent = t('pin.button');
      pinBtn.disabled = false;
      pinHint.textContent = t('pin.failed');
    }
  } catch (err) {
    pinBtn.textContent = t('pin.button');
    pinBtn.disabled = false;
    pinHint.textContent = t('pin.failed');
  }
});

widgetOnTopToggle.addEventListener('change', async () => {
  const value = await api.setWidgetOnTop(widgetOnTopToggle.checked);
  widgetOnTopToggle.checked = !!value;
});

async function loadInfo() {
  const info = await api.getInfo();
  autostartToggle.checked = !!info.autostart;
  openPlannerToggle.checked = info.openPlannerOnStart !== false;
  appVersion.textContent = `Go, Now! v${info.version}`;
  canPinWidget = info.canPin !== false;
  pinBtn.hidden = !canPinWidget;
  widgetOnTopLine.hidden = canPinWidget;
  widgetOnTopToggle.checked = !!info.widgetAlwaysOnTop;
  if (!canPinWidget) {
    pinHint.textContent = t('pin.floating');
    return;
  }
  applyWidgetState({ visible: info.widgetVisible, pinned: info.pinned });
  if (info.widgetVisible && info.autostart && !info.packaged) {
    pinHint.textContent = t('autostart.devHint');
  }
}

ppPicker.set(dateInput, todayString());
setRepeat('none');
api.onTasksChanged(refresh);
if (api.onWidgetState) api.onWidgetState((state) => applyWidgetState(state));
syncSearchUi();
loadInfo();
loadCleanup();
loadSound();
refresh();

function applyTheme(theme) {
  const value = theme || 'peach';
  document.documentElement.dataset.theme = value;
  themeGrid.querySelectorAll('.theme-card').forEach((button) => {
    button.classList.toggle('active', button.dataset.theme === value);
  });
}

function applyLogo(dataUrl) {
  const source = dataUrl || 'assets/logo.png';
  brandLogo.src = source;
  logoPreview.src = source;
}

let soundInfo = null;
let pendingSound = null;
let previewTimer = 0;
let tagSoundTagKey = 'important';
let tagSoundSoundId = null;

const BUILTIN_SOUNDS = [
  { id: 'soft', key: 'sound.soft' },
  { id: 'pixel', key: 'sound.pixel' },
  { id: 'bell', key: 'sound.bell' },
  { id: 'pulse', key: 'sound.pulse' },
  { id: 'chime', key: 'sound.chime' },
  { id: 'click', key: 'sound.click' }
];

function soundErrorText(code) {
  if (code === 'size') return t('sound.sizeError');
  if (code === 'type') return t('sound.typeError');
  if (code === 'save') return t('sound.saveError');
  if (code === 'limit') return t('sound.limit');
  if (code === 'name') return t('sound.nameRequired');
  if (code === 'custom-missing' || code === 'missing') return t('sound.missing');
  return t('sound.readError');
}

function soundLabel(id) {
  const builtin = BUILTIN_SOUNDS.find((item) => item.id === id);
  if (builtin) return t(builtin.key);
  const custom = soundInfo && Array.isArray(soundInfo.custom)
    ? soundInfo.custom.find((item) => item.id === id)
    : null;
  return custom ? custom.name : null;
}

function setSoundVolumeUi(value) {
  const number = Number(value);
  const volume = Number.isFinite(number) ? Math.min(100, Math.max(0, Math.round(number))) : 80;
  soundVolume.value = String(volume);
  soundVolumeValue.textContent = `${volume}%`;
  soundVolume.style.setProperty('--sound-volume', `${volume}%`);
  soundVolume.setAttribute('aria-valuetext', `${volume}%`);
  return volume;
}

function applySoundUi(payload) {
  soundInfo = payload || {
    value: 'soft',
    selected: 'soft',
    volume: 80,
    custom: [],
    selectedCustom: null,
    missing: false
  };
  const selectedLabel = soundLabel(soundInfo.selected) || soundLabel(soundInfo.value) || t('sound.soft');
  soundSelectLabel.textContent = selectedLabel;
  soundSelectBtn.title = selectedLabel;
  setSoundVolumeUi(soundInfo.volume);
  if (soundInfo.missing) {
    soundHint.textContent = t('sound.missing');
  } else {
    soundHint.textContent = t('sound.hint');
  }
  renderTagSoundList();
  syncTagSoundEditor();
}

async function loadSound() {
  try {
    applySoundUi(await api.getSound());
  } catch (err) {
    applySoundUi(null);
  }
}

function tagSoundBindings() {
  const bindings = soundInfo && soundInfo.tagSounds;
  return bindings && typeof bindings === 'object' && !Array.isArray(bindings) ? bindings : {};
}

function tagSoundKey(tag) {
  const value = String(tag || '').trim().replace(/\s+/g, ' ');
  return value ? `tag:${value.toLowerCase()}` : null;
}

function tagSoundLabel(key) {
  if (key === 'important') return t('tagSound.important');
  if (typeof key === 'string' && key.startsWith('tag:')) return `#${key.slice(4)}`;
  return String(key || '');
}

function tagSoundTagItems() {
  const items = [{ key: 'important', label: t('tagSound.important') }];
  const seen = new Set(['important']);
  const tags = [];
  const push = (key, label) => {
    if (!key || seen.has(key)) return;
    seen.add(key);
    tags.push({ key, label });
  };
  for (const tag of knownTags) {
    const key = tagSoundKey(tag);
    push(key, `#${String(tag).trim()}`);
  }
  for (const key of Object.keys(tagSoundBindings())) {
    if (key.startsWith('tag:')) push(key, `#${key.slice(4)}`);
  }
  tags.sort((a, b) => a.label.localeCompare(b.label));
  return items.concat(tags);
}

function tagSoundSoundItems() {
  const items = [{ value: '', label: t('tagSound.general') }];
  for (const item of BUILTIN_SOUNDS) items.push({ value: item.id, label: t(item.key) });
  for (const item of (soundInfo && soundInfo.custom) || []) {
    if (item.available !== false) items.push({ value: item.id, label: item.name });
  }
  return items;
}

function tagSoundSoundName(id) {
  if (!id) return t('tagSound.general');
  return soundLabel(id) || id;
}

function tagSoundBindingFor(key) {
  const value = tagSoundBindings()[key];
  return typeof value === 'string' ? value : null;
}

function syncTagSoundEditor() {
  const tags = tagSoundTagItems();
  if (!tags.some((item) => item.key === tagSoundTagKey)) {
    tagSoundTagKey = tags[0] ? tags[0].key : 'important';
    tagSoundSoundId = tagSoundBindingFor(tagSoundTagKey) || '';
  }
  const tag = tags.find((item) => item.key === tagSoundTagKey) || tags[0];
  const sounds = tagSoundSoundItems();
  if (tagSoundSoundId === null) {
    tagSoundSoundId = tagSoundBindingFor(tagSoundTagKey) || '';
  }
  if (tagSoundSoundId && !sounds.some((item) => item.value === tagSoundSoundId)) {
    tagSoundSoundId = '';
  }
  tagSoundTagLabel.textContent = tag ? tag.label : t('tagSound.important');
  tagSoundTagBtn.title = tagSoundTagLabel.textContent;
  tagSoundSoundLabel.textContent = tagSoundSoundName(tagSoundSoundId);
  tagSoundSoundBtn.title = tagSoundSoundLabel.textContent;
}

function selectTagSoundTag(key) {
  tagSoundTagKey = key;
  tagSoundSoundId = tagSoundBindingFor(key) || '';
  syncTagSoundEditor();
}

function selectTagSoundSound(id) {
  tagSoundSoundId = id;
  syncTagSoundEditor();
}

function openTagSoundTagMenu() {
  if (!window.ppPicker || !ppPicker.openChoices) return;
  const items = tagSoundTagItems().map((item) => ({ value: item.key, label: item.label }));
  ppPicker.openChoices(tagSoundTagBtn, items, tagSoundTagKey, selectTagSoundTag, { className: 'sound-picker' });
}

function openTagSoundSoundMenu() {
  if (!window.ppPicker || !ppPicker.openChoices) return;
  const items = tagSoundSoundItems();
  ppPicker.openChoices(tagSoundSoundBtn, items, tagSoundSoundId === null ? '' : tagSoundSoundId, selectTagSoundSound, { className: 'sound-picker' });
}

function renderTagSoundList() {
  tagSoundList.replaceChildren();
  const bindings = tagSoundBindings();
  const entries = Object.entries(bindings)
    .filter(([key, value]) => (key === 'important' || key.startsWith('tag:')) && typeof value === 'string')
    .sort(([keyA], [keyB]) => {
      if (keyA === 'important') return -1;
      if (keyB === 'important') return 1;
      return tagSoundLabel(keyA).localeCompare(tagSoundLabel(keyB));
    });
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'tag-sound-empty';
    empty.textContent = t('tagSound.empty');
    tagSoundList.appendChild(empty);
    return;
  }
  for (const [key, sound] of entries) {
    const row = document.createElement('div');
    row.className = 'tag-sound-item';
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.dataset.key = key;
    const name = document.createElement('span');
    name.className = 'tag-sound-item-name';
    name.textContent = tagSoundLabel(key);
    const soundName = document.createElement('span');
    soundName.className = 'tag-sound-item-sound';
    soundName.textContent = tagSoundSoundName(sound);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'tag-sound-remove';
    remove.textContent = '\u00d7';
    remove.title = t('tagSound.remove');
    remove.setAttribute('aria-label', t('tagSound.remove'));
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      removeTagSoundBinding(key);
    });
    row.append(name, soundName, remove);
    row.addEventListener('click', () => {
      selectTagSoundTag(key);
    });
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectTagSoundTag(key);
      }
    });
    tagSoundList.appendChild(row);
  }
}

async function saveTagSound() {
  const hadSound = !!tagSoundSoundId;
  tagSoundSave.disabled = true;
  try {
    const result = await api.setTagSound({ key: tagSoundTagKey, sound: tagSoundSoundId });
    if (!result || !result.ok) {
      if (result && result.reason === 'invalid-key') {
        tagSoundHint.textContent = t('tagSound.error');
      } else if (result && result.reason === 'custom-missing') {
        tagSoundHint.textContent = t('sound.missing');
      } else {
        tagSoundHint.textContent = t('sound.saveError');
      }
      return;
    }
    applySoundUi(result);
    tagSoundHint.textContent = hadSound ? t('tagSound.saved') : t('tagSound.removed');
  } catch (err) {
    tagSoundHint.textContent = t('sound.saveError');
  } finally {
    tagSoundSave.disabled = false;
  }
}

async function removeTagSoundBinding(key) {
  try {
    const result = await api.setTagSound({ key, sound: '' });
    if (!result || !result.ok) {
      tagSoundHint.textContent = t('sound.saveError');
      return;
    }
    if (tagSoundTagKey === key) tagSoundSoundId = '';
    applySoundUi(result);
    tagSoundHint.textContent = t('tagSound.removed');
  } catch (err) {
    tagSoundHint.textContent = t('sound.saveError');
  }
}

function flashPreview() {
  clearTimeout(previewTimer);
  soundPreviewBtn.classList.add('playing');
  previewTimer = setTimeout(() => soundPreviewBtn.classList.remove('playing'), 700);
}

async function previewSound(id) {
  if (!window.ppSound) {
    soundHint.textContent = t('sound.readError');
    return false;
  }
  if (window.ppSound) window.ppSound.stop();
  let dataUrl = null;
  const custom = soundInfo && Array.isArray(soundInfo.custom)
    ? soundInfo.custom.find((item) => item.id === id)
    : null;
  if (custom) {
    const data = await api.getSoundData(id);
    if (!data || data.error) {
      soundHint.textContent = soundErrorText(data && data.error);
      return false;
    }
    dataUrl = data.dataUrl;
  }
  if (soundInfo && soundInfo.value !== id) return false;
  try {
    flashPreview();
    const played = await window.ppSound.play(id, dataUrl, Number(soundVolume.value) / 100);
    if (custom && played === false) {
      soundHint.textContent = t('sound.readError');
      return false;
    }
    return true;
  } catch (err) {
    soundHint.textContent = t('sound.readError');
    return false;
  }
}

async function selectSound(id) {
  const custom = soundInfo && Array.isArray(soundInfo.custom)
    ? soundInfo.custom.find((item) => item.id === id)
    : null;
  if (custom && !custom.available) {
    soundHint.textContent = t('sound.missing');
    return;
  }
  try {
    const result = await api.setSound(id);
    if (!result || !result.ok) {
      soundHint.textContent = soundErrorText(result && result.reason);
      await loadSound();
      return;
    }
    applySoundUi(result);
    soundHint.textContent = t('sound.saved');
    await previewSound(result.value);
  } catch (err) {
    soundHint.textContent = t('sound.readError');
    await loadSound();
  }
}

function openSoundMenu() {
  if (!window.ppPicker || !ppPicker.openChoices || soundSelectBtn.disabled) return;
  if (window.ppSound) window.ppSound.stop();
  const items = BUILTIN_SOUNDS.map((item) => ({ value: item.id, label: t(item.key) }));
  for (const item of (soundInfo && soundInfo.custom) || []) {
    items.push({ value: item.id, label: item.name, remove: true });
  }
  const maxCustom = soundInfo && Number.isFinite(Number(soundInfo.maxCustom)) ? Number(soundInfo.maxCustom) : 5;
  if (!soundInfo || (soundInfo.custom || []).length < maxCustom) {
    items.push({ value: '__add', label: `+ ${t('sound.add')}` });
  }
  ppPicker.openChoices(
    soundSelectBtn,
    items,
    soundInfo ? soundInfo.selected : 'soft',
    (value) => {
      if (value === '__add') {
        chooseSoundFile();
        return;
      }
      selectSound(value);
    },
    {
      className: 'sound-picker',
      onRemove: removeSound,
      removeTitle: t('sound.remove')
    }
  );
}

async function chooseSoundFile() {
  if (window.ppSound) window.ppSound.stop();
  soundSelectBtn.disabled = true;
  soundPreviewBtn.disabled = true;
  try {
    const result = await api.chooseSound();
    if (!result) return;
    if (result.error) {
      soundHint.textContent = soundErrorText(result.error);
      return;
    }
    openSoundName(result);
  } catch (err) {
    soundHint.textContent = t('sound.saveError');
  } finally {
    soundSelectBtn.disabled = false;
    soundPreviewBtn.disabled = false;
  }
}

function openSoundName(result) {
  pendingSound = result;
  soundNameInput.value = result.suggestedName || '';
  soundNameHint.textContent = t('sound.nameHint');
  soundNameOverlay.hidden = false;
  setTimeout(() => {
    soundNameInput.focus();
    soundNameInput.select();
  }, 0);
}

function closeSoundName() {
  soundNameOverlay.hidden = true;
  pendingSound = null;
  soundNameInput.value = '';
}

async function saveSoundName() {
  if (!pendingSound) return;
  const name = soundNameInput.value.trim();
  if (!name) {
    soundNameHint.textContent = t('sound.nameRequired');
    soundNameInput.focus();
    return;
  }
  soundNameSave.disabled = true;
  try {
    const result = await api.addSound({ source: pendingSound.source, name });
    if (!result || result.error) {
      soundNameHint.textContent = soundErrorText(result && result.error);
      return;
    }
    closeSoundName();
    applySoundUi(result);
    soundHint.textContent = t('sound.added');
    await previewSound(result.value);
  } catch (err) {
    soundNameHint.textContent = t('sound.saveError');
  } finally {
    soundNameSave.disabled = false;
  }
}

async function removeSound(id) {
  if (window.ppSound) window.ppSound.stop();
  try {
    const result = await api.removeSound(id);
    if (!result || result.canceled) return;
    if (!result.ok) {
      soundHint.textContent = soundErrorText(result.reason);
      return;
    }
    applySoundUi(result);
    soundHint.textContent = t('sound.removed');
  } catch (err) {
    soundHint.textContent = t('sound.saveError');
  }
}

soundSelectBtn.addEventListener('click', openSoundMenu);
soundPreviewBtn.addEventListener('click', () => {
  if (soundInfo) previewSound(soundInfo.selected);
});
soundVolume.addEventListener('input', () => {
  setSoundVolumeUi(soundVolume.value);
});
soundVolume.addEventListener('change', async () => {
  try {
    const result = await api.setSoundVolume(Number(soundVolume.value));
    if (result && result.ok) {
      applySoundUi(result);
    } else {
      await loadSound();
      soundHint.textContent = t('sound.saveError');
    }
  } catch (err) {
    await loadSound();
    soundHint.textContent = t('sound.saveError');
  }
});
tagSoundTagBtn.addEventListener('click', openTagSoundTagMenu);
tagSoundSoundBtn.addEventListener('click', openTagSoundSoundMenu);
tagSoundSave.addEventListener('click', saveTagSound);
soundNameSave.addEventListener('click', saveSoundName);
soundNameCancel.addEventListener('click', closeSoundName);
soundNameInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    saveSoundName();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    closeSoundName();
  }
});
soundNameOverlay.addEventListener('click', (event) => {
  if (event.target === soundNameOverlay) closeSoundName();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !soundNameOverlay.hidden) closeSoundName();
});
if (window.i18n) {
  window.i18n.onLanguageChange(() => {
    if (soundInfo) applySoundUi(soundInfo);
    applyWidgetState(widgetState);
  });
}

function applyLanguageUi(language) {
  languageRow.querySelectorAll('.lang-card').forEach((button) => {
    button.classList.toggle('active', button.dataset.language === language);
  });
}

themeGrid.addEventListener('click', async (event) => {
  const button = event.target.closest('.theme-card');
  if (!button) return;
  const theme = await api.setTheme(button.dataset.theme);
  applyTheme(theme);
});

languageRow.addEventListener('click', async (event) => {
  const button = event.target.closest('.lang-card');
  if (!button) return;
  const language = await api.setLanguage(button.dataset.language);
  if (window.i18n.getLanguage() !== language) window.i18n.setLanguage(language);
  applyLanguageUi(language);
});

function setSettingsOpen(open) {
  settingsBody.hidden = !open;
  settingsToggle.setAttribute('aria-expanded', String(open));
  settingsCard.classList.toggle('open', open);
  if (!open && window.ppSound) window.ppSound.stop();
  if (!open) closeSoundName();
}

settingsToggle.addEventListener('click', () => {
  setSettingsOpen(settingsBody.hidden);
});

setSettingsOpen(false);

function setStatsOpen(open) {
  statsBody.hidden = !open;
  statsToggle.setAttribute('aria-expanded', String(open));
  statsCard.classList.toggle('open', open);
}

statsToggle.addEventListener('click', () => {
  setStatsOpen(statsBody.hidden);
});

setStatsOpen(false);

let mcpInfo = null;
let mcpOpen = false;
let lastFocusedBeforeMcp = null;

const MCP_CLIENTS = [
  { id: 'opencode', name: 'opencode' },
  { id: 'claude', name: 'Claude Desktop' },
  { id: 'cursor', name: 'Cursor' },
  { id: 'cline', name: 'Cline' },
  { id: 'generic', name: '' }
];

function clientConfigPath(client, platformName) {
  if (client.id === 'opencode') return '~/.config/opencode/opencode.json';
  if (client.id === 'cursor') return '~/.cursor/mcp.json';
  if (client.id === 'claude') {
    if (platformName === 'darwin') return '~/Library/Application Support/Claude/claude_desktop_config.json';
    if (platformName === 'linux') return '~/.config/Claude/claude_desktop_config.json';
    return '%APPDATA%\\Claude\\claude_desktop_config.json';
  }
  if (client.id === 'cline') {
    if (platformName === 'darwin') {
      return '~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json';
    }
    if (platformName === 'linux') {
      return '~/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json';
    }
    return '%APPDATA%\\Code\\User\\globalStorage\\saoudrizwan.claude-dev\\settings\\cline_mcp_settings.json';
  }
  return '';
}

function buildMcpSnippet(clientId, info) {
  const packaged = !!(info && info.packaged);
  const exe = info ? info.exePath : '';
  const script = info ? info.mcpPath : '';
  if (clientId === 'opencode') {
    const server = packaged
      ? { type: 'local', command: [exe, script], environment: { ELECTRON_RUN_AS_NODE: '1' }, enabled: true }
      : { type: 'local', command: ['node', script], enabled: true };
    return JSON.stringify({ mcp: { gonow: server } }, null, 2);
  }
  const server = packaged
    ? { command: exe, args: [script], env: { ELECTRON_RUN_AS_NODE: '1' } }
    : { command: 'node', args: [script] };
  return JSON.stringify({ mcpServers: { gonow: server } }, null, 2);
}

function renderMcpClients() {
  mcpClients.replaceChildren();
  for (const client of MCP_CLIENTS) {
    const row = document.createElement('div');
    row.className = 'mcp-client';
    row.dataset.client = client.id;

    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'mcp-client-head';

    const name = document.createElement('span');
    name.className = 'mcp-client-name';
    name.textContent = client.id === 'generic' ? t('mcp.generic') : client.name;

    const path = document.createElement('span');
    path.className = 'mcp-client-path';
    path.textContent = client.id === 'generic'
      ? t('mcp.genericPath')
      : t('mcp.configFile', { path: clientConfigPath(client, (mcpInfo && mcpInfo.platform) || 'win32') });

    const plus = document.createElement('span');
    plus.className = 'mcp-plus';
    plus.setAttribute('aria-hidden', 'true');

    head.append(name, path, plus);

    const body = document.createElement('div');
    body.className = 'mcp-client-body';
    body.hidden = true;

    const code = document.createElement('pre');
    code.className = 'mcp-code';
    code.textContent = buildMcpSnippet(client.id, mcpInfo);

    const actions = document.createElement('div');
    actions.className = 'mcp-actions';

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'pixel-btn small mcp-copy';
    copy.textContent = t('mcp.copy');

    const copied = document.createElement('span');
    copied.className = 'hint mcp-copied';
    copied.hidden = true;
    copied.textContent = t('mcp.copied');

    copy.addEventListener('click', async () => {
      try {
        await api.copyText(code.textContent);
        copied.textContent = t('mcp.copied');
        copied.hidden = false;
        clearTimeout(row.copyTimer);
        row.copyTimer = setTimeout(() => {
          copied.hidden = true;
        }, 1600);
      } catch (err) {
        copied.textContent = t('mcp.copyFailed');
        copied.hidden = false;
      }
    });

    head.addEventListener('click', () => {
      const willOpen = body.hidden;
      mcpClients.querySelectorAll('.mcp-client').forEach((item) => {
        item.classList.remove('open');
        const itemBody = item.querySelector('.mcp-client-body');
        if (itemBody) itemBody.hidden = true;
      });
      if (willOpen) {
        row.classList.add('open');
        body.hidden = false;
      }
    });

    actions.append(copy, copied);
    body.append(code, actions);
    row.append(head, body);
    mcpClients.appendChild(row);
  }
  mcpMissing.hidden = !(mcpInfo && mcpInfo.mcpExists === false);
}

async function openMcpPanel() {
  lastFocusedBeforeMcp = document.activeElement;
  mcpOverlay.hidden = false;
  mcpOpen = true;
  try {
    mcpInfo = await api.getMcpInfo();
  } catch (err) {
    mcpInfo = null;
  }
  renderMcpClients();
  mcpClose.focus();
}

function closeMcpPanel() {
  mcpOverlay.hidden = true;
  mcpOpen = false;
  if (lastFocusedBeforeMcp && typeof lastFocusedBeforeMcp.focus === 'function') {
    lastFocusedBeforeMcp.focus();
  }
  lastFocusedBeforeMcp = null;
}

mcpBtn.addEventListener('click', openMcpPanel);
mcpClose.addEventListener('click', closeMcpPanel);
mcpOverlay.addEventListener('mousedown', (event) => {
  if (event.target === mcpOverlay) closeMcpPanel();
});
document.addEventListener('keydown', (event) => {
  if (!mcpOpen || event.key !== 'Escape') return;
  event.preventDefault();
  event.stopPropagation();
  closeMcpPanel();
}, true);

document.addEventListener('keydown', (event) => {
  if (!mcpOpen || event.key !== 'Tab') return;
  const focusables = [...mcpOverlay.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.hidden && element.offsetParent !== null);
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}, true);

let paletteOpen = false;
let lastFocusedBeforePalette = null;
let paletteResults = [];
let paletteIndex = -1;

function activateFilter(filter) {
  searchFilter = filter;
  searchQuery = '';
  searchInput.value = '';
  activeTag = null;
  syncSearchUi();
  render();
}

function paletteCommands() {
  const commands = [
    {
      id: 'new-task',
      label: t('palette.newTask'),
      keywords: 'new task add создать новая дело добавить',
      run: () => {
        resetAddMode(true);
        render();
        titleInput.focus();
        titleInput.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    },
    {
      id: 'search',
      label: t('palette.search'),
      keywords: 'search find найти поиск задача',
      run: () => {
        clearSearch();
        render();
        searchInput.focus();
        searchInput.select();
        searchInput.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    },
    {
      id: 'today',
      label: t('palette.today'),
      keywords: 'today сегодня день',
      run: () => {
        clearSearch();
        selectedDate = todayString();
        view = 'day';
        render();
      }
    },
    {
      id: 'week',
      label: t('palette.week'),
      keywords: 'week неделя',
      run: () => {
        clearSearch();
        selectedDate = todayString();
        view = 'week';
        render();
      }
    },
    {
      id: 'filter-active',
      label: t('palette.active'),
      keywords: 'active активные фильтр',
      run: () => activateFilter('active')
    },
    {
      id: 'filter-done',
      label: t('palette.done'),
      keywords: 'done completed выполненные готовые',
      run: () => activateFilter('done')
    },
    {
      id: 'filter-archived',
      label: t('palette.archive'),
      keywords: 'archive архив',
      run: () => activateFilter('archived')
    },
    {
      id: 'stats',
      label: t('palette.stats'),
      keywords: 'stats statistics статистика',
      run: () => {
        setStatsOpen(true);
        statsCard.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    },
    {
      id: 'settings',
      label: t('palette.settings'),
      keywords: 'settings настройки',
      run: () => {
        setSettingsOpen(true);
        settingsCard.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    },
    {
      id: 'mcp',
      label: t('palette.mcp'),
      keywords: 'mcp ai connect подключить агент',
      run: () => openMcpPanel()
    },
    {
      id: 'export',
      label: t('palette.export'),
      keywords: 'export экспорт json',
      run: () => exportBtn.click()
    },
    {
      id: 'import',
      label: t('palette.import'),
      keywords: 'import импорт json',
      run: () => importBtn.click()
    },
    {
      id: 'folder',
      label: t('palette.folder'),
      keywords: 'folder data папка данные',
      run: () => api.openDataFolder()
    }
  ];

  for (const button of themeGrid.querySelectorAll('.theme-card')) {
    const value = button.dataset.theme;
    const name = t(`theme.${value}`);
    commands.push({
      id: `theme-${value}`,
      label: t('palette.theme', { name }),
      keywords: `theme тема ${value} ${name}`,
      run: async () => {
        const theme = await api.setTheme(value);
        applyTheme(theme);
      }
    });
  }

  for (const button of languageRow.querySelectorAll('.lang-card')) {
    const value = button.dataset.language;
    const name = t(`language.${value}`);
    commands.push({
      id: `language-${value}`,
      label: t('palette.language', { name }),
      keywords: `language язык locale ${value} ${name}`,
      run: async () => {
        const language = await api.setLanguage(value);
        if (window.i18n.getLanguage() !== language) window.i18n.setLanguage(language);
        applyLanguageUi(language);
      }
    });
  }

  return commands;
}

function fuzzyScore(text, query) {
  if (!query) return 0;
  const hay = String(text || '').toLowerCase();
  const needle = String(query || '').toLowerCase();
  const direct = hay.indexOf(needle);
  if (direct !== -1) return 1000 - direct;
  let from = 0;
  let streak = 0;
  let score = 0;
  for (const char of needle) {
    const index = hay.indexOf(char, from);
    if (index === -1) return -1;
    score += 1;
    if (index === from) {
      streak += 1;
      score += streak;
    } else {
      streak = 0;
    }
    from = index + 1;
  }
  return score;
}

function setPaletteActive(index) {
  if (!paletteResults.length) {
    paletteIndex = -1;
    paletteInput.setAttribute('aria-activedescendant', '');
    return;
  }
  paletteIndex = ((index % paletteResults.length) + paletteResults.length) % paletteResults.length;
  const items = [...paletteList.children];
  items.forEach((item, itemIndex) => {
    const active = itemIndex === paletteIndex;
    item.classList.toggle('active', active);
    item.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  const activeItem = items[paletteIndex];
  if (activeItem) {
    activeItem.scrollIntoView({ block: 'nearest' });
    paletteInput.setAttribute('aria-activedescendant', activeItem.id);
  }
}

function renderPalette() {
  const query = paletteInput.value.trim();
  const commands = paletteCommands();
  const scored = commands
    .map((command, order) => ({
      command,
      order,
      score: fuzzyScore(`${command.label} ${command.keywords || ''} ${command.id}`, query)
    }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => (b.score - a.score) || (a.order - b.order));
  paletteResults = scored.map((item) => item.command);
  paletteList.replaceChildren();

  if (!paletteResults.length) {
    const empty = document.createElement('li');
    empty.className = 'palette-empty';
    empty.setAttribute('role', 'presentation');
    empty.textContent = t('palette.empty');
    paletteList.appendChild(empty);
    paletteIndex = -1;
    paletteInput.setAttribute('aria-activedescendant', '');
    return;
  }

  paletteResults.forEach((command, index) => {
    const item = document.createElement('li');
    item.className = 'palette-item';
    item.id = `palette-option-${index}`;
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', 'false');
    const label = document.createElement('span');
    label.className = 'palette-label';
    label.textContent = command.label;
    item.appendChild(label);
    item.addEventListener('mousedown', (event) => event.preventDefault());
    item.addEventListener('mousemove', () => setPaletteActive(index));
    item.addEventListener('click', () => runPaletteCommand(command));
    paletteList.appendChild(item);
  });
  setPaletteActive(0);
}

function openPalette() {
  if (activeHotkeyCapture) return;
  if (paletteOpen) {
    paletteInput.focus();
    return;
  }
  if (mcpOpen) closeMcpPanel();
  lastFocusedBeforePalette = document.activeElement;
  paletteOpen = true;
  paletteOverlay.hidden = false;
  paletteInput.value = '';
  paletteInput.setAttribute('aria-expanded', 'true');
  renderPalette();
  paletteInput.focus();
}

function closePalette() {
  if (!paletteOpen) return;
  paletteOpen = false;
  paletteOverlay.hidden = true;
  paletteInput.setAttribute('aria-expanded', 'false');
  paletteInput.setAttribute('aria-activedescendant', '');
  paletteInput.value = '';
  const previous = lastFocusedBeforePalette;
  lastFocusedBeforePalette = null;
  if (previous && previous.isConnected && typeof previous.focus === 'function') previous.focus();
}

async function runPaletteCommand(command) {
  if (!command) return;
  closePalette();
  try {
    await command.run();
  } catch (err) {
    console.error('[palette] command failed:', err);
  }
}

paletteInput.addEventListener('input', renderPalette);
paletteOverlay.addEventListener('mousedown', (event) => {
  if (event.target === paletteOverlay) closePalette();
});

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && !event.altKey && String(event.key).toLowerCase() === 'k') {
    if (activeHotkeyCapture) return;
    event.preventDefault();
    event.stopPropagation();
    if (paletteOpen) closePalette();
    else openPalette();
    return;
  }
  if (!paletteOpen || event.isComposing) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closePalette();
    return;
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    event.stopPropagation();
    setPaletteActive(paletteIndex + (event.key === 'ArrowDown' ? 1 : -1));
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    event.stopPropagation();
    runPaletteCommand(paletteResults[paletteIndex]);
    return;
  }
  if (event.key === 'Tab') {
    event.preventDefault();
    event.stopPropagation();
    paletteInput.focus();
  }
}, true);

logoChooseBtn.addEventListener('click', async () => {
  logoChooseBtn.disabled = true;
  try {
    const result = await api.chooseLogo();
    if (result && typeof result === 'object' && result.error) {
      logoHint.textContent = result.error === 'read' ? t('logo.readError') : t('logo.saveError');
    } else if (typeof result === 'string' && result.length) {
      applyLogo(result);
      logoHint.textContent = t('logo.updated');
    }
  } finally {
    logoChooseBtn.disabled = false;
  }
});

logoResetBtn.addEventListener('click', async () => {
  const result = await api.resetLogo();
  applyLogo(result);
  logoHint.textContent = t('logo.default');
});

let activeHotkeyCapture = null;
let savingHotkey = false;

function acceleratorFromEvent(event) {
  const parts = [];
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push('Super');
  if (event.key === 'Control' || event.key === 'Alt' || event.key === 'Shift' || event.key === 'Meta') return '';
  let name = '';
  const code = event.code || '';
  if (/^Key[A-Z]$/.test(code)) name = code.slice(3);
  else if (/^Digit[0-9]$/.test(code)) name = code.slice(5);
  else if (/^Numpad[0-9]$/.test(code)) name = code.slice(6);
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(event.key)) name = event.key;
  else if (code === 'Space') name = 'Space';
  else if (code === 'Tab') name = 'Tab';
  else if (code === 'Enter' || code === 'NumpadEnter') name = 'Enter';
  else if (code === 'Backspace') name = 'Backspace';
  else if (code === 'Delete') name = 'Delete';
  else if (code === 'Home') name = 'Home';
  else if (code === 'End') name = 'End';
  else if (code === 'PageUp') name = 'PageUp';
  else if (code === 'PageDown') name = 'PageDown';
  else if (code === 'Insert') name = 'Insert';
  else if (code === 'ArrowUp') name = 'Up';
  else if (code === 'ArrowDown') name = 'Down';
  else if (code === 'ArrowLeft') name = 'Left';
  else if (code === 'ArrowRight') name = 'Right';
  else if (/^[A-Za-z0-9]$/.test(event.key)) name = event.key.toUpperCase();
  if (!name || !parts.length) return '';
  return `${parts.join('+')}+${name}`;
}

function hotkeyField(kind) {
  if (kind === 'planner') {
    return { kind, input: hotkeyInput, hint: hotkeyHint, hintKey: 'hotkey.hint', reset: hotkeyResetBtn };
  }
  return { kind, input: quickHotkeyInput, hint: quickHotkeyHint, hintKey: 'hotkey.quickHint', reset: quickHotkeyResetBtn };
}

function setHotkeyField(field, entry) {
  const value = entry && entry.value ? entry.value : '';
  field.input.value = entry && entry.display ? entry.display : '';
  field.input.placeholder = t('hotkey.none');
  field.input.title = t('hotkey.changeTitle');
  field.hint.textContent = value && entry && entry.registered === false ? t('hotkey.failed') : t(field.hintKey);
}

async function loadHotkeys() {
  const info = await api.getHotkeys();
  setHotkeyField(hotkeyField('planner'), info.planner);
  setHotkeyField(hotkeyField('quick'), info.quick);
}

function setCapturing(field, on) {
  field.input.classList.toggle('capturing', on);
  if (on) activeHotkeyCapture = field;
  else if (activeHotkeyCapture === field) activeHotkeyCapture = null;
}

async function cancelHotkeyCapture() {
  const field = activeHotkeyCapture;
  if (!field) return;
  setCapturing(field, false);
  try {
    await api.resumeHotkeys();
  } catch (err) {
    // ignore
  }
  if (!activeHotkeyCapture) {
    try {
      await loadHotkeys();
    } catch (err) {
      // ignore
    }
  }
}

async function startHotkeyCapture(kind) {
  if (savingHotkey) return;
  if (activeHotkeyCapture) {
    if (activeHotkeyCapture.kind === kind) return;
    await cancelHotkeyCapture();
  }
  const field = hotkeyField(kind);
  setCapturing(field, true);
  field.hint.textContent = t('hotkey.press');
  try {
    await api.pauseHotkeys();
  } catch (err) {
    setCapturing(field, false);
    field.hint.textContent = t('hotkey.failed');
  }
}

function hotkeyFailureText(result) {
  if (result && result.reason === 'duplicate') return t('hotkey.duplicate');
  if (result && result.reason === 'invalid') return t('hotkey.invalid');
  return t('hotkey.failed');
}

async function applyHotkeyResult(result, kind) {
  const field = hotkeyField(kind);
  await loadHotkeys();
  if (result && result.ok) {
    field.hint.textContent = t('hotkey.saved');
    return true;
  }
  field.hint.textContent = hotkeyFailureText(result);
  return false;
}

function setupHotkeyField(kind) {
  const field = hotkeyField(kind);
  field.input.addEventListener('click', () => {
    startHotkeyCapture(kind);
  });
  field.input.addEventListener('blur', () => {
    cancelHotkeyCapture();
  });
  field.reset.addEventListener('click', async () => {
    if (savingHotkey) return;
    if (activeHotkeyCapture) await cancelHotkeyCapture();
    savingHotkey = true;
    field.reset.disabled = true;
    try {
      const result = await api.resetHotkey(kind);
      const ok = await applyHotkeyResult(result, kind);
      if (ok) field.hint.textContent = t('hotkey.resetDone');
    } catch (err) {
      await loadHotkeys();
      field.hint.textContent = t('hotkey.failed');
    } finally {
      field.reset.disabled = false;
      savingHotkey = false;
    }
  });
}

setupHotkeyField('planner');
setupHotkeyField('quick');

window.addEventListener('keydown', async (event) => {
  if (!activeHotkeyCapture) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.key === 'Escape') {
    await cancelHotkeyCapture();
    return;
  }
  const accel = acceleratorFromEvent(event);
  if (!accel) {
    activeHotkeyCapture.hint.textContent = t('hotkey.press');
    return;
  }
  const field = activeHotkeyCapture;
  setCapturing(field, false);
  savingHotkey = true;
  try {
    const result = await api.setHotkey(field.kind, accel);
    await applyHotkeyResult(result, field.kind);
  } catch (err) {
    try {
      await api.resumeHotkeys();
    } catch (inner) {
      // ignore
    }
    await loadHotkeys();
    field.hint.textContent = t('hotkey.failed');
  } finally {
    savingHotkey = false;
  }
});

window.addEventListener('blur', () => {
  cancelHotkeyCapture();
});

function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function visibleTaskRows() {
  return [...document.querySelectorAll('.day-item')].filter((row) => row.offsetParent !== null);
}

function focusTaskRow(delta) {
  const rows = visibleTaskRows();
  if (!rows.length) return;
  const current = document.activeElement && document.activeElement.closest
    ? document.activeElement.closest('.day-item')
    : null;
  let index = current ? rows.indexOf(current) : -1;
  if (index < 0) index = delta > 0 ? -1 : 0;
  const next = rows[Math.min(rows.length - 1, Math.max(0, index + delta))];
  if (next) next.focus();
}

document.addEventListener('keydown', (event) => {
  if (paletteOpen || mcpOpen) return;
  if (isTypingTarget(event.target)) return;

  if ((event.ctrlKey || event.metaKey) && (event.key === 'f' || event.key === 'F')) {
    event.preventDefault();
    searchInput.focus();
    searchInput.select();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && (event.key === 'n' || event.key === 'N')) {
    event.preventDefault();
    titleInput.focus();
    titleInput.scrollIntoView({ block: 'nearest' });
    return;
  }
  if (event.key === '/') {
    event.preventDefault();
    searchInput.focus();
    searchInput.select();
    return;
  }
  if (event.key === 'n' || event.key === 'N') {
    event.preventDefault();
    titleInput.focus();
    titleInput.scrollIntoView({ block: 'nearest' });
    return;
  }
  if (event.key === 'Escape') {
    if (isSearchActive()) {
      event.preventDefault();
      clearSearch();
      render();
    }
    return;
  }

  const row = document.activeElement && document.activeElement.closest
    ? document.activeElement.closest('.day-item')
    : null;
  if (!row) return;

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    focusTaskRow(event.key === 'ArrowDown' ? 1 : -1);
  } else if (event.key === ' ' || event.key === 'Spacebar') {
    event.preventDefault();
    const check = row.querySelector('.checkbox');
    if (check) check.click();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    const edit = row.querySelector('.edit-btn');
    if (edit) edit.click();
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    const del = row.querySelector('.del-btn');
    if (del) del.click();
  }
});

window.i18n.onLanguageChange((language) => {
  applyLanguageUi(language);
  applyTheme(document.documentElement.dataset.theme);
  logoHint.textContent = t('logo.hint');
  if (mcpClients.childElementCount) renderMcpClients();
  setRepeat(repeatInput.value);
  if (editingId) {
    addCardTitle.textContent = t('edit.title');
    addSubmit.textContent = t('button.save');
  }
  if (!activeHotkeyCapture) loadHotkeys();
  updateMaxButton(btnMax.classList.contains('restore'));
  cleanupHint.textContent = t('cleanup.hint');
  syncSearchUi();
  refresh();
  loadInfo();
  loadCleanup();
  loadSound();
});

api.onThemeChanged((theme) => applyTheme(theme));

api.getTheme().then((theme) => applyTheme(theme));
api.getLogo().then((logo) => applyLogo(logo));
applyLanguageUi(window.i18n.getLanguage());
loadHotkeys();
growNote();
})();
