(() => {
const api = window.api;
const t = (key, params) => window.i18n.t(key, params);

const listEl = document.getElementById('taskList');
const emptyEl = document.getElementById('emptyState');
const counterEl = document.getElementById('counter');
const progressEl = document.getElementById('progressFill');
const addForm = document.getElementById('addForm');
const addInput = document.getElementById('addInput');
const plusBtn = document.getElementById('plusBtn');
const noNotifyToggle = document.getElementById('noNotifyToggle');
const addDate = document.getElementById('addDate');
const addTime = document.getElementById('addTime');
const whenBtn = document.getElementById('whenBtn');
const whenRow = document.getElementById('whenRow');
const editLabel = document.getElementById('editLabel');
const cancelEdit = document.getElementById('cancelEdit');
const todayLabel = document.getElementById('todayLabel');
const dragHandle = document.getElementById('dragHandle');

let todayTasks = [];
let overdueTasks = [];
let editingId = null;

function pad(value) {
  return String(value).padStart(2, '0');
}

function toDateString(dt) {
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function todayString() {
  return toDateString(new Date());
}

async function refresh() {
  const all = await api.listTasks();
  const today = todayString();
  todayTasks = all.filter((task) => task.date === today || !task.date);
  overdueTasks = all.filter((task) => task.date && task.date < today && !task.done);
  render();
}

function sortByTime(a, b) {
  if (a.done !== b.done) return a.done ? 1 : -1;
  const at = a.time || '99:99';
  const bt = b.time || '99:99';
  if (at !== bt) return at < bt ? -1 : 1;
  return (a.createdAt || '') < (b.createdAt || '') ? -1 : 1;
}

function sortOverdue(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const at = a.time || '99:99';
  const bt = b.time || '99:99';
  if (at !== bt) return at < bt ? -1 : 1;
  return (a.createdAt || '') < (b.createdAt || '') ? -1 : 1;
}

function render() {
  const now = new Date();
  todayLabel.textContent = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} · ${window.i18n.weekdayShort(now.getDay())}`;

  const tasks = [...todayTasks].sort(sortByTime);
  const overdue = [...overdueTasks].sort(sortOverdue);

  listEl.replaceChildren();
  if (overdue.length) {
    const head = document.createElement('li');
    head.className = 'task-group-head';
    head.textContent = t('widget.incomplete');
    listEl.appendChild(head);
    for (const task of overdue) listEl.appendChild(buildRow(task, { overdue: true }));
  }
  for (const task of tasks) listEl.appendChild(buildRow(task));

  const total = overdue.length + tasks.length;
  const done = tasks.filter((task) => task.done).length;
  counterEl.textContent = `${done} / ${total}`;
  progressEl.style.width = total ? `${Math.round((done / total) * 100)}%` : '0%';
  emptyEl.hidden = total > 0;
}

function buildRow(task, options = {}) {
  const li = document.createElement('li');
  li.className = task.done ? 'task done' : 'task';

  const check = document.createElement('button');
  check.className = task.done ? 'checkbox checked' : 'checkbox';
  check.type = 'button';
  check.setAttribute('aria-label', task.done ? t('widget.restore') : t('widget.markDone'));
  check.addEventListener('click', async () => {
    check.disabled = true;
    await api.toggleTask(task.id, !task.done);
    refresh();
  });

  const body = document.createElement('div');
  body.className = 'task-body';

  const title = document.createElement('span');
  title.className = 'task-title';
  title.textContent = task.title;
  body.appendChild(title);

  if (options.overdue && task.date) {
    const parts = task.date.split('-');
    const label = `${parts[2]}.${parts[1]}`;
    const due = document.createElement('span');
    due.className = 'task-due-date';
    due.textContent = task.time ? `${label} · ${task.time}` : label;
    body.appendChild(due);
  } else if (task.time) {
    const time = document.createElement('span');
    time.className = 'task-time';
    time.textContent = task.time;
    body.appendChild(time);
  } else if (!task.date) {
    const noDue = document.createElement('span');
    noDue.className = 'task-nodue';
    noDue.textContent = t('widget.noDue');
    body.appendChild(noDue);
  }

  li.appendChild(check);
  li.appendChild(body);

  if (task.recurrence !== 'none') {
    const dot = document.createElement('span');
    dot.className = 'rec-dot';
    dot.title = task.recurrence === 'weekly' ? t('widget.repeatsWeekly') : t('widget.repeatsDaily');
    li.appendChild(dot);
  }

  if (options.overdue) {
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

  const edit = document.createElement('button');
  edit.className = 'edit-btn';
  edit.type = 'button';
  edit.title = t('task.edit');
  edit.addEventListener('click', () => startEdit(task));
  li.appendChild(edit);

  return li;
}

function syncWhenBtn() {
  const dateValue = ppPicker.get(addDate);
  const timeValue = ppPicker.get(addTime);
  if (dateValue) {
    const parts = dateValue.split('-');
    const short = `${parts[2]}.${parts[1]}`;
    whenBtn.textContent = timeValue ? `${short} ${timeValue}` : short;
    whenBtn.classList.add('active');
    return;
  }
  whenBtn.textContent = t('widget.when');
  whenBtn.classList.remove('active');
}

function setDateEnabled(enabled) {
  whenBtn.disabled = !enabled;
  if (!enabled) whenRow.hidden = true;
}

function resetForm() {
  editingId = null;
  editLabel.hidden = true;
  cancelEdit.hidden = true;
  addInput.value = '';
  noNotifyToggle.checked = false;
  ppPicker.set(addDate, '');
  ppPicker.set(addTime, '');
  whenRow.hidden = true;
  setDateEnabled(true);
  syncWhenBtn();
}

function startEdit(task) {
  editingId = task.id;
  editLabel.hidden = false;
  cancelEdit.hidden = false;
  addInput.value = task.title;
  const noNotify = task.notify === false;
  noNotifyToggle.checked = noNotify;
  setDateEnabled(!noNotify);
  ppPicker.set(addDate, task.date || '');
  ppPicker.set(addTime, task.time || '');
  whenRow.hidden = true;
  syncWhenBtn();
  addForm.hidden = false;
  addInput.focus();
}

plusBtn.addEventListener('click', () => {
  if (!addForm.hidden) {
    resetForm();
    addForm.hidden = true;
    return;
  }
  resetForm();
  addForm.hidden = false;
  addInput.focus();
});

whenBtn.addEventListener('click', () => {
  if (noNotifyToggle.checked) return;
  whenRow.hidden = !whenRow.hidden;
});

addDate.addEventListener('change', syncWhenBtn);
addTime.addEventListener('change', syncWhenBtn);

noNotifyToggle.addEventListener('change', () => {
  setDateEnabled(!noNotifyToggle.checked);
  if (noNotifyToggle.checked && !editingId) {
    ppPicker.set(addDate, '');
    ppPicker.set(addTime, '');
    syncWhenBtn();
  }
});

cancelEdit.addEventListener('click', () => {
  resetForm();
  addForm.hidden = true;
});

addForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const title = addInput.value.trim();
  if (!title) return;
  const noNotify = noNotifyToggle.checked;
  const payload = {
    title,
    date: noNotify ? null : (ppPicker.get(addDate) || todayString()),
    time: noNotify ? null : (ppPicker.get(addTime) || null),
    notify: !noNotify
  };
  if (editingId) {
    await api.updateTask(editingId, payload);
  } else {
    await api.addTask({ ...payload, recurrence: 'none' });
  }
  resetForm();
  refresh();
  addForm.hidden = true;
});

addForm.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    resetForm();
    addForm.hidden = true;
  }
});

document.getElementById('openPlanner').addEventListener('click', () => api.openPlanner());

let dragging = false;
let startX = 0;
let startY = 0;
let resizing = false;
let resizeStartX = 0;
let resizeStartY = 0;

function endGesture() {
  if (resizing) {
    resizing = false;
    api.resizeEnd();
  }
  if (dragging) {
    dragging = false;
    api.dragEnd();
  }
}

dragHandle.addEventListener('pointerdown', async (event) => {
  if (event.target.closest('button')) return;
  dragging = true;
  startX = event.screenX;
  startY = event.screenY;
  await api.dragStart();
  try {
    if (event.pointerId != null) dragHandle.setPointerCapture(event.pointerId);
  } catch (err) {
    // ignore
  }
  event.preventDefault();
});

const resizeGrip = document.getElementById('resizeGrip');

resizeGrip.addEventListener('pointerdown', async (event) => {
  event.preventDefault();
  event.stopPropagation();
  resizing = true;
  resizeStartX = event.screenX;
  resizeStartY = event.screenY;
  await api.resizeStart();
  try {
    if (event.pointerId != null) resizeGrip.setPointerCapture(event.pointerId);
  } catch (err) {
    // ignore
  }
});

window.addEventListener('pointermove', (event) => {
  if ((dragging || resizing) && event.buttons === 0) {
    endGesture();
    return;
  }
  if (resizing) {
    api.resizeMove(event.screenX - resizeStartX, event.screenY - resizeStartY);
    return;
  }
  if (!dragging) return;
  api.dragMove(event.screenX - startX, event.screenY - startY);
});

window.addEventListener('pointerup', endGesture);
window.addEventListener('pointercancel', endGesture);
window.addEventListener('blur', endGesture);

dragHandle.addEventListener('dblclick', (event) => {
  if (event.target.closest('button')) return;
  api.openPlanner();
});

api.onTasksChanged(refresh);
api.getTheme().then((theme) => {
  document.documentElement.dataset.theme = theme || 'peach';
});
api.onThemeChanged((theme) => {
  document.documentElement.dataset.theme = theme;
});
window.i18n.onLanguageChange(() => {
  syncWhenBtn();
  refresh();
});
setInterval(refresh, 60000);
refresh();
})();
