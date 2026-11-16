#!/usr/bin/env node
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gonow-mcp-guard-'));
const storeFile = path.join(dir, 'pixel-planner.json');
const bridgeFile = path.join(dir, 'bridge.json');
const original = {
  schemaVersion: 2,
  settings: {},
  tasks: [{ id: 'keep', title: 'keep', date: '2030-01-01', time: null, notify: true, done: false, tags: [] }]
};
fs.writeFileSync(storeFile, JSON.stringify(original, null, 2));
fs.writeFileSync(
  bridgeFile,
  JSON.stringify({
    transport: 'pipe',
    path: path.join(dir, 'missing.sock'),
    token: 'test-token',
    pid: process.pid
  })
);

const server = path.join(__dirname, '..', 'mcp', 'gonow-mcp.js');
const child = spawn(process.execPath, [server], {
  env: { ...process.env, GONOW_USER_DATA: dir },
  stdio: ['pipe', 'pipe', 'inherit']
});

let buffer = '';
let nextId = 1;
const pending = new Map();

child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  buffer += chunk;
  let index = buffer.indexOf('\n');
  while (index !== -1) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (line) {
      const message = JSON.parse(line);
      const entry = pending.get(message.id);
      if (entry) {
        pending.delete(message.id);
        clearTimeout(entry.timer);
        entry.resolve(message);
      }
    }
    index = buffer.indexOf('\n');
  }
});

function rpc(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`timeout: ${method}`));
    }, 10000);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}

async function call(name, args) {
  const message = await rpc('tools/call', { name, arguments: args || {} });
  const result = message.result;
  const text = result && result.content && result.content[0] ? result.content[0].text : '';
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    parsed = text;
  }
  return { isError: !!(result && result.isError), parsed, text };
}

function cleanup() {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    // ignore
  }
}

(async () => {
  try {
    await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {} });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);

    const guarded = await call('add_task', { title: 'must not write' });
    assert.equal(guarded.isError, true, 'write is refused while app is alive');
    assert.match(guarded.text, /refusing to write/i);
    const afterGuard = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
    assert.deepEqual(afterGuard.tasks.map((task) => task.title), ['keep'], 'store unchanged while app is alive');

    fs.unlinkSync(bridgeFile);
    const fallback = await call('add_task', { title: 'file fallback', recurrence: 'everyN', recurrenceInterval: 3 });
    assert.equal(fallback.isError, false, 'file fallback allowed when app is not running');
    assert.equal(fallback.parsed.source, 'file');
    const afterFallback = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
    const written = afterFallback.tasks.find((task) => task.title === 'file fallback');
    assert(written, 'file fallback writes task');
    assert.equal(written.recurrence, 'everyN', 'file fallback keeps recurrence');
    assert.equal(written.recurrenceInterval, 3, 'file fallback keeps interval');

    const fallbackId = fallback.parsed.task.id;
    const completed = await call('complete_task', { id: fallbackId });
    assert.equal(completed.isError, false, 'complete_task works in file mode');
    assert.equal(completed.parsed.task.done, true, 'complete_task marks done');
    const snoozed = await call('snooze_task', { id: fallbackId, minutes: 5 });
    assert.equal(snoozed.isError, false, 'snooze_task works in file mode');
    assert.equal(typeof snoozed.parsed.task.snoozeUntil, 'number', 'snooze_task sets snoozeUntil');
    const archived = await call('archive_task', { id: fallbackId });
    assert.equal(archived.isError, false, 'archive_task works in file mode');
    assert.equal(archived.parsed.task.archived, true, 'archive_task archives task');
    const archivedList = await call('list_tasks', { search: 'file fallback', include_archived: true });
    assert(archivedList.parsed.tasks.some((task) => task.id === fallbackId), 'list_tasks includes archived');
    const restored = await call('restore_task', { id: fallbackId });
    assert.equal(restored.isError, false, 'restore_task works in file mode');
    assert.equal(restored.parsed.task.archived, false, 'restore_task restores task');
    const stats = await call('get_stats');
    assert.equal(stats.isError, false, 'get_stats works in file mode');
    assert(Number.isFinite(stats.parsed.stats.active), 'get_stats returns active count');
    const tags = await call('list_tags');
    assert.equal(tags.isError, false, 'list_tags works in file mode');
    assert(Array.isArray(tags.parsed.tags), 'list_tags returns tags');

    console.log('mcp guard tests OK');
    child.stdin.end();
    setTimeout(() => {
      cleanup();
      process.exit(0);
    }, 150);
  } catch (err) {
    console.error('mcp guard tests FAILED:', err.message);
    child.stdin.end();
    setTimeout(() => {
      cleanup();
      process.exit(1);
    }, 150);
  }
})();
