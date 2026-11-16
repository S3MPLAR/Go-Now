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
assert.equal(store.data.schemaVersion, Store.SCHEMA_VERSION, 'schema version set on load');

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

const intervalTask = store.addTask({ title: 'interval', date: T, recurrence: 'everyN', recurrenceInterval: 3 });
store.getTask(intervalTask.id).notifiedFor = 'stamp';
store.updateTask(intervalTask.id, { recurrenceInterval: 5 });
assert.equal(store.getTask(intervalTask.id).recurrenceInterval, 5, 'interval updated');
assert.equal(store.getTask(intervalTask.id).notifiedFor, null, 'interval change resets notifiedFor');

const due = store.dueTasks(Date.now());
const past = store.addTask({ title: 'past', date: '2020-01-01' });
assert(!store.dueTasks(Date.now()).some((task) => task.id === past.id), 'old task not due');
assert(!due.some((task) => task.id === undated.id), 'no-notify task never due');

const todayDue = store.addTask({ title: 'due', date: T, time: '00:01' });
assert(store.dueTasks(Date.now()).some((task) => task.id === todayDue.id), 'task due today is reported');

const missedOld = store.addTask({ title: 'missed old', date: addDays(T, -2) });
const missedFar = store.addTask({ title: 'missed far', date: addDays(T, -8) });
const missedRecent = store.addTask({ title: 'missed recent', date: T, time: '00:01' });
const missed = store.missedTasks(Date.now(), 7);
assert(missed.some((task) => task.id === missedOld.id), 'missed task within 7 days reported');
assert(!missed.some((task) => task.id === missedFar.id), 'task older than 7 days not reported');
assert(!missed.some((task) => task.id === missedRecent.id), 'recent task not in missed digest');
store.markNotified(missedOld.id);
assert(!store.missedTasks(Date.now(), 7).some((task) => task.id === missedOld.id), 'notified task excluded from missed');

const daily = store.addTask({ title: 'D', date: T, recurrence: 'daily' });
store.setDone(daily.id, true);
assert.equal(store.getTask(daily.id).done, true);
const spawned = store.getTask(store.getTask(daily.id).spawnedId);
assert(spawned, 'recurring task spawns next');
assert.equal(spawned.date, addDays(T, 1), 'next occurrence is tomorrow');
store.setDone(daily.id, false);
assert.equal(store.getTask(spawned.id), null, 'unchecking removes spawned copy');

const monthly = store.addTask({ title: 'M', date: '2030-01-31', recurrence: 'monthly' });
store.setDone(monthly.id, true);
const monthlyNext = store.getTask(store.getTask(monthly.id).spawnedId);
assert.equal(monthlyNext.date, '2030-02-28', 'monthly clamps to month end');
store.setDone(monthlyNext.id, true);
const monthlyThird = store.getTask(monthlyNext.spawnedId);
assert.equal(monthlyThird.date, '2030-03-31', 'monthly keeps the anchor day');
store.setDone(monthlyNext.id, false);
store.setDone(monthly.id, false);

let friday = T;
for (let i = 0; i < 7; i += 1) {
  const [fy, fm, fd] = friday.split('-').map(Number);
  if (new Date(fy, fm - 1, fd, 12).getDay() === 5) break;
  friday = addDays(friday, 1);
}
const weekday = store.addTask({ title: 'W', date: friday, recurrence: 'weekdays' });
store.setDone(weekday.id, true);
const weekdayNext = store.getTask(store.getTask(weekday.id).spawnedId);
assert.equal(weekdayNext.date, addDays(friday, 3), 'weekdays skip the weekend');
store.setDone(weekday.id, false);

const every = store.addTask({ title: 'E', date: T, recurrence: 'everyN', recurrenceInterval: 3 });
store.setDone(every.id, true);
const everyNext = store.getTask(store.getTask(every.id).spawnedId);
assert.equal(everyNext.date, addDays(T, 3), 'everyN uses the interval');
assert.equal(everyNext.recurrenceInterval, 3, 'everyN keeps the interval');
store.setDone(every.id, false);

const archivedParent = store.addTask({ title: 'archived parent', date: T, recurrence: 'daily' });
store.setDone(archivedParent.id, true);
const archivedChild = store.getTask(store.getTask(archivedParent.id).spawnedId);
store.archiveTask(archivedParent.id);
assert.equal(archivedChild.archived, false, 'next recurrence is not archived');
assert.equal(store.listTasks().some((task) => task.id === archivedChild.id), true, 'next recurrence stays active');
store.unarchiveTask(archivedParent.id);
store.setDone(archivedParent.id, false);

const lowInterval = store.addTask({ title: 'CL', date: T, recurrence: 'everyN', recurrenceInterval: 1 });
assert.equal(lowInterval.recurrenceInterval, 2, 'interval clamps to 2');
const highInterval = store.addTask({ title: 'CH', date: T, recurrence: 'everyN', recurrenceInterval: 1000 });
assert.equal(highInterval.recurrenceInterval, 365, 'interval clamps to 365');

const catchup = store.addTask({ title: 'catchup', date: addDays(T, -10), recurrence: 'daily' });
store.setDone(catchup.id, true);
const catchupNext = store.getTask(store.getTask(catchup.id).spawnedId);
assert(catchupNext.date >= T, 'catch-up advances to today or later');
store.setDone(catchup.id, false);

const count = store.replaceTasks([
  { title: 'X', date: '2030-01-02', time: '08:15' },
  { title: '' },
  { title: 'Y', notify: false }
]);
assert.equal(count, 2, 'replaceTasks skips empty titles');
assert.equal(store.listTasks().length, 2, 'replaceTasks replaces the list');
assert.equal(store.listTasks()[0].date, '2030-01-02', 'replaceTasks keeps date');

const existingId = store.listTasks()[0].id;
const merged = store.mergeTasks([
  { id: existingId, title: 'duplicate' },
  { id: 'merge-new', title: 'merged', date: '2030-02-03' }
]);
assert.equal(merged, 1, 'mergeTasks adds only new ids');
assert.equal(store.getTask(existingId).title, 'X', 'mergeTasks keeps existing task');
assert.equal(store.getTask('merge-new').date, '2030-02-03', 'mergeTasks keeps new task');

store.replaceTasks([{ title: 'RI', date: '2030-01-01', recurrence: 'everyN', recurrenceInterval: 4 }]);
assert.equal(store.listTasks()[0].recurrence, 'everyN', 'replaceTasks keeps recurrence');
assert.equal(store.listTasks()[0].recurrenceInterval, 4, 'replaceTasks keeps interval');

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
assert.equal(store.getSettings().notificationSound, 'soft', 'notification sound default');
assert.equal(store.getSettings().notificationVolume, 80, 'notification volume default');
assert.deepEqual(store.getSettings().customSounds, [], 'custom sounds default');
assert.deepEqual(store.getSettings().notificationTagSounds, {}, 'tag sounds default');
assert.equal(store.getSettings().customSound, null, 'legacy custom sound cleared');
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
assert.equal(store.archiveDone(30), 1, 'archiveDone moves only old done tasks');
assert.equal(store.getTask(oldDone.id).archived, true, 'old done archived');
assert(!store.listTasks().some((task) => task.id === oldDone.id), 'archived task hidden from listTasks');
assert(store.listArchived().some((task) => task.id === oldDone.id), 'archived task listed separately');
assert(!store.dueTasks(Date.now()).some((task) => task.id === oldDone.id), 'archived task never due');
assert.equal(store.getTask(recentDone.id).archived, false, 'recent done kept active');
assert(store.getTask(active.id), 'active kept');
assert.equal(store.unarchiveTask(oldDone.id).archived, false, 'archived task restored');
assert(store.listTasks().some((task) => task.id === oldDone.id), 'restored task visible again');

store.archiveTask(recentDone.id);
assert.equal(store.getTask(recentDone.id).archived, true, 'manual archive works');
assert.equal(store.purgeArchived(0), 1, 'purge removes archived tasks');
assert.equal(store.getTask(recentDone.id), null, 'purged task removed');
assert(store.getTask(active.id), 'purge keeps active tasks');

const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gonow-save-'));
const saveStore = new Store(saveDir);
saveStore.addTask({ title: 'atomic' });
saveStore.saveNow();
const saveFile = path.join(saveDir, 'pixel-planner.json');
assert.equal(JSON.parse(fs.readFileSync(saveFile, 'utf8')).tasks.length, 1, 'atomic save writes valid json');
assert.equal(JSON.parse(fs.readFileSync(saveFile, 'utf8')).schemaVersion, Store.SCHEMA_VERSION, 'schema version saved');
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

const soundDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gonow-sound-'));
fs.writeFileSync(
  path.join(soundDir, 'pixel-planner.json'),
  JSON.stringify({
    tasks: [],
    settings: {
      notificationSound: 'custom',
      customSound: 'custom-sound.wav',
      notificationVolume: 150,
      notificationTagSounds: {
        important: 'click',
        'tag:Звонок': 'custom-a',
        'tag:bad': 'missing-sound',
        'repeat:daily': 'soft',
        'tag:': 'soft'
      },
      customSounds: [
        { id: 'custom-a', name: '  A  ', file: 'custom-a.wav' },
        { id: 'bad', name: 'x', file: 'nope.wav' }
      ]
    }
  }),
  'utf8'
);
const migrated = new Store(soundDir);
const migratedSettings = migrated.getSettings();
assert.equal(migratedSettings.notificationVolume, 100, 'volume normalized on load');
assert.deepEqual(
  migratedSettings.customSounds,
  [
    { id: 'custom-a', name: 'A', file: 'custom-a.wav' },
    { id: 'custom-legacy', name: 'Свой звук', file: 'custom-sound.wav' }
  ],
  'custom sounds sanitized and legacy migrated'
);
assert.equal(migratedSettings.notificationSound, 'custom-legacy', 'legacy selection migrated');
assert.deepEqual(
  migratedSettings.notificationTagSounds,
  { important: 'click', 'tag:звонок': 'custom-a' },
  'tag sounds sanitized and tag keys normalized'
);
migrated.setSettings({ customSounds: [] });
assert.deepEqual(migrated.getSettings().notificationTagSounds, { important: 'click' }, 'tag sounds pruned with custom sounds');

const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gonow-legacy-'));
fs.writeFileSync(
  path.join(legacyDir, 'pixel-planner.json'),
  JSON.stringify({ schemaVersion: 2, tasks: [{ id: 'legacy', title: 'legacy', date: '2030-01-01', done: true }], settings: {} }),
  'utf8'
);
const legacyStore = new Store(legacyDir);
assert.equal(legacyStore.data.schemaVersion, 3, 'legacy store migrates to schema 3');
assert.equal(legacyStore.getTask('legacy').archived, false, 'legacy task gets archived=false');
assert.equal(legacyStore.getTask('legacy').archivedAt, null, 'legacy task gets archivedAt=null');
legacyStore.archiveTask('legacy');
legacyStore.saveNow();
const reloadedLegacy = new Store(legacyDir);
assert.equal(reloadedLegacy.getTask('legacy').archived, true, 'archived state persists');
assert(reloadedLegacy.getTask('legacy').archivedAt, 'archived timestamp persists');
assert.equal(reloadedLegacy.data.schemaVersion, 3, 'saved store keeps schema 3');

fs.rmSync(legacyDir, { recursive: true, force: true });
fs.rmSync(dir, { recursive: true, force: true });
fs.rmSync(saveDir, { recursive: true, force: true });
fs.rmSync(recoverDir, { recursive: true, force: true });
fs.rmSync(dailyDir, { recursive: true, force: true });
fs.rmSync(soundDir, { recursive: true, force: true });
console.log('store tests OK');
