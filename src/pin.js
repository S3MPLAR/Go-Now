const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const PS_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$hwnd = [IntPtr]__HWND__
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class PPWin32 {
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr FindWindow(string cls, string win);
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string win);
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr SetParent(IntPtr child, IntPtr parent);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
}
"@
$script:target = [IntPtr]::Zero
$cb = [PPWin32+EnumProc]{
  param($top, $lp)
  $sv = [PPWin32]::FindWindowEx($top, [IntPtr]::Zero, 'SHELLDLL_DefView', [NullString]::Value)
  if ($sv -ne [IntPtr]::Zero -and $script:target -eq [IntPtr]::Zero) { $script:target = $top }
  return $true
}
[void][PPWin32]::EnumWindows($cb, [IntPtr]::Zero)
if ($script:target -eq [IntPtr]::Zero) {
  $progman = [PPWin32]::FindWindow('Progman', [NullString]::Value)
  if ($progman -ne [IntPtr]::Zero) { $script:target = $progman }
}
if ($script:target -eq [IntPtr]::Zero) { Write-Output 'FAIL'; exit 0 }
[void][PPWin32]::SetParent($hwnd, $script:target)
$mode = '__MODE__'
if ($mode -eq 'plain') { Write-Output 'OK'; exit 0 }
$flags = 0x0002 -bor 0x0001 -bor 0x0010
if ($mode -ne 'raise') { $flags = $flags -bor 0x0020 }
$ok = [PPWin32]::SetWindowPos($hwnd, [IntPtr]::Zero, 0, 0, 0, 0, $flags)
if ($ok) { Write-Output 'OK' } else { Write-Output 'FAIL' }
`;

const CHECK_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$hwnd = [IntPtr]__HWND__
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class PPPinCheck {
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr GetAncestor(IntPtr h, uint flags);
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string win);
}
"@
$parent = [PPPinCheck]::GetAncestor($hwnd, 1)
if ($parent -eq [IntPtr]::Zero) { Write-Output 'NO'; exit 0 }
$sv = [PPPinCheck]::FindWindowEx($parent, [IntPtr]::Zero, 'SHELLDLL_DefView', [NullString]::Value)
if ($sv -ne [IntPtr]::Zero) { Write-Output 'YES' } else { Write-Output 'NO' }
`;

function readHwnd(win) {
  const handle = win.getNativeWindowHandle();
  return handle.length >= 8 ? handle.readBigUInt64LE(0) : BigInt(handle.readUInt32LE(0));
}

function runScript(scriptPath, expected) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', scriptPath],
      { windowsHide: true, timeout: 15000 },
      (err, stdout, stderr) => {
        if (err) {
          console.error('[pin] powershell error:', err.message, String(stderr || '').trim());
          resolve(false);
          return;
        }
        resolve(String(stdout).includes(expected));
      }
    );
  });
}

function pinToDesktop(win) {
  if (process.platform !== 'win32') return Promise.resolve(false);
  let hwnd;
  try {
    hwnd = readHwnd(win);
  } catch (err) {
    console.error('[pin] cannot read hwnd:', err.message);
    return Promise.resolve(false);
  }
  const scriptPath = path.join(app.getPath('userData'), 'pin-widget.ps1');
  try {
    fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
    fs.writeFileSync(scriptPath, PS_SCRIPT.replace('__HWND__', hwnd.toString()).replace('__MODE__', process.env.PP_PINMODE || 'framechanged'), 'utf8');
  } catch (err) {
    console.error('[pin] cannot write script:', err.message);
    return Promise.resolve(false);
  }
  return runScript(scriptPath, 'OK');
}

function isPinnedToDesktop(win) {
  if (process.platform !== 'win32') return Promise.resolve(false);
  let hwnd;
  try {
    hwnd = readHwnd(win);
  } catch (err) {
    return Promise.resolve(false);
  }
  const scriptPath = path.join(app.getPath('userData'), 'pin-check.ps1');
  try {
    fs.writeFileSync(scriptPath, CHECK_SCRIPT.replace('__HWND__', hwnd.toString()), 'utf8');
  } catch (err) {
    return Promise.resolve(false);
  }
  return runScript(scriptPath, 'YES');
}

module.exports = { pinToDesktop, isPinnedToDesktop };
