const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Store = require('../src/store');

function pad(value) {
  return String(value).padStart(2, '0');
}

function today() {
  const dt = new Date();
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

const T = today();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gonow-store-'));
const store = new Store(dir);

const plain = store.addTask({ title: 'A' });
assert.equal(plain.date, T, 'default date is today');
assert.equal(plain.notify, true, 'notify defaults to true');
assert.equal(plain.recurrence, 'none', 'recurrence defaults to none');

const undated = store.addTask({ title: 'B', notify: false, date: T, time: '10:00', recurrence: 'daily' });
assert.equal(undated.date, null, 'no-notify has no date');
assert.equal(undated.time, null, 'no-notify has no time');
assert.equal(undated.notify, false, 'notify flag stored');
assert.equal(undated.recurrence, 'none', 'no-notify has no recurrence');

const timed = store.addTask({ title: 'C', date: T, time: '23:59', recurrence: 'weekly' });
assert.equal(timed.date, T);
assert.equal(timed.time, '23:59');
assert.equal(timed.recurrence, 'weekly');

store.updateTask(timed.id, { title: 'C2' });
assert.equal(store.getTask(timed.id).title, 'C2', 'title updated');
assert.equal(store.getTask(timed.id).time, '23:59', 'time kept on title-only update');
assert.equal(store.getTask(timed.id).recurrence, 'weekly', 'recurrence kept on title-only update');

const raw = store.getTask(timed.id);
raw.notifiedFor = 'stamp';
raw.snoozeUntil = 123;
store.updateTask(timed.id, { date: addDays(T, 1) });
assert.equal(store.getTask(timed.id).notifiedFor, null, 'schedule change resets notifiedFor');
assert.equal(store.getTask(timed.id).snoozeUntil, null, 'schedule change resets snooze');

const due = store.dueTasks(Date.now());
const past = store.addTask({ title: 'past', date: '2020-01-01' });
assert(!store.dueTasks(Date.now()).some((task) => task.id === past.id), 'old task not due');
assert(!due.some((task) => task.id === undated.id), 'no-notify task never due');

const todayDue = store.addTask({ title: 'due', date: T, time: '00:01' });
assert(store.dueTasks(Date.now()).some((task) => task.id === todayDue.id), 'task due today is reported');

const daily = store.addTask({ title: 'D', date: T, recurrence: 'daily' });
store.setDone(daily.id, true);
assert.equal(store.getTask(daily.id).done, true);
const spawned = store.getTask(store.getTask(daily.id).spawnedId);
assert(spawned, 'recurring task spawns next');
assert.equal(spawned.date, addDays(T, 1), 'next occurrence is tomorrow');
store.setDone(daily.id, false);
assert.equal(store.getTask(spawned.id), null, 'unchecking removes spawned copy');

const count = store.replaceTasks([
  { title: 'X', date: '2030-01-02', time: '08:15' },
  { title: '' },
  { title: 'Y', notify: false }
]);
assert.equal(count, 2, 'replaceTasks skips empty titles');
assert.equal(store.listTasks().length, 2, 'replaceTasks replaces the list');
assert.equal(store.listTasks()[0].date, '2030-01-02', 'replaceTasks keeps date');

const fields = store.addTask({
  title: 'fields',
  tags: [' work ', 'Work', 'a'.repeat(40), 'x', 'y', 'z', 'extra']
});
assert.equal(fields.important, false, 'important defaults to false');
assert.deepEqual(fields.tags, ['work', 'a'.repeat(24), 'x', 'y', 'z'], 'tags sanitized, deduped and capped');
assert.equal(fields.order, null, 'order defaults to null');
store.updateTask(fields.id, { important: true, tags: 'дом, работа' });
assert.equal(store.getTask(fields.id).important, true, 'important updated');
assert.deepEqual(store.getTask(fields.id).tags, ['дом', 'работа'], 'tags accepted from comma string');
assert.equal(store.getSettings().autoCleanupDone, 'never', 'cleanup defaults to never');
assert.equal(store.getSettings().quickHotkey, 'CommandOrControl+Alt+Space', 'quick hotkey default');
assert.deepEqual(store.getSettings().hiddenTags, [], 'hidden tags default');

store.hideTag('дом');
store.hideTag('Дом');
assert.deepEqual(store.getSettings().hiddenTags, ['дом'], 'tag hidden once, case-insensitive');
const revealTask = store.addTask({ title: 'reveal', tags: ['дом'] });
assert.deepEqual(store.getSettings().hiddenTags, [], 're-entered tag is revealed');
store.removeTask(revealTask.id);

const snapshot = { ...store.getTask(fields.id) };
store.removeTask(fields.id);
assert.equal(store.getTask(fields.id), null, 'task removed');
const restored = store.restoreTask(snapshot);
assert.equal(restored.id, snapshot.id, 'restore keeps id');
assert.equal(restored.title, 'fields', 'restore keeps title');
assert.deepEqual(restored.tags, ['дом', 'работа'], 'restore keeps tags');
assert.equal(store.restoreTask(snapshot).id, snapshot.id, 'restore is idempotent');
assert.equal(store.listTasks().filter((task) => task.id === snapshot.id).length, 1, 'restore does not duplicate');

const oldDone = store.addTask({ title: 'old done' });
store.setDone(oldDone.id, true);
store.getTask(oldDone.id).doneAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
const recentDone = store.addTask({ title: 'recent done' });
store.setDone(recentDone.id, true);
const active = store.addTask({ title: 'still active' });
assert.equal(store.cleanupDone(30), 1, 'cleanup removes only old done tasks');
assert.equal(store.getTask(oldDone.id), null, 'old done removed');
assert(store.getTask(recentDone.id), 'recent done kept');
assert(store.getTask(active.id), 'active kept');

const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gonow-save-'));
const saveStore = new Store(saveDir);
saveStore.addTask({ title: 'atomic' });
saveStore.saveNow();
const saveFile = path.join(saveDir, 'pixel-planner.json');
assert.equal(JSON.parse(fs.readFileSync(saveFile, 'utf8')).tasks.length, 1, 'atomic save writes valid json');
assert(!fs.existsSync(`${saveFile}.tmp`), 'atomic save leaves no tmp file');

const recoverDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gonow-recover-'));
const recoverStore = new Store(recoverDir);
recoverStore.addTask({ title: 'from backup' });
recoverStore.saveNow();
const recoverFile = path.join(recoverDir, 'pixel-planner.json');
fs.copyFileSync(recoverFile, `${recoverFile}.bak`);
fs.writeFileSync(recoverFile, '{ broken', 'utf8');
const recovered = new Store(recoverDir);
assert.equal(recovered.listTasks().length, 1, 'recovers from .bak');
assert.equal(recovered.listTasks()[0].title, 'from backup', 'recovered task matches');
assert(fs.readdirSync(recoverDir).some((name) => name.includes('.corrupt-')), 'corrupt file quarantined');

const dailyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gonow-daily-'));
const dailyStore = new Store(dailyDir);
dailyStore.addTask({ title: 'from daily' });
dailyStore.saveNow();
const dailyFile = path.join(dailyDir, 'pixel-planner.json');
fs.mkdirSync(path.join(dailyDir, 'backups'), { recursive: true });
fs.copyFileSync(dailyFile, path.join(dailyDir, 'backups', 'pixel-planner-2020-01-01.json'));
fs.writeFileSync(dailyFile, 'not json', 'utf8');
const dailyRecovered = new Store(dailyDir);
assert.equal(dailyRecovered.listTasks().length, 1, 'recovers from newest daily backup');
assert.equal(dailyRecovered.listTasks()[0].title, 'from daily', 'daily recovered task matches');

fs.rmSync(dir, { recursive: true, force: true });
fs.rmSync(saveDir, { recursive: true, force: true });
fs.rmSync(recoverDir, { recursive: true, force: true });
fs.rmSync(dailyDir, { recursive: true, force: true });
console.log('store tests OK');
