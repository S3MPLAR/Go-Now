const koffi = require('koffi');

const GA_PARENT = 1;
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOACTIVATE = 0x0010;
const SWP_FRAMECHANGED = 0x0020;

let api = null;

function toHandle(value) {
  return typeof value === 'bigint' ? value : BigInt(value);
}

function load() {
  if (api) return api;
  const user32 = koffi.load('user32.dll');
  const EnumWindowsProc = koffi.proto('int EnumWindowsProc(uint64 hwnd, int64 lParam)');
  api = {
    FindWindowW: user32.func('FindWindowW', 'uint64', ['str16', 'str16']),
    FindWindowExW: user32.func('FindWindowExW', 'uint64', ['uint64', 'uint64', 'str16', 'str16']),
    EnumWindows: user32.func('EnumWindows', 'int', [koffi.pointer(EnumWindowsProc), 'int64']),
    SetParent: user32.func('SetParent', 'uint64', ['uint64', 'uint64']),
    SetWindowPos: user32.func('SetWindowPos', 'int', ['uint64', 'uint64', 'int', 'int', 'int', 'int', 'uint32']),
    GetAncestor: user32.func('GetAncestor', 'uint64', ['uint64', 'uint32']),
    IsWindow: user32.func('IsWindow', 'int', ['uint64']),
    EnumWindowsProc
  };
  return api;
}

function findDesktopTarget() {
  const a = load();
  let target = 0n;
  const cb = koffi.register((hwnd) => {
    const handle = toHandle(hwnd);
    if (target !== 0n) return 1;
    const shellView = toHandle(a.FindWindowExW(handle, 0n, 'SHELLDLL_DefView', null));
    if (shellView !== 0n) target = handle;
    return 1;
  }, koffi.pointer(a.EnumWindowsProc));
  try {
    a.EnumWindows(cb, 0n);
  } finally {
    koffi.unregister(cb);
  }
  if (target === 0n) {
    const progman = toHandle(a.FindWindowW('Progman', null));
    if (progman !== 0n) target = progman;
  }
  return target;
}

function pinToDesktopNative(hwnd, mode = 'framechanged') {
  if (process.platform !== 'win32') return false;
  if (!hwnd) return false;
  const a = load();
  const handle = toHandle(hwnd);
  if (!a.IsWindow(handle)) return false;
  const target = findDesktopTarget();
  if (!target) return false;
  a.SetParent(handle, target);
  if (mode === 'plain') return true;
  let flags = SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE;
  if (mode !== 'raise') flags |= SWP_FRAMECHANGED;
  return a.SetWindowPos(handle, 0n, 0, 0, 0, 0, flags) !== 0;
}

function isPinnedToDesktopNative(hwnd) {
  if (process.platform !== 'win32') return false;
  if (!hwnd) return false;
  const a = load();
  const handle = toHandle(hwnd);
  if (!a.IsWindow(handle)) return false;
  const parent = toHandle(a.GetAncestor(handle, GA_PARENT));
  if (!parent) return false;
  return toHandle(a.FindWindowExW(parent, 0n, 'SHELLDLL_DefView', null)) !== 0n;
}

module.exports = { pinToDesktopNative, isPinnedToDesktopNative, findDesktopTarget };
