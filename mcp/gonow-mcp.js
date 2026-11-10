#!/usr/bin/env node
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'gonow', version: '2.0.0' };
const RECURRENCES = new Set(['none', 'daily', 'weekly']);

function appDataDir() {
  const base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(base, 'Go, Now!');
}

function storePath() {
  return path.join(appDataDir(), 'pixel-planner.json');
}

function bridgePath() {
  return path.join(appDataDir(), 'bridge.json');
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function todayString() {
  const dt = new Date();
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function isDateString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTimeString(value) {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value);
}

const BRIDGE_AGENT = new http.Agent({ keepAlive: true, maxSockets: 4 });
let bridgeCache = null;

function readBridgeInfo() {
  const file = bridgePath();
  try {
    const stat = fs.statSync(file);
    if (bridgeCache && bridgeCache.mtimeMs === stat.mtimeMs && bridgeCache.size === stat.size) {
      return bridgeCache.info;
    }
    const info = JSON.parse(fs.readFileSync(file, 'utf8'));
    bridgeCache = { mtimeMs: stat.mtimeMs, size: stat.size, info };
    return info;
  } catch (err) {
    bridgeCache = null;
    return null;
  }
}

function bridgeRequest(method, urlPath, body) {
  return new Promise((resolve) => {
    const info = readBridgeInfo();
    if (!info) {
      resolve({ offline: true });
      return;
    }
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port: info.port,
        path: urlPath,
        method,
        timeout: 5000,
        agent: BRIDGE_AGENT,
        headers: {
          Authorization: `Bearer ${info.token}`,
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {})
        }
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = data ? JSON.parse(data) : null;
          } catch (err) {
            parsed = data;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('bridge timeout')));
    req.on('error', () => resolve({ offline: true }));
    if (payload) req.write(payload);
    req.end();
  });
}

function readStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath(), 'utf8'));
    if (!Array.isArray(parsed.tasks)) parsed.tasks = [];
    if (!parsed.settings) parsed.settings = {};
    return parsed;
  } catch (err) {
    return { tasks: [], settings: {} };
  }
}

function writeStore(data) {
  fs.mkdirSync(path.dirname(storePath()), { recursive: true });
  const tmp = `${storePath()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, storePath());
}

function sleepSync(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch (err) {
    // ignore
  }
}

function acquireStoreLock(timeoutMs = 1500) {
  const lockPath = path.join(appDataDir(), 'store.lock');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
      fs.closeSync(fd);
      return lockPath;
    } catch (err) {
      if (err.code !== 'EEXIST') return null;
      try {
        const stat = fs.statSync(lockPath);
        if (Date.now() - stat.mtimeMs > 10000) {
          fs.unlinkSync(lockPath);
          continue;
        }
      } catch (inner) {
        continue;
      }
      sleepSync(50);
    }
  }
  return null;
}

function releaseStoreLock(lockPath) {
  if (!lockPath) return;
  try {
    fs.unlinkSync(lockPath);
  } catch (err) {
    // ignore
  }
}

function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    if ((a.date || '') !== (b.date || '')) return (a.date || '') < (b.date || '') ? -1 : 1;
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

async function listTasks(args) {
  const date = typeof args.date === 'string' && isDateString(args.date) ? args.date : null;
  const from = typeof args.from === 'string' && isDateString(args.from) ? args.from : null;
  const to = typeof args.to === 'string' && isDateString(args.to) ? args.to : null;
  const search = typeof args.search === 'string' ? args.search.trim().toLowerCase() : '';
  const includeDone = args.include_done !== false;
  const reply = await bridgeRequest('GET', date ? `/tasks?date=${encodeURIComponent(date)}` : '/tasks');
  let tasks;
  let source;
  if (!reply.offline && reply.status === 200) {
    tasks = reply.body.tasks || [];
    source = 'app';
  } else {
    tasks = sortTasks(readStore().tasks);
    if (date) tasks = tasks.filter((task) => task.date === date);
    source = 'file';
  }
  if (from) tasks = tasks.filter((task) => task.date && task.date >= from);
  if (to) tasks = tasks.filter((task) => task.date && task.date <= to);
  if (search) {
    tasks = tasks.filter((task) => `${task.title || ''}\n${task.note || ''}\n${(task.tags || []).join(' ')}`.toLowerCase().includes(search));
  }
  if (!includeDone) tasks = tasks.filter((task) => !task.done);
  return { source, tasks };
}

function sanitizeTags(value) {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const seen = new Set();
  const tags = [];
  for (const item of list) {
    const tag = String(item || '').trim().slice(0, 24);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= 5) break;
  }
  return tags;
}

function normalizeNewTask(input) {
  const title = String(input.title || '').trim().slice(0, 140);
  if (!title) throw new Error('title required');
  const notify = input.notify !== false;
  const date = notify ? (isDateString(input.date) ? input.date : todayString()) : null;
  return {
    id: crypto.randomUUID(),
    title,
    date,
    time: date && isTimeString(input.time) ? input.time : null,
    note: String(input.note || '').trim().slice(0, 1000),
    recurrence: date && RECURRENCES.has(input.recurrence) ? input.recurrence : 'none',
    notify,
    important: !!input.important,
    tags: sanitizeTags(input.tags),
    order: null,
    done: false,
    doneAt: null,
    notifiedFor: null,
    snoozeUntil: null,
    spawnedId: null,
    spawnedBy: null,
    createdAt: new Date().toISOString()
  };
}

async function addTask(args) {
  const reply = await bridgeRequest('POST', '/tasks', args || {});
  if (!reply.offline) {
    if (reply.status === 200) return { source: 'app', task: reply.body.task };
    throw new Error(reply.body && reply.body.error ? reply.body.error : 'failed to add task');
  }
  const lock = acquireStoreLock();
  try {
    const data = readStore();
    const task = normalizeNewTask(args || {});
    data.tasks.push(task);
    writeStore(data);
    return { source: 'file', task };
  } finally {
    releaseStoreLock(lock);
  }
}

async function addTasks(args) {
  const items = Array.isArray(args.tasks) ? args.tasks : [];
  if (!items.length) throw new Error('tasks required');
  const reply = await bridgeRequest('POST', '/tasks/bulk', { tasks: items });
  if (!reply.offline) {
    if (reply.status === 200) return { source: 'app', tasks: reply.body.tasks };
    throw new Error(reply.body && reply.body.error ? reply.body.error : 'failed to add tasks');
  }
  const lock = acquireStoreLock();
  try {
    const data = readStore();
    const tasks = items.map((item) => normalizeNewTask(item || {}));
    data.tasks.push(...tasks);
    writeStore(data);
    return { source: 'file', tasks };
  } finally {
    releaseStoreLock(lock);
  }
}

function applyUpdate(task, input) {
  const title = String(input.title != null ? input.title : task.title).trim().slice(0, 140);
  if (!title) throw new Error('title required');
  const notify = input.notify !== undefined ? input.notify !== false : task.notify !== false;
  const dateRaw = input.date !== undefined ? input.date : task.date;
  const date = notify ? (isDateString(dateRaw) ? dateRaw : todayString()) : null;
  const timeRaw = input.time !== undefined ? input.time : task.time;
  const time = date && isTimeString(timeRaw) ? timeRaw : null;
  const recurrence = date
    ? RECURRENCES.has(input.recurrence)
      ? input.recurrence
      : RECURRENCES.has(task.recurrence)
        ? task.recurrence
        : 'none'
    : 'none';
  const scheduleChanged =
    date !== task.date || time !== task.time || recurrence !== task.recurrence || notify !== (task.notify !== false);
  task.title = title;
  task.date = date;
  task.time = time;
  task.recurrence = recurrence;
  task.notify = notify;
  if (input.important !== undefined) task.important = !!input.important;
  if (input.tags !== undefined) task.tags = sanitizeTags(input.tags);
  if (input.note !== undefined) task.note = String(input.note || '').trim().slice(0, 1000);
  if (scheduleChanged) {
    task.notifiedFor = null;
    task.snoozeUntil = null;
  }
  return task;
}

async function updateTask(args) {
  const id = String(args.id || '');
  if (!id) throw new Error('id required');
  const patch = { ...args };
  delete patch.id;
  const reply = await bridgeRequest('PATCH', `/tasks/${encodeURIComponent(id)}`, patch);
  if (!reply.offline) {
    if (reply.status === 200) return { source: 'app', task: reply.body.task };
    throw new Error(reply.body && reply.body.error ? reply.body.error : 'task not found');
  }
  const lock = acquireStoreLock();
  try {
    const data = readStore();
    const task = data.tasks.find((item) => item.id === id);
    if (!task) throw new Error('task not found');
    const fields = { ...patch };
    const wantsDone = fields.done !== undefined;
    delete fields.done;
    applyUpdate(task, fields);
    if (wantsDone) {
      task.done = !!patch.done;
      task.doneAt = task.done ? new Date().toISOString() : null;
    }
    writeStore(data);
    return { source: 'file', task };
  } finally {
    releaseStoreLock(lock);
  }
}

async function deleteTask(args) {
  const id = String(args.id || '');
  if (!id) throw new Error('id required');
  const reply = await bridgeRequest('DELETE', `/tasks/${encodeURIComponent(id)}`);
  if (!reply.offline) {
    if (reply.status === 200) return { source: 'app', deleted: id };
    throw new Error(reply.body && reply.body.error ? reply.body.error : 'task not found');
  }
  const lock = acquireStoreLock();
  try {
    const data = readStore();
    const before = data.tasks.length;
    data.tasks = data.tasks.filter((task) => task.id !== id);
    if (data.tasks.length === before) throw new Error('task not found');
    writeStore(data);
    return { source: 'file', deleted: id };
  } finally {
    releaseStoreLock(lock);
  }
}

const TOOLS = [
  {
    name: 'list_tasks',
    description:
      'List tasks from the Go, Now! app. Filters: exact date, date range (from/to), text search over title and note, and include_done.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Exact date, YYYY-MM-DD' },
        from: { type: 'string', description: 'Range start date, YYYY-MM-DD (inclusive)' },
        to: { type: 'string', description: 'Range end date, YYYY-MM-DD (inclusive)' },
        search: { type: 'string', description: 'Case-insensitive text search in title and note' },
        include_done: { type: 'boolean', description: 'Include completed tasks (default true)' }
      }
    }
  },
  {
    name: 'add_task',
    description:
      'Add a task to Go, Now!. Set notify=false to create an undated task with no deadline and no reminders.',
    inputSchema: {
      type: 'object',
      required: ['title'],
      properties: {
        title: { type: 'string', description: 'Task title' },
        date: { type: 'string', description: 'Date YYYY-MM-DD; defaults to today' },
        time: { type: 'string', description: 'Time HH:MM' },
        note: { type: 'string', description: 'Optional note' },
        recurrence: { type: 'string', enum: ['none', 'daily', 'weekly'] },
        notify: { type: 'boolean', description: 'false = no date/time and no reminders' },
        important: { type: 'boolean', description: 'Mark the task as important' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Up to 5 tags' }
      }
    }
  },
  {
    name: 'add_tasks',
    description: 'Add several tasks at once to Go, Now!. Each item uses the same fields as add_task.',
    inputSchema: {
      type: 'object',
      required: ['tasks'],
      properties: {
        tasks: {
          type: 'array',
          description: 'Array of task objects',
          items: {
            type: 'object',
            required: ['title'],
            properties: {
              title: { type: 'string', description: 'Task title' },
              date: { type: 'string', description: 'Date YYYY-MM-DD; defaults to today' },
              time: { type: 'string', description: 'Time HH:MM' },
              note: { type: 'string', description: 'Optional note' },
              recurrence: { type: 'string', enum: ['none', 'daily', 'weekly'] },
              notify: { type: 'boolean', description: 'false = no date/time and no reminders' },
              important: { type: 'boolean', description: 'Mark the task as important' },
              tags: { type: 'array', items: { type: 'string' }, description: 'Up to 5 tags' }
            }
          }
        }
      }
    }
  },
  {
    name: 'delete_task',
    description: 'Delete a task from Go, Now! by id.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Task id' }
      }
    }
  },
  {
    name: 'update_task',
    description: 'Edit an existing task in Go, Now! by id. Only the provided fields are changed.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Task id' },
        title: { type: 'string' },
        date: { type: 'string', description: 'Date YYYY-MM-DD or null for none' },
        time: { type: 'string', description: 'Time HH:MM or null' },
        note: { type: 'string' },
        recurrence: { type: 'string', enum: ['none', 'daily', 'weekly'] },
        notify: { type: 'boolean' },
        important: { type: 'boolean', description: 'Mark the task as important' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Up to 5 tags' },
        done: { type: 'boolean' }
      }
    }
  }
];

async function callTool(name, args) {
  if (name === 'list_tasks') return listTasks(args || {});
  if (name === 'add_task') return addTask(args || {});
  if (name === 'add_tasks') return addTasks(args || {});
  if (name === 'update_task') return updateTask(args || {});
  if (name === 'delete_task') return deleteTask(args || {});
  throw new Error(`unknown tool: ${name}`);
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function reply(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function replyError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

async function handle(message) {
  const { id, method, params } = message;
  if (method === 'initialize') {
    reply(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: SERVER_INFO });
    return;
  }
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') return;
  if (method === 'ping') {
    reply(id, {});
    return;
  }
  if (method === 'tools/list') {
    reply(id, { tools: TOOLS });
    return;
  }
  if (method === 'tools/call') {
    const name = params && params.name;
    const args = (params && params.arguments) || {};
    try {
      const result = await callTool(name, args);
      reply(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] });
    } catch (err) {
      reply(id, { content: [{ type: 'text', text: err.message }], isError: true });
    }
    return;
  }
  if (id !== undefined) replyError(id, -32601, `method not found: ${method}`);
}

let buffer = '';
let pending = 0;
let stdinEnded = false;

function maybeExit() {
  if (stdinEnded && pending === 0) process.exit(0);
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let index = buffer.indexOf('\n');
  while (index !== -1) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (line) {
      let message = null;
      try {
        message = JSON.parse(line);
      } catch (err) {
        message = null;
      }
      if (message && typeof message === 'object') {
        pending += 1;
        Promise.resolve()
          .then(() => handle(message))
          .catch((err) => {
            if (message.id !== undefined) replyError(message.id, -32603, err.message);
          })
          .finally(() => {
            pending -= 1;
            maybeExit();
          });
      }
    }
    index = buffer.indexOf('\n');
  }
});

process.stdin.on('end', () => {
  stdinEnded = true;
  maybeExit();
});
