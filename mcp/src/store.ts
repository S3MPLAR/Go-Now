import crypto from 'node:crypto';
import {
  appAlive,
  bridgeRequest,
  readStore,
  withStoreLock,
  writeStore,
  type BridgeReply,
  type TaskRecord
} from './bridge';

const RECURRENCES = new Set(['none', 'daily', 'weekly', 'monthly', 'weekdays', 'everyN']);

export interface ListArgs {
  date?: string;
  from?: string;
  to?: string;
  search?: string;
  include_done?: boolean;
  include_archived?: boolean;
}

export interface ListResult {
  source: 'app' | 'file' | 'file-stale';
  tasks: TaskRecord[];
}

export interface CommandResult {
  source: 'app' | 'file';
  task?: TaskRecord;
  tasks?: TaskRecord[];
  deleted?: string;
}

export function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function todayString(): string {
  const dt = new Date();
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

export function isDateString(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function isTimeString(value: unknown): value is string {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value);
}

function normalizeInterval(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 2;
  return Math.min(365, Math.max(2, Math.round(number)));
}

function normalizeRecurrenceDay(value: unknown, date: unknown): number | null {
  const day = Number(value);
  if (Number.isFinite(day) && day >= 1 && day <= 31) return Math.round(day);
  const parts = String(date || '').split('-').map(Number);
  return parts[2] >= 1 && parts[2] <= 31 ? parts[2] : null;
}

export function sortTasks(tasks: TaskRecord[]): TaskRecord[] {
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

function bridgeMessage(reply: BridgeReply, fallback: string): string {
  return reply.body && typeof reply.body.error === 'string' ? reply.body.error : fallback;
}

export async function listTasks(args: ListArgs = {}): Promise<ListResult> {
  const date = isDateString(args.date) ? args.date : null;
  const from = isDateString(args.from) ? args.from : null;
  const to = isDateString(args.to) ? args.to : null;
  const search = typeof args.search === 'string' ? args.search.trim().toLowerCase() : '';
  const includeDone = args.include_done !== false;
  const includeArchived = args.include_archived === true;
  const query: string[] = [];
  if (date) query.push(`date=${encodeURIComponent(date)}`);
  if (includeArchived) query.push('include_archived=1');
  const reply = await bridgeRequest('GET', query.length ? `/tasks?${query.join('&')}` : '/tasks');
  let tasks: TaskRecord[];
  let source: ListResult['source'];
  if (!reply.offline && reply.status === 200) {
    tasks = Array.isArray(reply.body && reply.body.tasks) ? reply.body.tasks : [];
    source = 'app';
  } else {
    tasks = sortTasks(readStore().tasks.filter((task) => includeArchived || !task.archived));
    if (date) tasks = tasks.filter((task) => task.date === date);
    source = appAlive() ? 'file-stale' : 'file';
  }
  if (from) tasks = tasks.filter((task) => task.date && task.date >= from);
  if (to) tasks = tasks.filter((task) => task.date && task.date <= to);
  if (search) {
    tasks = tasks.filter((task) =>
      `${task.title || ''}\n${task.note || ''}\n${(task.tags || []).join(' ')}`.toLowerCase().includes(search)
    );
  }
  if (!includeDone) tasks = tasks.filter((task) => !task.done);
  return { source, tasks };
}

export function sanitizeTags(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const seen = new Set<string>();
  const tags: string[] = [];
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

export function normalizeNewTask(input: Record<string, any>): TaskRecord {
  const title = String(input.title || '').trim().slice(0, 140);
  if (!title) throw new Error('title required');
  const notify = input.notify !== false;
  const date = notify ? (isDateString(input.date) ? input.date : todayString()) : null;
  const recurrence = date && RECURRENCES.has(input.recurrence) ? input.recurrence : 'none';
  const recurrenceInterval = recurrence === 'everyN' ? normalizeInterval(input.recurrenceInterval) : null;
  const recurrenceDay = recurrence === 'monthly' ? normalizeRecurrenceDay(input.recurrenceDay, date) : null;
  return {
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
    order: null,
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
}

export async function addTask(args: Record<string, any> = {}): Promise<CommandResult> {
  const reply = await bridgeRequest('POST', '/tasks', args);
  if (!reply.offline) {
    if (reply.status === 200) return { source: 'app', task: reply.body.task };
    throw new Error(bridgeMessage(reply, 'failed to add task'));
  }
  return withStoreLock(() => {
    const data = readStore();
    const task = normalizeNewTask(args);
    data.tasks.push(task);
    writeStore(data);
    return { source: 'file', task };
  });
}

export async function addTasks(args: { tasks?: unknown[] } = {}): Promise<CommandResult> {
  const items = Array.isArray(args.tasks) ? args.tasks : [];
  if (!items.length) throw new Error('tasks required');
  const reply = await bridgeRequest('POST', '/tasks/bulk', { tasks: items });
  if (!reply.offline) {
    if (reply.status === 200) return { source: 'app', tasks: reply.body.tasks };
    throw new Error(bridgeMessage(reply, 'failed to add tasks'));
  }
  return withStoreLock(() => {
    const data = readStore();
    const tasks = items.map((item) => normalizeNewTask(item && typeof item === 'object' ? item : {}));
    data.tasks.push(...tasks);
    writeStore(data);
    return { source: 'file', tasks };
  });
}

function applyUpdate(task: TaskRecord, input: Record<string, any>): void {
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
  const intervalSource = input.recurrenceInterval !== undefined ? input.recurrenceInterval : task.recurrenceInterval;
  const recurrenceInterval = recurrence === 'everyN' ? normalizeInterval(intervalSource) : null;
  const recurrenceDay = recurrence === 'monthly'
    ? normalizeRecurrenceDay(
        input.recurrenceDay !== undefined ? input.recurrenceDay : (date !== task.date ? date : task.recurrenceDay),
        date
      )
    : null;
  const scheduleChanged =
    date !== task.date ||
    time !== task.time ||
    recurrence !== task.recurrence ||
    recurrenceInterval !== (task.recurrenceInterval || null) ||
    recurrenceDay !== (task.recurrenceDay || null) ||
    notify !== (task.notify !== false);
  task.title = title;
  task.date = date;
  task.time = time;
  task.recurrence = recurrence;
  task.recurrenceInterval = recurrenceInterval;
  task.recurrenceDay = recurrenceDay;
  task.notify = notify;
  if (input.important !== undefined) task.important = !!input.important;
  if (input.tags !== undefined) task.tags = sanitizeTags(input.tags);
  if (input.note !== undefined) task.note = String(input.note || '').trim().slice(0, 1000);
  if (scheduleChanged) {
    task.notifiedFor = null;
    task.snoozeUntil = null;
  }
}

export async function updateTask(args: Record<string, any> = {}): Promise<CommandResult> {
  const id = String(args.id || '');
  if (!id) throw new Error('id required');
  const patch: Record<string, any> = { ...args };
  delete patch.id;
  const reply = await bridgeRequest('PATCH', `/tasks/${encodeURIComponent(id)}`, patch);
  if (!reply.offline) {
    if (reply.status === 200) return { source: 'app', task: reply.body.task };
    throw new Error(bridgeMessage(reply, 'task not found'));
  }
  return withStoreLock(() => {
    const data = readStore();
    const task = data.tasks.find((item) => item.id === id);
    if (!task) throw new Error('task not found');
    const fields: Record<string, any> = { ...patch };
    const wantsDone = fields.done !== undefined;
    delete fields.done;
    applyUpdate(task, fields);
    if (wantsDone) {
      task.done = !!patch.done;
      task.doneAt = task.done ? new Date().toISOString() : null;
    }
    writeStore(data);
    return { source: 'file', task };
  });
}

export async function deleteTask(args: Record<string, any> = {}): Promise<CommandResult> {
  const id = String(args.id || '');
  if (!id) throw new Error('id required');
  const reply = await bridgeRequest('DELETE', `/tasks/${encodeURIComponent(id)}`);
  if (!reply.offline) {
    if (reply.status === 200) return { source: 'app', deleted: id };
    throw new Error(bridgeMessage(reply, 'task not found'));
  }
  return withStoreLock(() => {
    const data = readStore();
    const before = data.tasks.length;
    data.tasks = data.tasks.filter((task) => task.id !== id);
    if (data.tasks.length === before) throw new Error('task not found');
    writeStore(data);
    return { source: 'file', deleted: id };
  });
}

export async function snoozeTask(args: Record<string, any> = {}): Promise<CommandResult> {
  const id = String(args.id || '');
  if (!id) throw new Error('id required');
  const number = Number(args.minutes);
  const minutes = Number.isFinite(number) ? Math.min(1440, Math.max(1, Math.round(number))) : 10;
  const reply = await bridgeRequest('POST', `/tasks/${encodeURIComponent(id)}/snooze`, { minutes });
  if (!reply.offline) {
    if (reply.status === 200) return { source: 'app', task: reply.body.task };
    throw new Error(bridgeMessage(reply, 'task not found'));
  }
  return withStoreLock(() => {
    const data = readStore();
    const task = data.tasks.find((item) => item.id === id);
    if (!task) throw new Error('task not found');
    task.snoozeUntil = Date.now() + minutes * 60 * 1000;
    task.notifiedFor = null;
    writeStore(data);
    return { source: 'file', task };
  });
}

export async function archiveTask(args: Record<string, any> = {}): Promise<CommandResult> {
  const id = String(args.id || '');
  if (!id) throw new Error('id required');
  const reply = await bridgeRequest('POST', `/tasks/${encodeURIComponent(id)}/archive`);
  if (!reply.offline) {
    if (reply.status === 200) return { source: 'app', task: reply.body.task };
    throw new Error(bridgeMessage(reply, 'task not found'));
  }
  return withStoreLock(() => {
    const data = readStore();
    const task = data.tasks.find((item) => item.id === id);
    if (!task) throw new Error('task not found');
    if (!task.archived) {
      task.archived = true;
      task.archivedAt = new Date().toISOString();
    }
    writeStore(data);
    return { source: 'file', task };
  });
}

export async function unarchiveTask(args: Record<string, any> = {}): Promise<CommandResult> {
  const id = String(args.id || '');
  if (!id) throw new Error('id required');
  const reply = await bridgeRequest('POST', `/tasks/${encodeURIComponent(id)}/unarchive`);
  if (!reply.offline) {
    if (reply.status === 200) return { source: 'app', task: reply.body.task };
    throw new Error(bridgeMessage(reply, 'task not found'));
  }
  return withStoreLock(() => {
    const data = readStore();
    const task = data.tasks.find((item) => item.id === id);
    if (!task) throw new Error('task not found');
    if (task.archived) {
      task.archived = false;
      task.archivedAt = null;
    }
    writeStore(data);
    return { source: 'file', task };
  });
}

export interface Stats {
  active: number;
  done: number;
  archived: number;
  today: number;
  overdue: number;
  undated: number;
  doneToday: number;
  doneWeek: number;
}

export interface TagCount {
  tag: string;
  count: number;
}

export async function getStats(): Promise<{ source: ListResult['source']; stats: Stats }> {
  const { source, tasks } = await listTasks({ include_archived: true });
  const today = todayString();
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - 6);
  const active = tasks.filter((task) => !task.archived && !task.done);
  const done = tasks.filter((task) => !task.archived && task.done);
  const doneSince = (task: TaskRecord, from: number): boolean => {
    const stamp = task.doneAt ? Date.parse(task.doneAt) : NaN;
    return !Number.isNaN(stamp) && stamp >= from;
  };
  const doneToday = done.filter((task) => String(task.doneAt || '').slice(0, 10) === today).length;
  return {
    source,
    stats: {
      active: active.length,
      done: done.length,
      archived: tasks.filter((task) => task.archived).length,
      today: active.filter((task) => task.date === today).length,
      overdue: active.filter((task) => task.date && task.date < today).length,
      undated: active.filter((task) => !task.date).length,
      doneToday,
      doneWeek: done.filter((task) => doneSince(task, weekStart.getTime())).length
    }
  };
}

export async function listTags(args: Record<string, any> = {}): Promise<{ source: ListResult['source']; tags: TagCount[] }> {
  const includeArchived = args.include_archived !== false;
  const { source, tasks } = await listTasks({ include_archived: includeArchived });
  const counts = new Map<string, { tag: string; count: number }>();
  for (const task of tasks) {
    for (const tag of task.tags || []) {
      const key = String(tag).toLowerCase();
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { tag: String(tag), count: 1 });
    }
  }
  return {
    source,
    tags: [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
  };
}
