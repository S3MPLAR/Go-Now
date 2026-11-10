#!/usr/bin/env node
const { spawn } = require('node:child_process');
const path = require('node:path');

const SERVER = path.join(__dirname, '..', 'mcp', 'gonow-mcp.js');
const child = spawn(process.execPath, [SERVER], { stdio: ['pipe', 'pipe', 'inherit'] });

let buffer = '';
let nextId = 1;
const pending = new Map();
const timings = [];

child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
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
      if (message && message.id !== undefined && pending.has(message.id)) {
        const { resolve, reject, timer } = pending.get(message.id);
        clearTimeout(timer);
        pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
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

function notify(method, params) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
}

async function call(name, args) {
  const started = Date.now();
  const result = await rpc('tools/call', { name, arguments: args || {} });
  const text = result.content && result.content[0] ? result.content[0].text : '';
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    parsed = text;
  }
  const ms = Date.now() - started;
  timings.push({ name, ms });
  if (result.isError) throw new Error(typeof parsed === 'string' ? parsed : JSON.stringify(parsed));
  return parsed;
}

function todayString() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function printTimings() {
  console.log('\nTimings:');
  for (const item of timings) console.log(`  ${item.name.padEnd(22)} ${String(item.ms).padStart(5)} ms`);
  const total = timings.reduce((sum, item) => sum + item.ms, 0);
  console.log(`  ${'total'.padEnd(22)} ${String(total).padStart(5)} ms`);
}

(async () => {
  const created = [];
  try {
    const initStart = Date.now();
    const init = await rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'gonow-smoke', version: '1.0.0' }
    });
    const initMs = Date.now() - initStart;
    notify('notifications/initialized', {});
    console.log(`MCP server: ${init.serverInfo.name} ${init.serverInfo.version} (init ${initMs} ms)`);

    const tools = await rpc('tools/list', {});
    const names = tools.tools.map((tool) => tool.name);
    console.log(`Tools (${names.length}): ${names.join(', ')}`);
    for (const required of ['list_tasks', 'add_task', 'add_tasks', 'update_task', 'delete_task']) {
      if (!names.includes(required)) throw new Error(`missing tool: ${required}`);
    }

    const before = await call('list_tasks', {});
    console.log(`list_tasks: source=${before.source}, count=${before.tasks.length}`);

    const today = todayString();
    const bulk = await call('add_tasks', {
      tasks: [
        { title: 'MCP smoke A', date: today, time: '23:50', note: 'smoke test' },
        { title: 'MCP smoke B', date: today, time: '23:55', note: 'smoke test' }
      ]
    });
    bulk.tasks.forEach((task) => created.push(task.id));
    console.log(`add_tasks: source=${bulk.source}, created=${bulk.tasks.length}`);

    const found = await call('list_tasks', { date: today, search: 'MCP smoke' });
    console.log(`list_tasks search: source=${found.source}, count=${found.tasks.length}`);
    if (found.tasks.length !== 2) throw new Error(`expected 2 tasks, got ${found.tasks.length}`);

    const target = found.tasks[0];
    const updated = await call('update_task', { id: target.id, note: 'updated by smoke test' });
    console.log(`update_task: source=${updated.source}, note="${updated.task.note}"`);

    for (const id of created.splice(0)) {
      const deleted = await call('delete_task', { id });
      console.log(`delete_task: source=${deleted.source}, id=${deleted.deleted}`);
    }

    printTimings();
    console.log('\nMCP SMOKE OK');
    child.stdin.end();
    setTimeout(() => process.exit(0), 300);
  } catch (err) {
    console.error(`\nMCP SMOKE FAILED: ${err.message}`);
    for (const id of created) {
      try {
        await call('delete_task', { id });
      } catch (cleanupError) {
        // ignore
      }
    }
    child.stdin.end();
    setTimeout(() => process.exit(1), 300);
  }
})();
