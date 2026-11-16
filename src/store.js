const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_REMINDER_TIME = '09:00';
const RECURRENCES = new Set(['none', 'daily', 'weekly', 'monthly', 'weekdays', 'everyN']);
const MAX_TAGS = 5;
const MAX_TAG_LENGTH = 24;
const MAX_CUSTOM_SOUNDS = 5;
const MAX_TAG_SOUNDS = 100;
const BUILTIN_SOUND_IDS = new Set(['soft', 'pixel', 'bell', 'pulse', 'chime', 'click']);
const SCHEMA_VERSION = 3;

function sanitizeCustomSounds(value) {
  if (!Array.isArray(value)) return [];
  const result = [];
  const seen = new Set();
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const file = typeof item.file === 'string' ? item.file.trim() : '';
    if (!/^custom-[a-z0-9-]+$/i.test(id) || !/^custom-[a-z0-9-]+\.(mp3|wav|ogg|m4a)$/i.test(file)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    const name = String(item.name || '').trim().replace(/\s+/g, ' ').slice(0, 40) || 'Свой звук';
    result.push({ id, name, file });
    if (result.length >= MAX_CUSTOM_SOUNDS) break;
  }
  return result;
}

function sanitizeTagSounds(value, customSounds) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const customIds = new Set((customSounds || []).map((item) => item.id));
  const result = {};
  let count = 0;
  for (const rawKey of Object.keys(value)) {
    const sound = typeof value[rawKey] === 'string' ? value[rawKey].trim() : '';
    if (!sound || (!BUILTIN_SOUND_IDS.has(sound) && !customIds.has(sound))) continue;
    let key = '';
    if (rawKey === 'important') {
      key = rawKey;
    } else if (rawKey.startsWith('tag:')) {
      const tag = rawKey.slice(4).trim().toLowerCase().replace(/\s+/g, ' ');
      if (!tag || tag.length > MAX_TAG_LENGTH) continue;
      key = `tag:${tag}`;
    } else {
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(result, key)) continue;
    result[key] = sound;
    count += 1;
    if (count >= MAX_TAG_SOUNDS) break;
  }
  return result;
}

function normalizeVolume(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 80;
  return Math.min(100, Math.max(0, Math.round(number)));
}

class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'pixel-planner.json');
    this.backupDir = path.join(dir, 'backups');
    this.data = this.load();
    this.saveTimer = null;
    this.retryTimer = null;
    this.saveRetryCount = 0;
    this.saveError = null;
  }

  load() {
    const base = { tasks: [], settings: { autostart: true, widgetPos: null, widgetSize: null, theme: 'peach', customLogo: null, notificationSound: 'soft', notificationVolume: 80, notificationTagSounds: {}, customSounds: [], customSound: null, language: 'ru', hotkey: 'Alt+Shift+Q', quickHotkey: 'CommandOrControl+Alt+Space', openPlannerOnStart: true, autoCleanupDone: 'never', widgetAlwaysOnTop: false, hiddenTags: [] } };
    const parsed = this.readStoreFile();
    if (parsed && typeof parsed === 'object') {
      base.tasks = Array.isArray(parsed.tasks) ? parsed.tasks.map(normalizeTask) : [];
      base.settings = { ...base.settings, ...(parsed.settings || {}) };
    }
    if (!Array.isArray(base.settings.hiddenTags)) base.settings.hiddenTags = [];
    base.settings.customSounds = sanitizeCustomSounds(base.settings.customSounds);
    base.settings.notificationVolume = normalizeVolume(base.settings.notificationVolume);
    const legacyFile = typeof base.settings.customSound === 'string' ? base.settings.customSound.trim() : '';
    if (/^custom-sound\.(mp3|wav|ogg|m4a)$/i.test(legacyFile)) {
      const existing = base.settings.customSounds.find((item) => item.file === legacyFile);
      if (!existing && base.settings.customSounds.length < MAX_CUSTOM_SOUNDS) {
        base.settings.customSounds.push({ id: 'custom-legacy', name: 'Свой звук', file: legacyFile });
      }
    }
    if (base.settings.notificationSound === 'custom') {
      const existing = legacyFile ? base.settings.customSounds.find((item) => item.file === legacyFile) : null;
      base.settings.notificationSound = existing ? existing.id : 'soft';
    }
    base.settings.notificationTagSounds = sanitizeTagSounds(base.settings.notificationTagSounds, base.settings.customSounds);
    base.settings.customSound = null;
    base.schemaVersion = SCHEMA_VERSION;
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
    const payload = JSON.stringify(this.data, null, 2);
    const tmp = `${this.file}.tmp`;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const fd = fs.openSync(tmp, 'w');
      try {
        fs.writeFileSync(fd, payload, 'utf8');
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(tmp, this.file);
      this.saveError = null;
      this.saveRetryCount = 0;
      return true;
    } catch (err) {
      console.error('[store] atomic save failed:', err.message);
      try {
        fs.unlinkSync(tmp);
      } catch (inner) {
        // ignore
      }
    }
    try {
      fs.writeFileSync(this.file, payload, 'utf8');
      this.saveError = null;
      this.saveRetryCount = 0;
      return true;
    } catch (err) {
      console.error('[store] fallback save failed:', err.message);
      this.saveError = err;
      this.scheduleRetrySave();
      return false;
    }
  }

  scheduleRetrySave() {
    if (this.retryTimer) return;
    const attempt = (this.saveRetryCount || 0) + 1;
    this.saveRetryCount = attempt;
    if (attempt > 5) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.saveNow();
    }, Math.min(5000, 200 * attempt * attempt));
  }

  getSettings() {
    return this.data.settings;
  }

  setSettings(patch) {
    const next = { ...(patch || {}) };
    if (next.customSounds !== undefined) {
      next.customSounds = sanitizeCustomSounds(next.customSounds);
    }
    if (next.notificationTagSounds !== undefined || next.customSounds !== undefined) {
      const custom = next.customSounds !== undefined
        ? next.customSounds
        : (Array.isArray(this.data.settings.customSounds) ? this.data.settings.customSounds : []);
      const tagSounds = next.notificationTagSounds !== undefined
        ? next.notificationTagSounds
        : this.data.settings.notificationTagSounds;
      next.notificationTagSounds = sanitizeTagSounds(tagSounds, custom);
    }
    this.data.settings = { ...this.data.settings, ...next };
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

  listTasks(options = {}) {
    const includeArchived = options && options.includeArchived === true;
    return this.data.tasks
      .filter((task) => includeArchived || !task.archived)
      .map((task) => ({ ...task }))
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        const at = a.time || '99:99';
        const bt = b.time || '99:99';
        if (at !== bt) return at < bt ? -1 : 1;
        return (a.createdAt || '') < (b.createdAt || '') ? -1 : 1;
      });
  }

  listArchived() {
    return this.data.tasks
      .filter((task) => task.archived)
      .map((task) => ({ ...task }))
      .sort((a, b) => {
        const at = archivedStamp(a);
        const bt = archivedStamp(b);
        if (at !== bt) return bt - at;
        if ((a.date || '') !== (b.date || '')) return (b.date || '') < (a.date || '') ? -1 : 1;
        return (b.createdAt || '') < (a.createdAt || '') ? -1 : 1;
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
    const recurrence = date && RECURRENCES.has(input.recurrence) ? input.recurrence : 'none';
    const recurrenceInterval = recurrence === 'everyN' ? normalizeInterval(input.recurrenceInterval) : null;
    const recurrenceDay = recurrence === 'monthly' ? normalizeRecurrenceDay(input.recurrenceDay, date) : null;
    const task = {
      id: crypto.randomUUID(),
      title,
      date,
      time: date && isTimeString(input.time) ? input.time : null,
      note: String(input.note || '').trim().slice(0, 1000),
      recurrence,
      recurrenceInterval,
      recurrenceDay,
      notify,
      important: !!input.important,
      tags: sanitizeTags(input.tags),
      order: Number.isFinite(input.order) ? input.order : null,
      done: false,
      doneAt: null,
      archived: false,
      archivedAt: null,
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
    const intervalSource = input.recurrenceInterval !== undefined ? input.recurrenceInterval : task.recurrenceInterval;
    const recurrenceInterval = recurrence === 'everyN' ? normalizeInterval(intervalSource) : null;
    const recurrenceDay = recurrence === 'monthly'
      ? normalizeRecurrenceDay(
          input.recurrenceDay !== undefined ? input.recurrenceDay : (date !== task.date ? date : task.recurrenceDay),
          date
        )
      : null;
    const scheduleChanged = date !== task.date || time !== task.time || recurrence !== task.recurrence || recurrenceInterval !== (task.recurrenceInterval || null) || recurrenceDay !== (task.recurrenceDay || null) || notify !== (task.notify !== false);
    task.title = title;
    task.date = date;
    task.time = time;
    task.recurrence = recurrence;
    task.recurrenceInterval = recurrenceInterval;
    task.recurrenceDay = recurrenceDay;
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
    const recurrence = RECURRENCES.has(task.recurrence) ? task.recurrence : 'none';
    let nextDate = nextRecurrenceDate(task.date, recurrence, task.recurrenceInterval, task.recurrenceDay);
    const today = todayString();
    let guard = 0;
    while (nextDate < today && guard < 500) {
      nextDate = nextRecurrenceDate(nextDate, recurrence, task.recurrenceInterval, task.recurrenceDay);
      guard += 1;
    }
    const next = {
      ...task,
      id: crypto.randomUUID(),
      date: nextDate,
      recurrence,
      recurrenceInterval: recurrence === 'everyN' ? normalizeInterval(task.recurrenceInterval) : null,
      recurrenceDay: recurrence === 'monthly' ? normalizeRecurrenceDay(task.recurrenceDay, nextDate) : null,
      done: false,
      doneAt: null,
      archived: false,
      archivedAt: null,
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
    for (const item of this.data.tasks) {
      if (item.spawnedBy === id) item.spawnedBy = null;
    }
    this.data.tasks = this.data.tasks.filter((item) => item.id !== id);
    this.scheduleSave();
  }

  replaceTasks(list) {
    const next = [];
    for (const raw of Array.isArray(list) ? list : []) {
      const task = normalizeImportedTask(raw);
      if (task) next.push(task);
    }
    this.data.tasks = next;
    this.revealTags(next.flatMap((task) => task.tags));
    this.scheduleSave();
    return next.length;
  }

  mergeTasks(list) {
    const existing = new Set(this.data.tasks.map((task) => task.id));
    const added = [];
    for (const raw of Array.isArray(list) ? list : []) {
      const task = normalizeImportedTask(raw);
      if (!task || existing.has(task.id)) continue;
      existing.add(task.id);
      added.push(task);
    }
    if (!added.length) return 0;
    this.data.tasks.push(...added);
    this.revealTags(added.flatMap((task) => task.tags));
    this.scheduleSave();
    return added.length;
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
    const recurrence = date && RECURRENCES.has(snapshot.recurrence) ? snapshot.recurrence : 'none';
    const recurrenceInterval = recurrence === 'everyN' ? normalizeInterval(snapshot.recurrenceInterval) : null;
    const recurrenceDay = recurrence === 'monthly' ? normalizeRecurrenceDay(snapshot.recurrenceDay, date) : null;
    const task = {
      ...snapshot,
      id,
      title,
      date,
      time: date && isTimeString(snapshot.time) ? snapshot.time : null,
      note: String(snapshot.note || '').trim().slice(0, 1000),
      recurrence,
      recurrenceInterval,
      recurrenceDay,
      notify,
      important: !!snapshot.important,
      tags: sanitizeTags(snapshot.tags),
      order: Number.isFinite(snapshot.order) ? snapshot.order : null,
      done: !!snapshot.done,
      doneAt: snapshot.done ? (snapshot.doneAt || new Date().toISOString()) : null,
      archived: snapshot.archived === true,
      archivedAt: normalizeArchivedAt(snapshot.archivedAt, snapshot.archived === true),
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

  archiveTask(id) {
    const task = this.getTask(id);
    if (!task) return null;
    if (task.archived) return task;
    task.archived = true;
    task.archivedAt = new Date().toISOString();
    this.scheduleSave();
    return task;
  }

  unarchiveTask(id) {
    const task = this.getTask(id);
    if (!task) return null;
    if (!task.archived) return task;
    task.archived = false;
    task.archivedAt = null;
    this.scheduleSave();
    return task;
  }

  archiveDone(days) {
    const limit = Number(days);
    const useCutoff = Number.isFinite(limit) && limit > 0;
    const cutoff = useCutoff ? Date.now() - limit * 24 * 60 * 60 * 1000 : null;
    const stamp = new Date().toISOString();
    let archived = 0;
    for (const task of this.data.tasks) {
      if (!task.done || task.archived) continue;
      if (cutoff != null) {
        const done = task.doneAt ? Date.parse(task.doneAt) : NaN;
        if (Number.isNaN(done) || done >= cutoff) continue;
      }
      task.archived = true;
      task.archivedAt = stamp;
      archived += 1;
    }
    if (archived) this.scheduleSave();
    return archived;
  }

  purgeArchived(days) {
    const limit = Number(days);
    const useCutoff = Number.isFinite(limit) && limit > 0;
    const cutoff = useCutoff ? Date.now() - limit * 24 * 60 * 60 * 1000 : null;
    const doomed = new Set();
    for (const task of this.data.tasks) {
      if (!task.archived) continue;
      if (cutoff != null) {
        const stamp = archivedStamp(task);
        if (!stamp || stamp >= cutoff) continue;
      }
      doomed.add(task.id);
    }
    if (!doomed.size) return 0;
    for (const task of this.data.tasks) {
      if (task.spawnedBy && doomed.has(task.spawnedBy)) task.spawnedBy = null;
      if (task.spawnedId && doomed.has(task.spawnedId)) task.spawnedId = null;
    }
    this.data.tasks = this.data.tasks.filter((task) => !doomed.has(task.id));
    this.scheduleSave();
    return doomed.size;
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
      if (task.archived) return false;
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

  missedTasks(now = Date.now(), days = 7) {
    const windowMs = Math.max(1, Number(days) || 7) * 24 * 60 * 60 * 1000;
    return this.data.tasks.filter((task) => {
      if (task.archived) return false;
      if (task.done) return false;
      if (task.notify === false) return false;
      if (!task.date) return false;
      if (task.snoozeUntil && now < task.snoozeUntil) return false;
      const due = dueMs(task);
      if (due == null) return false;
      if (task.notifiedFor === dueKey(task)) return false;
      const age = now - due;
      return age > 24 * 60 * 60 * 1000 && age <= windowMs;
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

function addMonths(dateStr, months, anchorDay) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const day = anchorDay || d;
  const base = new Date(y, m - 1 + months, 1, 12, 0, 0, 0);
  const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  base.setDate(Math.min(day, lastDay));
  return toDateString(base);
}

function nextWeekday(dateStr) {
  let next = addDays(dateStr, 1);
  for (let i = 0; i < 7; i += 1) {
    const [y, m, d] = next.split('-').map(Number);
    const day = new Date(y, m - 1, d, 12, 0, 0, 0).getDay();
    if (day !== 0 && day !== 6) return next;
    next = addDays(next, 1);
  }
  return next;
}

function normalizeInterval(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 2;
  return Math.min(365, Math.max(2, Math.round(number)));
}

function normalizeRecurrenceDay(value, date) {
  const day = Number(value);
  if (Number.isFinite(day) && day >= 1 && day <= 31) return Math.round(day);
  const parts = String(date || '').split('-').map(Number);
  return parts[2] >= 1 && parts[2] <= 31 ? parts[2] : null;
}

function nextRecurrenceDate(dateStr, recurrence, interval, anchorDay) {
  if (recurrence === 'weekly') return addDays(dateStr, 7);
  if (recurrence === 'monthly') return addMonths(dateStr, 1, anchorDay);
  if (recurrence === 'weekdays') return nextWeekday(dateStr);
  if (recurrence === 'everyN') return addDays(dateStr, normalizeInterval(interval));
  return addDays(dateStr, 1);
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

function normalizeArchivedAt(value, archived) {
  if (!archived) return null;
  if (typeof value !== 'string') return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

function archivedStamp(task) {
  for (const value of [task.archivedAt, task.doneAt, task.createdAt]) {
    const stamp = value ? Date.parse(value) : NaN;
    if (!Number.isNaN(stamp)) return stamp;
  }
  return 0;
}

function normalizeTask(raw) {
  const task = raw && typeof raw === 'object' ? raw : {};
  const recurrence = RECURRENCES.has(task.recurrence) ? task.recurrence : 'none';
  const recurrenceInterval = recurrence === 'everyN' ? normalizeInterval(task.recurrenceInterval) : null;
  const recurrenceDay = recurrence === 'monthly' ? normalizeRecurrenceDay(task.recurrenceDay, task.date) : null;
  const archived = task.archived === true;
  return {
    ...task,
    recurrence,
    recurrenceInterval,
    recurrenceDay,
    archived,
    archivedAt: normalizeArchivedAt(task.archivedAt, archived),
    important: !!task.important,
    tags: sanitizeTags(task.tags),
    order: Number.isFinite(task.order) ? task.order : null
  };
}

function normalizeImportedTask(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = String(raw.title || '').trim().slice(0, 140);
  if (!title) return null;
  const notify = raw.notify !== false;
  const date = notify ? (isDateString(raw.date) ? raw.date : todayString()) : null;
  const recurrence = date && RECURRENCES.has(raw.recurrence) ? raw.recurrence : 'none';
  const recurrenceInterval = recurrence === 'everyN' ? normalizeInterval(raw.recurrenceInterval) : null;
  const recurrenceDay = recurrence === 'monthly' ? normalizeRecurrenceDay(raw.recurrenceDay, date) : null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : crypto.randomUUID(),
    title,
    date,
    time: date && isTimeString(raw.time) ? raw.time : null,
    note: String(raw.note || '').trim().slice(0, 1000),
    recurrence,
    recurrenceInterval,
    recurrenceDay,
    notify,
    important: !!raw.important,
    tags: sanitizeTags(raw.tags),
    order: Number.isFinite(raw.order) ? raw.order : null,
    done: !!raw.done,
    doneAt: raw.done ? raw.doneAt || new Date().toISOString() : null,
    archived: raw.archived === true,
    archivedAt: normalizeArchivedAt(raw.archivedAt, raw.archived === true),
    notifiedFor: raw.notifiedFor || null,
    snoozeUntil: raw.snoozeUntil || null,
    spawnedId: raw.spawnedId || null,
    spawnedBy: raw.spawnedBy || null,
    createdAt: raw.createdAt || new Date().toISOString()
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
module.exports.SCHEMA_VERSION = SCHEMA_VERSION;
