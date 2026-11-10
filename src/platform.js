const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const isLinux = process.platform === 'linux';

function executablePath() {
  if (isWindows && process.env.PORTABLE_EXECUTABLE_FILE) return process.env.PORTABLE_EXECUTABLE_FILE;
  if (isLinux && process.env.APPIMAGE) return process.env.APPIMAGE;
  return process.execPath;
}

function autostartFile() {
  const config = process.env.XDG_CONFIG_HOME || path.join(app.getPath('home'), '.config');
  return path.join(config, 'autostart', 'gonow.desktop');
}

function applyAutostart(enabled) {
  if (!app.isPackaged) return;
  const on = !!enabled;
  if (isLinux) {
    const file = autostartFile();
    try {
      if (!on) {
        if (fs.existsSync(file)) fs.unlinkSync(file);
        return;
      }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const exec = executablePath().replace(/%/g, '%%').replace(/(["\\])/g, '\\$1');
      const content = [
        '[Desktop Entry]',
        'Type=Application',
        'Name=Go, Now!',
        `Exec="${exec}"`,
        'Terminal=false',
        'X-GNOME-Autostart-enabled=true',
        'Categories=Utility;'
      ].join('\n');
      fs.writeFileSync(file, `${content}\n`, 'utf8');
    } catch (err) {
      console.error('[autostart] linux failed:', err.message);
    }
    return;
  }
  try {
    if (isMac) {
      app.setLoginItemSettings({ openAtLogin: on });
    } else {
      app.setLoginItemSettings({
        openAtLogin: on,
        path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath,
        args: []
      });
    }
  } catch (err) {
    console.error('[autostart] failed:', err.message);
  }
}

function trayIconName() {
  if (isMac) return 'trayTemplate.png';
  if (isLinux) return 'tray-22.png';
  return 'tray.png';
}

function trayIconPath() {
  return path.join(app.getAppPath(), 'renderer', 'assets', trayIconName());
}

function mcpSourcePath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'mcp', 'gonow-mcp.js')
    : path.join(app.getAppPath(), 'mcp', 'gonow-mcp.js');
}

function stableMcpPath() {
  const source = mcpSourcePath();
  const dir = path.join(app.getPath('userData'), 'mcp');
  const target = path.join(dir, 'gonow-mcp.js');
  try {
    if (!fs.existsSync(source)) return source;
    fs.mkdirSync(dir, { recursive: true });
    const srcStat = fs.statSync(source);
    let copy = true;
    if (fs.existsSync(target)) {
      const dstStat = fs.statSync(target);
      copy = dstStat.size !== srcStat.size || dstStat.mtimeMs < srcStat.mtimeMs;
    }
    if (copy) fs.copyFileSync(source, target);
    return target;
  } catch (err) {
    console.error('[mcp] copy failed:', err.message);
    return source;
  }
}

module.exports = {
  isWindows,
  isMac,
  isLinux,
  executablePath,
  applyAutostart,
  trayIconName,
  trayIconPath,
  mcpSourcePath,
  stableMcpPath
};
