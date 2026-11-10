const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_REMINDER_TIME = '09:00';
const RECURRENCES = new Set(['none', 'daily', 'weekly']);
const MAX_TAGS = 5;
const MAX_TAG_LENGTH = 24;

class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'pixel-planner.json');
    this.backupDir = path.join(dir, 'backups');
    this.data = this.load();
    this.saveTimer = null;
  }

  load() {
    const base = { tasks: [], settings: { autostart: true, widgetPos: null, widgetSize: null, theme: 'peach', customLogo: null, language: 'ru', hotkey: 'Alt+Shift+Q', quickHotkey: 'CommandOrControl+Alt+Space', openPlannerOnStart: true, autoCleanupDone: 'never', widgetAlwaysOnTop: false, hiddenTags: [] } };
    const parsed = this.readStoreFile();
    if (parsed && typeof parsed === 'object') {
      base.tasks = Array.isArray(parsed.tasks) ? parsed.tasks.map(normalizeTask) : [];
      base.settings = { ...base.settings, ...(parsed.settings || {}) };
    }
    if (!Array.isArray(base.settings.hiddenTags)) base.settings.hiddenTags = [];
    return base;
  }

  readStoreFile() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      console.error('[store] load failed:', err.message);
      this.quarantineCorrupt();
      const fromBak = tryReadJson(`${this.file}.bak`);
      if (fromBak) {
        console.error('[store] recovered from backup');
        return fromBak;
      }
      const newest = this.newestBackup();
      if (newest) {
        const fromDaily = tryReadJson(newest);
        if (fromDaily) {
          console.error(`[store] recovered from ${newest}`);
          return fromDaily;
        }
      }
      return null;
    }
  }

  quarantineCorrupt() {
    try {
      if (!fs.existsSync(this.file)) return;
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      fs.copyFileSync(this.file, `${this.file}.corrupt-${stamp}.json`);
    } catch (err) {
      // ignore
    }
  }

  newestBackup() {
    try {
      const files = fs.readdirSync(this.backupDir)
        .filter((name) => /^pixel-planner-\d{4}-\d{2}-\d{2}\.json$/.test(name))
        .sort();
      if (!files.length) return null;
      return path.join(this.backupDir, files[files.length - 1]);
    } catch (err) {
      return null;
    }
  }

  scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 150);
  }

  saveNow() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const tmp = `${this.file}.tmp`;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const fd = fs.openSync(tmp, 'w');
      try {
        fs.writeFileSync(fd, JSON.stringify(this.data, null, 2), 'utf8');
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('[store] save failed:', err.message);
      try {
        fs.unlinkSync(tmp);
      } catch (inner) {
        // ignore
      }
    }
  }

  getSettings() {
    return this.data.settings;
  }

  setSettings(patch) {
    this.data.settings = { ...this.data.settings, ...patch };
    this.scheduleSave();
  }

  hideTag(tag) {
    const clean = String(tag || '').trim().slice(0, 24);
    const current = Array.isArray(this.data.settings.hiddenTags) ? this.data.settings.hiddenTags : [];
    if (!clean) return current;
    if (!current.some((item) => item.toLowerCase() === clean.toLowerCase())) {
      this.data.settings.hiddenTags = [...current, clean];
      this.scheduleSave();
    }
    return this.data.settings.hiddenTags;
  }

  revealTags(tags) {
    const list = Array.isArray(tags) ? tags : [];
    const current = Array.isArray(this.data.settings.hiddenTags) ? this.data.settings.hiddenTags : [];
    if (!list.length || !current.length) return;
    const lower = new Set(list.map((tag) => String(tag).toLowerCase()));
    const next = current.filter((tag) => !lower.has(String(tag).toLowerCase()));
    if (next.length !== current.length) {
      this.data.settings.hiddenTags = next;
      this.scheduleSave();
    }
  }

  listTasks() {
    return this.data.tasks
      .map((task) => ({ ...task }))
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        const at = a.time || '99:99';
        const bt = b.time || '99:99';
        if (at !== bt) return at < bt ? -1 : 1;
        return (a.createdAt || '') < (b.createdAt || '') ? -1 : 1;
      });
  }

  getTask(id) {
    return this.data.tasks.find((task) => task.id === id) || null;
  }

  addTask(input) {
    const title = String(input.title || '').trim().slice(0, 140);
    if (!title) throw new Error('title required');
    const notify = input.notify !== false;
    const date = notify ? (isDateString(input.date) ? input.date : todayString()) : null;
    const task = {
      id: crypto.randomUUID(),
      title,
      date,
      time: date && isTimeString(input.time) ? input.time : null,
      note: String(input.note || '').trim().slice(0, 1000),
      recurrence: date && RECURRENCES.has(input.recurrence) ? input.recurrence : 'none',
      notify,
      important: !!input.important,
      tags: sanitizeTags(input.tags),
      order: Number.isFinite(input.order) ? input.order : null,
      done: false,
      doneAt: null,
      notifiedFor: null,
      snoozeUntil: null,
      spawnedId: null,
      spawnedBy: null,
      createdAt: new Date().toISOString()
    };
    this.data.tasks.push(task);
    this.revealTags(task.tags);
    this.scheduleSave();
    return task;
  }

  updateTask(id, input) {
    const task = this.getTask(id);
    if (!task) return null;
    const title = String(input.title != null ? input.title : task.title).trim().slice(0, 140);
    if (!title) return null;
    const notify = input.notify !== undefined ? input.notify !== false : task.notify !== false;
    const dateRaw = input.date !== undefined ? input.date : task.date;
    const date = notify ? (isDateString(dateRaw) ? dateRaw : todayString()) : null;
    const timeRaw = input.time !== undefined ? input.time : task.time;
    const time = date && isTimeString(timeRaw) ? timeRaw : null;
    const recurrence = date
      ? (RECURRENCES.has(input.recurrence) ? input.recurrence : (RECURRENCES.has(task.recurrence) ? task.recurrence : 'none'))
      : 'none';
    const scheduleChanged = date !== task.date || time !== task.time || recurrence !== task.recurrence || notify !== (task.notify !== false);
    task.title = title;
    task.date = date;
    task.time = time;
    task.recurrence = recurrence;
    task.notify = notify;
    if (input.important !== undefined) task.important = !!input.important;
    if (input.tags !== undefined) task.tags = sanitizeTags(input.tags);
    if (input.order !== undefined) task.order = Number.isFinite(input.order) ? input.order : null;
    if (input.note !== undefined) task.note = String(input.note || '').trim().slice(0, 1000);
    if (input.tags !== undefined) this.revealTags(task.tags);
    if (scheduleChanged) {
      task.notifiedFor = null;
      task.snoozeUntil = null;
    }
    this.scheduleSave();
    return task;
  }

  setDone(id, done) {
    const task = this.getTask(id);
    if (!task) return null;
    const want = !!done;
    if (task.done === want) return task;
    task.done = want;
    task.doneAt = want ? new Date().toISOString() : null;
    if (want && task.recurrence !== 'none' && !task.spawnedId) {
      const next = this.spawnNext(task);
      if (next) {
        task.spawnedId = next.id;
        next.spawnedBy = task.id;
      }
    }
    if (!want) this.discardSpawn(task);
    this.scheduleSave();
    return task;
  }

  spawnNext(task) {
    const stepDays = task.recurrence === 'weekly' ? 7 : 1;
    let nextDate = addDays(task.date, stepDays);
    const today = todayString();
    let guard = 0;
    while (nextDate < today && guard < 500) {
      nextDate = addDays(nextDate, stepDays);
      guard += 1;
    }
    const next = {
      ...task,
      id: crypto.randomUUID(),
      date: nextDate,
      done: false,
      doneAt: null,
      notifiedFor: null,
      snoozeUntil: null,
      spawnedId: null,
      spawnedBy: task.id,
      createdAt: new Date().toISOString()
    };
    this.data.tasks.push(next);
    return next;
  }

  discardSpawn(task) {
    if (!task.spawnedId) return;
    const child = this.getTask(task.spawnedId);
    if (child && !child.done) {
      this.data.tasks = this.data.tasks.filter((item) => item.id !== child.id);
    }
    task.spawnedId = null;
  }

  removeTask(id) {
    const task = this.getTask(id);
    if (!task) return;
    if (task.spawnedBy) {
      const parent = this.getTask(task.spawnedBy);
      if (parent && parent.spawnedId === id) parent.spawnedId = null;
    }
    this.data.tasks = this.data.tasks.filter((item) => item.id !== id);
    this.scheduleSave();
  }

  replaceTasks(list) {
    const next = [];
    for (const raw of Array.isArray(list) ? list : []) {
      if (!raw || typeof raw !== 'object') continue;
      const title = String(raw.title || '').trim().slice(0, 140);
      if (!title) continue;
      const notify = raw.notify !== false;
      const date = notify ? (isDateString(raw.date) ? raw.date : todayString()) : null;
      next.push({
        id: typeof raw.id === 'string' && raw.id ? raw.id : crypto.randomUUID(),
        title,
        date,
        time: date && isTimeString(raw.time) ? raw.time : null,
        note: String(raw.note || '').trim().slice(0, 1000),
        recurrence: date && RECURRENCES.has(raw.recurrence) ? raw.recurrence : 'none',
        notify,
        important: !!raw.important,
        tags: sanitizeTags(raw.tags),
        order: Number.isFinite(raw.order) ? raw.order : null,
        done: !!raw.done,
        doneAt: raw.done ? raw.doneAt || new Date().toISOString() : null,
        notifiedFor: raw.notifiedFor || null,
        snoozeUntil: raw.snoozeUntil || null,
        spawnedId: raw.spawnedId || null,
        spawnedBy: raw.spawnedBy || null,
        createdAt: raw.createdAt || new Date().toISOString()
      });
    }
    this.data.tasks = next;
    this.revealTags(next.flatMap((task) => task.tags));
    this.scheduleSave();
    return next.length;
  }

  snooze(id, ms) {
    const task = this.getTask(id);
    if (!task) return;
    task.snoozeUntil = Date.now() + ms;
    task.notifiedFor = null;
    this.scheduleSave();
  }

  restoreTask(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return null;
    const id = typeof snapshot.id === 'string' && snapshot.id ? snapshot.id : crypto.randomUUID();
    const existing = this.getTask(id);
    if (existing) return existing;
    const title = String(snapshot.title || '').trim().slice(0, 140);
    if (!title) return null;
    const notify = snapshot.notify !== false;
    const date = notify ? (isDateString(snapshot.date) ? snapshot.date : todayString()) : null;
    const task = {
      ...snapshot,
      id,
      title,
      date,
      time: date && isTimeString(snapshot.time) ? snapshot.time : null,
      note: String(snapshot.note || '').trim().slice(0, 1000),
      recurrence: date && RECURRENCES.has(snapshot.recurrence) ? snapshot.recurrence : 'none',
      notify,
      important: !!snapshot.important,
      tags: sanitizeTags(snapshot.tags),
      order: Number.isFinite(snapshot.order) ? snapshot.order : null,
      done: !!snapshot.done,
      doneAt: snapshot.done ? (snapshot.doneAt || new Date().toISOString()) : null,
      notifiedFor: snapshot.notifiedFor || null,
      snoozeUntil: snapshot.snoozeUntil || null,
      spawnedId: snapshot.spawnedId || null,
      spawnedBy: snapshot.spawnedBy || null,
      createdAt: snapshot.createdAt || new Date().toISOString()
    };
    this.data.tasks.push(task);
    this.revealTags(task.tags);
    this.scheduleSave();
    return task;
  }

  cleanupDone(days) {
    const limit = Number(days);
    if (!Number.isFinite(limit) || limit <= 0) return 0;
    const cutoff = Date.now() - limit * 24 * 60 * 60 * 1000;
    const before = this.data.tasks.length;
    this.data.tasks = this.data.tasks.filter((task) => {
      if (!task.done) return true;
      const stamp = task.doneAt ? Date.parse(task.doneAt) : NaN;
      if (Number.isNaN(stamp)) return true;
      return stamp >= cutoff;
    });
    const removed = before - this.data.tasks.length;
    if (removed) this.scheduleSave();
    return removed;
  }

  markNotified(id) {
    const task = this.getTask(id);
    if (!task) return;
    task.notifiedFor = dueKey(task);
    task.snoozeUntil = null;
    this.scheduleSave();
  }

  dueTasks(now = Date.now()) {
    const windowMs = 24 * 60 * 60 * 1000;
    return this.data.tasks.filter((task) => {
      if (task.done) return false;
      if (task.notify === false) return false;
      if (!task.date) return false;
      if (task.snoozeUntil) return now >= task.snoozeUntil;
      const due = dueMs(task);
      if (due == null) return false;
      if (task.notifiedFor === dueKey(task)) return false;
      return now >= due && now - due <= windowMs;
    });
  }
}

function todayString() {
  return toDateString(new Date());
}

function toDateString(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isDateString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTimeString(value) {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value);
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
  dt.setDate(dt.getDate() + days);
  return toDateString(dt);
}

function dueMs(task) {
  const [y, m, d] = String(task.date || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  const [hh, mm] = (task.time || DEFAULT_REMINDER_TIME).split(':').map(Number);
  const dt = new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
  const ms = dt.getTime();
  return Number.isNaN(ms) ? null : ms;
}

function dueKey(task) {
  return `${task.date}T${task.time || DEFAULT_REMINDER_TIME}`;
}

function normalizeTask(raw) {
  const task = raw && typeof raw === 'object' ? raw : {};
  return {
    ...task,
    important: !!task.important,
    tags: sanitizeTags(task.tags),
    order: Number.isFinite(task.order) ? task.order : null
  };
}

function sanitizeTags(value) {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const seen = new Set();
  const tags = [];
  for (const item of list) {
    const tag = String(item || '').trim().slice(0, MAX_TAG_LENGTH);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= MAX_TAGS) break;
  }
  return tags;
}

function tryReadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return null;
  }
}

module.exports = Store;
