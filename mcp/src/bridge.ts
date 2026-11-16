import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export type TaskRecord = Record<string, any>;

export interface BridgeInfo {
  transport?: string;
  path?: string;
  token?: string;
  pid?: number;
}

export interface BridgeReply {
  offline: boolean;
  status?: number;
  body?: any;
}

export interface StoreData {
  tasks: TaskRecord[];
  settings: Record<string, any>;
  [key: string]: any;
}

let bridgeCache: { mtimeMs: number; size: number; info: BridgeInfo } | null = null;

export function appDataDir(): string {
  if (process.env.GONOW_USER_DATA) return path.resolve(process.env.GONOW_USER_DATA);
  if (process.platform === 'win32') {
    const base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(base, 'Go, Now!');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Go, Now!');
  }
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'Go, Now!');
}

export function storePath(): string {
  return path.join(appDataDir(), 'pixel-planner.json');
}

export function bridgePath(): string {
  return path.join(appDataDir(), 'bridge.json');
}

export function readBridgeInfo(): BridgeInfo | null {
  const file = bridgePath();
  try {
    const stat = fs.statSync(file);
    if (bridgeCache && bridgeCache.mtimeMs === stat.mtimeMs && bridgeCache.size === stat.size) {
      return bridgeCache.info;
    }
    const info = JSON.parse(fs.readFileSync(file, 'utf8')) as BridgeInfo;
    bridgeCache = { mtimeMs: stat.mtimeMs, size: stat.size, info };
    return info;
  } catch {
    bridgeCache = null;
    return null;
  }
}

export function bridgeRequest(method: string, urlPath: string, body?: unknown): Promise<BridgeReply> {
  return new Promise((resolve) => {
    const info = readBridgeInfo();
    if (!info || !info.path) {
      resolve({ offline: true });
      return;
    }
    const message = {
      id: crypto.randomUUID(),
      method,
      path: urlPath,
      body: body === undefined ? null : body,
      token: info.token
    };
    let settled = false;
    const socket = net.connect(info.path);
    const finish = (result: BridgeReply): void => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {}
      resolve(result);
    };
    let buffer = '';
    socket.setEncoding('utf8');
    socket.setTimeout(5000, () => finish({ offline: true }));
    socket.on('connect', () => {
      try {
        socket.write(`${JSON.stringify(message)}\n`);
      } catch {
        finish({ offline: true });
      }
    });
    socket.on('data', (chunk) => {
      buffer += chunk;
      const index = buffer.indexOf('\n');
      if (index === -1) return;
      let parsed: any = null;
      try {
        parsed = JSON.parse(buffer.slice(0, index));
      } catch {
        parsed = null;
      }
      if (!parsed) {
        finish({ offline: true });
        return;
      }
      finish({ offline: false, status: parsed.status, body: parsed.body });
    });
    socket.on('error', () => finish({ offline: true }));
    socket.on('close', () => finish({ offline: true }));
  });
}

export function appAlive(): boolean {
  const info = readBridgeInfo();
  if (!info || !Number.isInteger(info.pid)) return false;
  try {
    process.kill(info.pid as number, 0);
    return true;
  } catch (err: any) {
    return err.code === 'EPERM';
  }
}

export function ensureFileFallback(): void {
  if (appAlive()) {
    throw new Error('Go, Now! is running but its bridge is unavailable; refusing to write the data file');
  }
}

export function readStore(): StoreData {
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath(), 'utf8')) as StoreData;
    if (!Array.isArray(parsed.tasks)) parsed.tasks = [];
    if (!parsed.settings) parsed.settings = {};
    return parsed;
  } catch {
    return { tasks: [], settings: {} };
  }
}

export function writeStore(data: StoreData): void {
  const target = storePath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  try {
    if (fs.existsSync(target)) fs.copyFileSync(target, `${target}.bak`);
  } catch {}
  const tmp = `${target}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeFileSync(fd, JSON.stringify(data, null, 2), 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, target);
}

function sleepSync(ms: number): void {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {}
}

export function acquireStoreLock(timeoutMs = 1500): string | null {
  const lockPath = path.join(appDataDir(), 'store.lock');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
      fs.closeSync(fd);
      return lockPath;
    } catch (err: any) {
      if (err.code !== 'EEXIST') return null;
      try {
        const stat = fs.statSync(lockPath);
        if (Date.now() - stat.mtimeMs > 10000) {
          fs.unlinkSync(lockPath);
          continue;
        }
      } catch {
        continue;
      }
      sleepSync(50);
    }
  }
  return null;
}

export function releaseStoreLock(lockPath: string | null): void {
  if (!lockPath) return;
  try {
    fs.unlinkSync(lockPath);
  } catch {}
}

export function withStoreLock<T>(fn: () => T): T {
  ensureFileFallback();
  const lock = acquireStoreLock();
  try {
    return fn();
  } finally {
    releaseStoreLock(lock);
  }
}
