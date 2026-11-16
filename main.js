const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, shell, dialog, globalShortcut, clipboard, session, powerMonitor, Notification } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const crypto = require('node:crypto');
const { fileURLToPath } = require('node:url');
const Store = require('./src/store');
const { buildExport, parseImport } = require('./src/data-transfer');
const { pinToDesktop, isPinnedToDesktop, backend: pinBackend } = require('./src/pin');
const { resolveTaskSound } = require('./src/sound-routing');
const platform = require('./src/platform');
const { normalizeAccelerator, sameAccelerator, displayAccelerator } = require('./src/accelerators');

const SMOKE = process.argv.includes('--smoke');
const DEBUG = !app.isPackaged && process.env.PP_DEBUG === '1';
const NO_LOCK = SMOKE || (!app.isPackaged && process.env.PP_NOLOCK === '1');
if (!app.isPackaged && process.env.GONOW_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.GONOW_USER_DATA));
}
const DEFAULT_HOTKEY = 'Alt+Shift+Q';
const DEFAULT_QUICK_HOTKEY = 'CommandOrControl+Alt+Space';
const BUILTIN_SOUND_IDS = new Set(['soft', 'pixel', 'bell', 'pulse', 'chime', 'click']);
const SOUND_TYPES = new Map([
  ['.mp3', 'audio/mpeg'],
  ['.wav', 'audio/wav'],
  ['.ogg', 'audio/ogg'],
  ['.m4a', 'audio/mp4']
]);
const SOUND_MAX_BYTES = 5 * 1024 * 1024;
const MAX_CUSTOM_SOUNDS = 5;
const DEFAULT_SOUND_VOLUME = 80;
const QUICK_WIDTH = 620;
const QUICK_HEIGHT = 190;
const WIDGET_WIDTH = 320;
const WIDGET_HEIGHT = 440;
const WIDGET_MIN_WIDTH = 260;
const WIDGET_MAX_WIDTH = 640;
const WIDGET_MIN_HEIGHT = 300;
const WIDGET_MAX_HEIGHT = 1000;
const WIDGET_MIN_VISIBLE = 40;

function clampInt(value, fallback, min, max) {
  if (value == null) return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

function localDateString() {
  const dt = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function workAreaFor(x, y, width, height) {
  const display = screen.getDisplayMatching({
    x: Math.round(x),
    y: Math.round(y),
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height))
  });
  return display.workArea;
}

function clampWidgetPosition(x, y, width, height) {
  const wa = workAreaFor(x, y, width, height);
  const minX = wa.x - width + WIDGET_MIN_VISIBLE;
  const maxX = wa.x + wa.width - WIDGET_MIN_VISIBLE;
  const minY = wa.y;
  const maxY = wa.y + wa.height - WIDGET_MIN_VISIBLE;
  return {
    x: Math.min(maxX, Math.max(minX, Math.round(x))),
    y: Math.min(maxY, Math.max(minY, Math.round(y)))
  };
}

function clampWidgetSize(width, height, x, y) {
  const wa = workAreaFor(x, y, width, height);
  return {
    width: clampInt(width, WIDGET_WIDTH, WIDGET_MIN_WIDTH, Math.min(WIDGET_MAX_WIDTH, wa.width)),
    height: clampInt(height, WIDGET_HEIGHT, WIDGET_MIN_HEIGHT, Math.min(WIDGET_MAX_HEIGHT, wa.height))
  };
}

const THEMES = ['peach', 'mint', 'sky', 'lavender', 'night', 'mono'];
const THEME_BG = {
  peach: '#fff7f3',
  mint: '#f2fbf7',
  sky: '#f2f7ff',
  lavender: '#f8f5ff',
  night: '#211826',
  mono: '#0f0f0f'
};

const LANGUAGES = ['ru', 'en'];
const MAIN_STRINGS = {
  ru: {
    openPlanner: 'Открыть планер',
    quickAdd: 'Быстрое добавление',
    hideWidget: 'Скрыть виджет',
    showWidget: 'Показать виджет',
    pinned: 'Виджет закреплён на столе',
    pin: 'Закрепить виджет на столе',
    autostart: 'Автозапуск',
    quit: 'Выход',
    chooseLogoTitle: 'Выберите логотип',
    imagesFilter: 'Изображения',
    chooseSoundTitle: 'Выберите звук',
    audioFilter: 'Аудио',
    removeSoundTitle: 'Удалить звук',
    removeSoundConfirm: 'Удалить звук «{name}»?',
    remove: 'Удалить',
    missedTitle: 'Пропущено напоминаний: {count}',
    missedMore: '…и ещё {count}',
    fatalTitle: 'Критическая ошибка',
    fatalDetail: 'Данные сохранены. Перезапустить приложение?',
    fatalRestart: 'Перезапустить',
    fatalQuit: 'Закрыть',
    exportTitle: 'Экспорт задач',
    importTitle: 'Импорт задач',
    importConfirm: 'Заменить текущий список задач данными из файла?',
    importModeMessage: 'Заменить текущий список задач или добавить задачи из файла?',
    importReplace: 'Заменить',
    importMerge: 'Добавить',
    cancel: 'Отмена'
  },
  en: {
    openPlanner: 'Open planner',
    quickAdd: 'Quick add',
    hideWidget: 'Hide widget',
    showWidget: 'Show widget',
    pinned: 'Widget pinned to desktop',
    pin: 'Pin widget to desktop',
    autostart: 'Start with Windows',
    quit: 'Quit',
    chooseLogoTitle: 'Choose a logo',
    imagesFilter: 'Images',
    chooseSoundTitle: 'Choose a sound',
    audioFilter: 'Audio',
    removeSoundTitle: 'Delete sound',
    removeSoundConfirm: 'Delete the sound "{name}"?',
    remove: 'Delete',
    missedTitle: 'Missed reminders: {count}',
    missedMore: '…and {count} more',
    fatalTitle: 'Fatal error',
    fatalDetail: 'Your data was saved. Restart the app?',
    fatalRestart: 'Restart',
    fatalQuit: 'Quit',
    exportTitle: 'Export tasks',
    importTitle: 'Import tasks',
    importConfirm: 'Replace the current task list with the file contents?',
    importModeMessage: 'Replace the current task list or add tasks from the file?',
    importReplace: 'Replace',
    importMerge: 'Merge',
    cancel: 'Cancel'
  }
};

function currentTheme() {
  const theme = store ? store.getSettings().theme : 'peach';
  return THEMES.includes(theme) ? theme : 'peach';
}

function currentLanguage() {
  const language = store ? store.getSettings().language : 'ru';
  return LANGUAGES.includes(language) ? language : 'ru';
}

function tr(key, params) {
  const table = MAIN_STRINGS[currentLanguage()] || MAIN_STRINGS.ru;
  let value = table[key] || MAIN_STRINGS.ru[key] || key;
  if (params) {
    for (const name of Object.keys(params)) {
      value = value.replace(new RegExp(`\\{${name}\\}`, 'g'), String(params[name]));
    }
  }
  return value;
}

function debugLog(message) {
  if (!DEBUG) return;
  try {
    const file = path.join(app.getPath('userData'), 'pp-debug.log');
    try {
      if (fs.statSync(file).size > 256 * 1024) fs.renameSync(file, `${file}.old`);
    } catch (statErr) {
      // ignore missing file
    }
    fs.appendFileSync(file, `${new Date().toISOString()} ${message}\n`);
  } catch (err) {
    // ignore
  }
}

function captureWindow(win, filename) {
  if (!DEBUG || process.env.PP_SCREENSHOT !== '1' || !win || win.isDestroyed()) return;
  setTimeout(() => {
    if (!win || win.isDestroyed()) return;
    win.webContents.capturePage()
      .then((image) => {
        fs.writeFileSync(path.join(app.getPath('userData'), filename), image.toPNG());
        debugLog(`screenshot saved ${filename}`);
      })
      .catch((err) => debugLog(`screenshot failed ${filename}: ${err.message}`));
  }, 800);
}

let fatalHandled = false;
const rendererCrashes = new Map();

function shouldRecreateRenderer(tag) {
  const now = Date.now();
  const entry = rendererCrashes.get(tag) || { count: 0, at: now };
  if (now - entry.at > 60000) {
    entry.count = 0;
    entry.at = now;
  }
  entry.count += 1;
  rendererCrashes.set(tag, entry);
  return entry.count <= 3;
}

function handleFatal(err, source) {
  const message = err && err.stack ? err.stack : String(err);
  debugLog(`${source}: ${message}`);
  console.error(`[${source}]`, err);
  if (fatalHandled) return;
  fatalHandled = true;
  try {
    if (store) store.saveNow();
  } catch (saveErr) {
    debugLog(`fatal save failed: ${saveErr.message}`);
  }
  if (SMOKE || !app.isReady()) {
    setTimeout(() => app.exit(1), 50);
    return;
  }
  try {
    const choice = dialog.showMessageBoxSync({
      type: 'error',
      title: 'Go, Now!',
      message: tr('fatalTitle'),
      detail: tr('fatalDetail'),
      buttons: [tr('fatalRestart'), tr('fatalQuit')],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    });
    if (choice === 0) {
      app.relaunch();
      app.exit(0);
    } else {
      app.exit(1);
    }
  } catch (dialogErr) {
    debugLog(`fatal dialog failed: ${dialogErr.message}`);
    app.exit(1);
  }
}

process.on('uncaughtException', (err) => {
  handleFatal(err, 'uncaughtException');
});
process.on('unhandledRejection', (err) => {
  debugLog(`unhandledRejection: ${err && err.stack ? err.stack : err}`);
  console.error('[unhandledRejection]', err);
  try {
    if (store) store.saveNow();
  } catch (saveErr) {
    debugLog(`rejection save failed: ${saveErr.message}`);
  }
});

let store = null;
let widgetWin = null;
let quickWin = null;
let quickHotkeyRegistered = false;
let quickPendingShow = false;
let plannerWin = null;
let reminderWin = null;
let tray = null;
let quitting = false;
let widgetPinned = false;
let dragStartBounds = null;
let resizeStartBounds = null;
let widgetSize = null;
let pendingResizeSize = null;
let reminderBusyId = null;
let reminderHideTimer = null;
let bridgeServer = null;
let bridgeEndpointPath = null;
let hotkeyRegistered = false;
const reminderQueue = [];

if (process.platform === 'win32') app.setAppUserModelId('com.gonow.app');

const gotLock = NO_LOCK || app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  if (!NO_LOCK) app.on('second-instance', () => openPlanner());
  app.whenReady().then(init).catch((err) => {
    debugLog(`init failed: ${err && err.stack ? err.stack : err}`);
    setTimeout(() => app.exit(1), 50);
  });
}

app.on('window-all-closed', () => {
  if (platform.isLinux && !tray) {
    quitting = true;
    app.quit();
  }
});
app.on('activate', () => {
  if (store) openPlanner();
});
app.on('before-quit', () => {
  quitting = true;
  if (store) store.saveNow();
  stopBridge();
  try {
    globalShortcut.unregisterAll();
  } catch (err) {
    // ignore
  }
});

function isAppFileUrl(rawUrl) {
  try {
    const target = path.resolve(fileURLToPath(new URL(rawUrl)));
    const root = path.resolve(__dirname);
    const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
    if (process.platform === 'win32') {
      const lowerTarget = target.toLowerCase();
      return lowerTarget === root.toLowerCase() || lowerTarget.startsWith(prefix.toLowerCase());
    }
    return target === root || target.startsWith(prefix);
  } catch (err) {
    return false;
  }
}

function applySecurityPolicy() {
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (event, url) => {
      if (!isAppFileUrl(url)) event.preventDefault();
    });
    contents.on('will-redirect', (event, url) => {
      if (!isAppFileUrl(url)) event.preventDefault();
    });
    contents.on('will-attach-webview', (event) => {
      event.preventDefault();
    });
  });
  try {
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    if (typeof session.defaultSession.setDevicePermissionHandler === 'function') {
      session.defaultSession.setDevicePermissionHandler(() => false);
    }
  } catch (err) {
    debugLog(`security policy failed: ${err.message}`);
  }
}

function init() {
  debugLog(`init userData=${app.getPath('userData')}`);
  applySecurityPolicy();
  const storeLock = acquireStoreLock();
  try {
    backupStore();
    migrateUserData();
    store = new Store(app.getPath('userData'));
    debugLog('store ready');
    if (store.getSettings().hotkey === 'Shift+Q') {
      store.setSettings({ hotkey: DEFAULT_HOTKEY });
      debugLog('hotkey migrated to ' + DEFAULT_HOTKEY);
    }
    if (!['never', '30', '90'].includes(store.getSettings().autoCleanupDone)) {
      store.setSettings({ autoCleanupDone: 'never' });
    }
    const cleanupDays = Number(store.getSettings().autoCleanupDone);
    if (cleanupDays > 0) {
      const archived = store.archiveDone(cleanupDays);
      if (archived) debugLog(`auto archive moved ${archived} done tasks`);
    }
    try {
      const mcpPath = platform.stableMcpPath();
      debugLog(`mcp stable path ${mcpPath}`);
    } catch (err) {
      debugLog(`mcp stable path failed: ${err.message}`);
    }
    applyAutostart(store.getSettings().autostart !== false);
    debugLog('autostart applied');
    registerIpc();
    debugLog('ipc registered');
    startBridge();
  } finally {
    releaseStoreLock(storeLock);
  }
  createTray();
  debugLog('tray created');
  createApplicationMenu();
  if (!SMOKE) {
    const settings = store.getSettings();
    const applied = applyHotkeys(settings.hotkey ?? DEFAULT_HOTKEY, settings.quickHotkey ?? DEFAULT_QUICK_HOTKEY);
    debugLog(`hotkeys applied planner=${hotkeyRegistered} quick=${quickHotkeyRegistered} (${JSON.stringify(applied)})`);
  }
  createWidget();
  debugLog('widget created');
  if (SMOKE || store.getSettings().openPlannerOnStart !== false) {
    openPlanner();
    debugLog('planner created');
  } else {
    debugLog('planner not opened on start');
  }
  if (!SMOKE) {
    startWidgetWatchdog();
    const onDisplayChange = () => {
      ensureWidgetOnScreen();
      ensureWidgetPinned();
    };
    screen.on('display-metrics-changed', onDisplayChange);
    screen.on('display-added', onDisplayChange);
    screen.on('display-removed', onDisplayChange);
    powerMonitor.on('resume', ensureWidgetPinned);
  }
  if (SMOKE) {
    setTimeout(() => {
      console.log('SMOKE OK');
      app.exit(0);
    }, 6000);
    setTimeout(() => {
      console.error('SMOKE TIMEOUT');
      app.exit(1);
    }, 25000);
  } else {
    startReminderLoop();
    if (DEBUG && process.env.PP_CRASHTEST === '1') {
      setTimeout(() => {
        if (plannerWin && !plannerWin.isDestroyed()) {
          debugLog('crashtest: crashing planner renderer');
          plannerWin.webContents.forcefullyCrashRenderer();
        }
      }, 3000);
      setTimeout(() => {
        debugLog(`crashtest planner=${!!plannerWin} destroyed=${plannerWin ? plannerWin.isDestroyed() : 'null'}`);
      }, 6000);
    }
    if (DEBUG && process.env.PP_PINTEST === '1') {
      setTimeout(async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        try {
          await waitForWidgetLoad(widgetWin);
          await wait(600);
          debugLog(`pintest initial visible=${!!(widgetWin && widgetWin.isVisible())} pinned=${widgetPinned}`);
          hideWidget();
          await wait(300);
          debugLog(`pintest hidden visible=${!!(widgetWin && widgetWin.isVisible())} pinned=${widgetPinned}`);
          const hiddenUi = await plannerWin.webContents.executeJavaScript(`(() => {
            const button = document.getElementById('pinBtn');
            return { text: button.textContent.trim(), disabled: button.disabled, hint: document.getElementById('pinHint').textContent.trim() };
          })()`);
          debugLog(`pintest hidden ui=${JSON.stringify(hiddenUi)}`);
          const repinned = await pinWidget();
          await wait(300);
          debugLog(`pintest repin ok=${repinned} visible=${!!(widgetWin && widgetWin.isVisible())} pinned=${widgetPinned}`);
          const pinnedUi = await plannerWin.webContents.executeJavaScript(`(() => {
            const button = document.getElementById('pinBtn');
            return { text: button.textContent.trim(), disabled: button.disabled };
          })()`);
          debugLog(`pintest pinned ui=${JSON.stringify(pinnedUi)}`);
          if (widgetWin && !widgetWin.isDestroyed()) widgetWin.close();
          await wait(2200);
          debugLog(`pintest recreated exists=${!!widgetWin} visible=${!!(widgetWin && widgetWin.isVisible())} pinned=${widgetPinned}`);
          const recreated = await pinWidget();
          await wait(300);
          debugLog(`pintest repin2 ok=${recreated} visible=${!!(widgetWin && widgetWin.isVisible())} pinned=${widgetPinned}`);
        } catch (err) {
          debugLog(`pintest error: ${err.message}`);
        }
      }, 2500);
    }
    if (DEBUG && process.env.PP_QUICKTEST === '1') {
      setTimeout(() => {
        showQuickAdd();
        setTimeout(() => {
          if (quickWin && !quickWin.isDestroyed()) {
            quickWin.webContents.executeJavaScript(`(() => {
              const input = document.getElementById('quickInput');
              input.value = 'завтра 15:00 #работа ! тест быстрого добавления';
              input.dispatchEvent(new Event('input', { bubbles: true }));
            })()`).catch(() => {});
          }
        }, 900);
        setTimeout(() => captureWindow(quickWin, 'shot-quick.png'), 1500);
        setTimeout(() => {
          if (quickWin && !quickWin.isDestroyed()) {
            quickWin.webContents.executeJavaScript(`(() => {
              const input = document.getElementById('quickInput');
              input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            })()`).catch(() => {});
          }
        }, 2600);
        setTimeout(() => debugLog(`quicktest tasks=${store.listTasks().length}`), 3600);
      }, 1500);
    }
    if (DEBUG && process.env.PP_DATATEST === '1') {
      setTimeout(() => {
        try {
          const file = path.join(app.getPath('userData'), 'data-test.json');
          const before = store.listTasks().length;
          const exported = exportTasksTo(file);
          const imported = importTasksFrom(file);
          fs.unlinkSync(file);
          debugLog(`datatest before=${before} exported=${exported} imported=${imported.count} skipped=${imported.skipped}`);
        } catch (err) {
          debugLog(`datatest error: ${err.message}`);
        }
      }, 5000);
    }
  }
  const quitAfter = Number(process.env.PP_QUIT_AFTER || 0);
  if (quitAfter > 0) {
    setTimeout(() => {
      quitting = true;
      app.quit();
    }, quitAfter);
  }
}

function migrateUserData() {
  try {
    const oldFile = path.join(app.getPath('appData'), 'Pixel Planner', 'pixel-planner.json');
    const newFile = path.join(app.getPath('userData'), 'pixel-planner.json');
    if (oldFile !== newFile && fs.existsSync(oldFile) && !fs.existsSync(newFile)) {
      fs.mkdirSync(path.dirname(newFile), { recursive: true });
      fs.copyFileSync(oldFile, newFile);
      debugLog('userData migrated from Pixel Planner');
    }
  } catch (err) {
    debugLog(`userData migration failed: ${err.message}`);
  }
}

function createWidget() {
  if (widgetWin && !widgetWin.isDestroyed()) return;
  const { workArea } = screen.getPrimaryDisplay();
  const settings = store.getSettings();
  const saved = settings.widgetPos;
  const savedSize = settings.widgetSize;
  const baseX = saved ? Math.round(saved.x) : Math.round(workArea.x + workArea.width - WIDGET_WIDTH - 16);
  const baseY = saved ? Math.round(saved.y) : Math.round(workArea.y + 16);
  const desired = clampWidgetSize(
    savedSize && savedSize.width,
    savedSize && savedSize.height,
    baseX,
    baseY
  );
  const pos = clampWidgetPosition(baseX, baseY, desired.width, desired.height);
  const size = clampWidgetSize(desired.width, desired.height, pos.x, pos.y);
  widgetSize = { width: size.width, height: size.height };
  const x = pos.x;
  const y = pos.y;
  const width = size.width;
  const height = size.height;

  widgetWin = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: false,
    show: false,
    hasShadow: false,
    title: 'Go, Now! Widget',
    icon: path.join(__dirname, 'renderer', 'assets', 'icon-256.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  });

  if (platform.isMac) {
    widgetWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  }
  applyWidgetOnTop(store.getSettings().widgetAlwaysOnTop === true);

  widgetWin.loadFile(path.join(__dirname, 'renderer', 'widget.html'), { query: { theme: currentTheme() } })
    .then(() => debugLog('widget loadFile resolved'))
    .catch((err) => debugLog(`widget loadFile rejected: ${err.message}`));
  widgetWin.webContents.on('did-start-loading', () => debugLog('widget did-start-loading'));
  widgetWin.webContents.on('dom-ready', () => debugLog('widget dom-ready'));
  widgetWin.webContents.once('did-finish-load', () => {
    debugLog('widget did-finish-load');
    captureWindow(widgetWin, 'shot-widget.png');
    if (!SMOKE) {
      widgetWin.showInactive();
      refreshTrayMenu();
      broadcastWidgetState();
      if (platform.isWindows && process.env.PP_NOPIN !== '1') setTimeout(() => pinWidget(), 400);
    }
  });

  if (DEBUG && process.env.PP_DRAG === '1') {
    setTimeout(() => {
      if (!widgetWin || widgetWin.isDestroyed()) return;
      try {
        const before = widgetWin.getBounds();
        debugLog(`drag test before x=${before.x} y=${before.y}`);
        widgetWin.webContents.executeJavaScript(`(async () => {
          const handle = document.getElementById('dragHandle');
          handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, screenX: 200, screenY: 200 }));
          await new Promise((r) => setTimeout(r, 150));
          window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, screenX: 280, screenY: 260 }));
          await new Promise((r) => setTimeout(r, 150));
          window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, screenX: 280, screenY: 260 }));
        })()`).then(() => {
          setTimeout(() => {
            if (!widgetWin || widgetWin.isDestroyed()) return;
            const after = widgetWin.getBounds();
            debugLog(`drag test after x=${after.x} y=${after.y}`);
          }, 500);
        }).catch((err) => debugLog(`drag test failed: ${err.message}`));
      } catch (err) {
        debugLog(`drag test error: ${err.message}`);
      }
    }, 2500);
  }

  if (DEBUG && process.env.PP_RESIZE === '1') {
    setTimeout(() => {
      if (!widgetWin || widgetWin.isDestroyed()) return;
      try {
        const before = widgetWin.getBounds();
        debugLog(`resize test before w=${before.width} h=${before.height}`);
        widgetWin.webContents.executeJavaScript(`(async () => {
          const grip = document.getElementById('resizeGrip');
          grip.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 2, screenX: 300, screenY: 400 }));
          await new Promise((r) => setTimeout(r, 150));
          window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 2, screenX: 400, screenY: 480 }));
          await new Promise((r) => setTimeout(r, 150));
          window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 2, screenX: 400, screenY: 480 }));
        })()`).then(() => {
          setTimeout(() => {
            if (!widgetWin || widgetWin.isDestroyed()) return;
            const after = widgetWin.getBounds();
            debugLog(`resize test after w=${after.width} h=${after.height}`);
          }, 500);
        }).catch((err) => debugLog(`resize test failed: ${err.message}`));
      } catch (err) {
        debugLog(`resize test error: ${err.message}`);
      }
    }, 4500);
  }
  if (DEBUG && process.env.PP_PROBE) {
    const probeAt = Number(process.env.PP_PROBE);
    setTimeout(() => {
      if (!widgetWin || widgetWin.isDestroyed()) return;
      try {
        const b = widgetWin.getBounds();
        debugLog(`probe window bounds x=${b.x} y=${b.y} w=${b.width} h=${b.height} visible=${widgetWin.isVisible()} alwaysOnTop=${widgetWin.isAlwaysOnTop()} focused=${widgetWin.isFocused()}`);
      } catch (err) {
        debugLog(`probe window error: ${err.message}`);
      }
      widgetWin.webContents.executeJavaScript(`(() => {
        const at = (x, y) => {
          const el = document.elementFromPoint(x, y);
          return el ? (el.id ? '#' + el.id : el.tagName.toLowerCase()) : 'none';
        };
        const form = document.getElementById('addForm');
        const plus = document.getElementById('plusBtn');
        const plusRect = plus ? plus.getBoundingClientRect() : null;
        return JSON.stringify({
          addFormOpen: form ? !form.hidden : null,
          probes: { head: at(160, 30), list: at(160, 200), plus: at(30, 420), corner: at(318, 438) },
          plusRect: plusRect ? { x: plusRect.x, y: plusRect.y, w: plusRect.width, h: plusRect.height } : null
        });
      })()`).then((result) => debugLog(`probe result: ${result}`)).catch((err) => debugLog(`probe js error: ${err.message}`));
    }, Number.isFinite(probeAt) && probeAt > 0 ? probeAt : 5000);
  }

  if (DEBUG && process.env.PP_ADDTEST === '1') {
    setTimeout(async () => {
      if (!widgetWin || widgetWin.isDestroyed()) return;
      try {
        await widgetWin.webContents.executeJavaScript(`(async () => {
          document.getElementById('addForm').hidden = false;
          document.getElementById('noNotifyToggle').checked = true;
          document.getElementById('addInput').value = 'Тест без срока';
          document.getElementById('addForm').dispatchEvent(new Event('submit', { cancelable: true }));
          await new Promise((r) => setTimeout(r, 400));
        })()`);
        captureWindow(widgetWin, 'shot-widget-add.png');
        if (plannerWin && !plannerWin.isDestroyed()) captureWindow(plannerWin, 'shot-planner-add.png');
        const created = store.listTasks().filter((task) => task.title === 'Тест без срока');
        debugLog(`addtest created=${created.length} date=${created[0] && created[0].date} notify=${created[0] && created[0].notify} recurrence=${created[0] && created[0].recurrence}`);
        setTimeout(() => {
          for (const task of created) store.removeTask(task.id);
          broadcastChange();
          debugLog('addtest cleanup done');
        }, 4000);
      } catch (err) {
        debugLog(`addtest error: ${err.message}`);
      }
    }, 6000);
  }

  if (DEBUG && process.env.PP_UITEST === '1') {
    setTimeout(() => {
      if (!widgetWin || widgetWin.isDestroyed()) return;
      widgetWin.webContents.executeJavaScript(`(() => {
        document.getElementById('addForm').hidden = false;
        document.getElementById('whenRow').hidden = false;
      })()`).catch(() => {});
      setTimeout(() => captureWindow(widgetWin, 'shot-widget-ui.png'), 900);
      if (plannerWin && !plannerWin.isDestroyed()) {
        plannerWin.webContents.executeJavaScript(`(() => {
          const btn = document.querySelector('#dayList .edit-btn, #noDueList .edit-btn');
          if (btn) btn.click();
          document.documentElement.dataset.theme = 'mono';
        })()`).catch(() => {});
        setTimeout(() => captureWindow(plannerWin, 'shot-planner-edit.png'), 900);
      }
    }, 3000);
  }

  if (DEBUG && process.env.PP_HOTKEYTEST === '1') {
    setTimeout(async () => {
      if (!plannerWin || plannerWin.isDestroyed()) return;
      try {
        await plannerWin.webContents.executeJavaScript(`(() => {
          document.getElementById('settingsToggle').click();
          document.getElementById('hotkeyInput').click();
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'й', code: 'KeyQ', shiftKey: true, bubbles: true, cancelable: true }));
          return true;
        })()`);
        setTimeout(async () => {
          const value = await plannerWin.webContents.executeJavaScript(`(() => ({
            display: document.getElementById('hotkeyInput').value,
            capturing: document.getElementById('hotkeyInput').classList.contains('capturing'),
            hint: document.getElementById('hotkeyHint').textContent
          }))()`);
          debugLog(`hotkey field value: ${JSON.stringify(value)}`);
          if (process.env.PP_SCREENSHOT === '1') captureWindow(plannerWin, 'shot-hotkey.png');
        }, 900);
      } catch (err) {
        debugLog(`hotkey test error: ${err.message}`);
      }
    }, 3500);
  }

  if (DEBUG && process.env.PP_QUICKHOTKEYTEST === '1') {
    setTimeout(async () => {
      if (!plannerWin || plannerWin.isDestroyed()) return;
      const run = (script) => plannerWin.webContents.executeJavaScript(script);
      try {
        await run(`(() => {
          document.getElementById('settingsToggle').click();
          document.getElementById('quickHotkeyInput').scrollIntoView({ block: 'center' });
          document.getElementById('quickHotkeyInput').click();
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'u', code: 'KeyU', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
          return true;
        })()`);
        await new Promise((resolve) => setTimeout(resolve, 900));
        let info = await run(`(() => ({
          quick: document.getElementById('quickHotkeyInput').value,
          quickHint: document.getElementById('quickHotkeyHint').textContent,
          planner: document.getElementById('hotkeyInput').value
        }))()`);
        debugLog(`quickhotkey set: ${JSON.stringify(info)} store=${store.getSettings().quickHotkey}`);
        await run(`(() => {
          document.getElementById('hotkeyInput').click();
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'u', code: 'KeyU', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
          return true;
        })()`);
        await new Promise((resolve) => setTimeout(resolve, 900));
        info = await run(`(() => ({
          planner: document.getElementById('hotkeyInput').value,
          plannerHint: document.getElementById('hotkeyHint').textContent,
          quick: document.getElementById('quickHotkeyInput').value
        }))()`);
        debugLog(`quickhotkey duplicate: ${JSON.stringify(info)}`);
        await run(`document.getElementById('quickHotkeyReset').click()`);
        await new Promise((resolve) => setTimeout(resolve, 900));
        info = await run(`(() => ({
          quick: document.getElementById('quickHotkeyInput').value,
          quickHint: document.getElementById('quickHotkeyHint').textContent,
          planner: document.getElementById('hotkeyInput').value
        }))()`);
        debugLog(`quickhotkey reset: ${JSON.stringify(info)} store=${store.getSettings().quickHotkey}`);
        if (process.env.PP_SCREENSHOT === '1') captureWindow(plannerWin, 'shot-hotkeys.png');
      } catch (err) {
        debugLog(`quick hotkey test error: ${err.message}`);
      }
    }, 3500);
  }

  if (DEBUG && process.env.PP_HOTKEYTOGGLE === '1') {
    setTimeout(() => {
      if (!plannerWin || plannerWin.isDestroyed()) return;
      plannerWin.show();
      plannerWin.focus();
      setTimeout(() => {
        debugLog(`toggle before visible=${plannerWin.isVisible()} focused=${plannerWin.isFocused()}`);
        togglePlanner();
        setTimeout(() => {
          debugLog(`toggle after first visible=${plannerWin.isVisible()}`);
          togglePlanner();
          setTimeout(() => debugLog(`toggle after second visible=${plannerWin.isVisible()}`), 700);
        }, 700);
      }, 600);
    }, 3000);
  }

  if (DEBUG && process.env.PP_HOTKEYVIEW === '1') {
    setTimeout(async () => {
      if (!plannerWin || plannerWin.isDestroyed()) return;
      try {
        plannerWin.show();
        plannerWin.focus();
        await plannerWin.webContents.executeJavaScript(`(() => {
          document.getElementById('settingsToggle').click();
          document.getElementById('hotkeyInput').scrollIntoView({ block: 'center' });
          document.getElementById('hotkeyInput').click();
        })()`);
      } catch (err) {
        debugLog(`hotkey view error: ${err.message}`);
      }
    }, 3200);
  }

  if (DEBUG && process.env.PP_PICKERHOLD) {
    const holdMode = process.env.PP_PICKERHOLD;
    setTimeout(async () => {
      try {
        if (holdMode === 'widget') {
          if (!widgetWin || widgetWin.isDestroyed()) return;
          widgetWin.showInactive();
          widgetWin.moveTop();
          await widgetWin.webContents.executeJavaScript(`(() => {
            document.getElementById('addForm').hidden = false;
            document.getElementById('whenRow').hidden = false;
            document.getElementById('addDate').click();
          })()`);
        } else if (!plannerWin || plannerWin.isDestroyed()) {
          return;
        } else if (holdMode === 'time') {
          await plannerWin.webContents.executeJavaScript(`document.getElementById('timeInput').click()`);
        } else {
          await plannerWin.webContents.executeJavaScript(`document.getElementById('dateInput').click()`);
        }
        debugLog(`picker hold open ${holdMode}`);
        if (process.env.PP_SCREENSHOT === '1') {
          const target = holdMode === 'widget' ? widgetWin : plannerWin;
          setTimeout(() => captureWindow(target, 'shot-picker-hold.png'), 2000);
        }
      } catch (err) {
        debugLog(`picker hold error: ${err.message}`);
      }
    }, 4000);
  }

  if (DEBUG && process.env.PP_PICKERTEST === '1') {
    setTimeout(async () => {
      if (!plannerWin || plannerWin.isDestroyed()) return;
      try {
        await plannerWin.webContents.executeJavaScript(`document.getElementById('dateInput').click()`);
        setTimeout(async () => {
          const info = await plannerWin.webContents.executeJavaScript(`(() => {
            const popup = document.querySelector('.picker-popup');
            if (!popup) return 'NO POPUP';
            const r = popup.getBoundingClientRect();
            const cs = getComputedStyle(popup);
            const input = document.getElementById('dateInput');
            const ir = input.getBoundingClientRect();
            const hit = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2));
            return JSON.stringify({
              rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
              style: [popup.style.left, popup.style.top],
              inputRect: [Math.round(ir.x), Math.round(ir.y), Math.round(ir.width), Math.round(ir.height)],
              win: [window.innerWidth, window.innerHeight],
              hit: hit ? hit.className : null,
              z: cs.zIndex, pos: cs.position, display: cs.display, opacity: cs.opacity,
              visibility: cs.visibility, bg: cs.backgroundColor,
              bodyOverflow: getComputedStyle(document.body).overflow,
              htmlTransform: getComputedStyle(document.documentElement).transform,
              bodyTransform: getComputedStyle(document.body).transform
            });
          })()`).catch((err) => `diag failed: ${err.message}`);
          debugLog(`picker diag: ${info}`);
        }, 900);
        setTimeout(() => captureWindow(plannerWin, 'shot-picker-date.png'), 600);
        setTimeout(async () => {
          const value = await plannerWin.webContents.executeJavaScript(`(() => {
            const day = document.querySelector('.pp-day.today');
            if (day) day.click();
            return {
              display: document.getElementById('dateInput').value,
              iso: ppPicker.get(document.getElementById('dateInput'))
            };
          })()`);
          debugLog(`picker date value: ${JSON.stringify(value)}`);
        }, 1300);
        setTimeout(async () => {
          await plannerWin.webContents.executeJavaScript(`document.getElementById('timeInput').click()`);
          setTimeout(() => captureWindow(plannerWin, 'shot-picker-time.png'), 600);
        }, 1800);
        setTimeout(() => {
          if (widgetWin && !widgetWin.isDestroyed()) {
            widgetWin.webContents.executeJavaScript(`(() => {
              document.getElementById('addForm').hidden = false;
              document.getElementById('whenRow').hidden = false;
              document.getElementById('addDate').click();
            })()`).catch(() => {});
            setTimeout(() => captureWindow(widgetWin, 'shot-picker-widget.png'), 600);
          }
          if (plannerWin && !plannerWin.isDestroyed()) plannerWin.webContents.executeJavaScript('ppPicker.close()').catch(() => {});
        }, 3400);
      } catch (err) {
        debugLog(`picker test error: ${err.message}`);
      }
    }, 3500);
  }

  if (DEBUG && process.env.PP_NOTETEST === '1') {
    setTimeout(async () => {
      if (!plannerWin || plannerWin.isDestroyed()) return;
      try {
        const info = await plannerWin.webContents.executeJavaScript(`(() => {
          const el = document.getElementById('noteInput');
          const before = el.offsetHeight;
          document.getElementById('titleInput').value = 'Проверь счёт по Юкэ';
          el.value = 'Длинная заметка. '.repeat(30);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return { before, after: el.offsetHeight, len: el.value.length, max: el.maxLength };
        })()`);
        debugLog(`note test: ${JSON.stringify(info)}`);
        setTimeout(() => captureWindow(plannerWin, 'shot-note.png'), 700);
      } catch (err) {
        debugLog(`note test error: ${err.message}`);
      }
    }, 3500);
  }

  if (DEBUG && process.env.PP_MAXTEST === '1') {
    setTimeout(async () => {
      if (!plannerWin || plannerWin.isDestroyed()) return;
      try {
        await plannerWin.webContents.executeJavaScript(`document.getElementById('btnMax').click()`);
        setTimeout(async () => {
          debugLog(`maximized after click: ${plannerWin.isMaximized()}`);
          await plannerWin.webContents.executeJavaScript(`document.getElementById('btnMax').click()`);
          setTimeout(() => debugLog(`maximized after second click: ${plannerWin.isMaximized()}`), 600);
        }, 700);
      } catch (err) {
        debugLog(`max test error: ${err.message}`);
      }
    }, 3300);
  }

  if (DEBUG && process.env.PP_MCPTEST === '1') {
    setTimeout(async () => {
      if (!plannerWin || plannerWin.isDestroyed()) return;
      try {
        await plannerWin.webContents.executeJavaScript(`(() => {
          document.getElementById('settingsToggle').click();
          document.getElementById('mcpBtn').click();
          return true;
        })()`);
        setTimeout(async () => {
          const result = await plannerWin.webContents.executeJavaScript(`(async () => {
            const head = document.querySelector('.mcp-client-head');
            if (head) head.click();
            const body = document.querySelector('.mcp-client-body:not([hidden])');
            const code = body ? body.querySelector('.mcp-code') : null;
            const copy = body ? body.querySelector('.mcp-copy') : null;
            if (copy) copy.click();
            await new Promise((resolve) => setTimeout(resolve, 300));
            return {
              visible: !document.getElementById('mcpOverlay').hidden,
              clients: document.querySelectorAll('.mcp-client').length,
              code: code ? code.textContent : null,
              copied: body ? !body.querySelector('.mcp-copied').hidden : false
            };
          })()`);
          debugLog(`mcp test: ${JSON.stringify(result)}`);
          if (process.env.PP_SCREENSHOT === '1') captureWindow(plannerWin, 'shot-mcp.png');
        }, 900);
      } catch (err) {
        debugLog(`mcp test error: ${err.message}`);
      }
    }, 3500);
  }

  if (DEBUG && process.env.PP_REMINDER === '1') {
    setTimeout(() => {
      const now = new Date();
      const pad = (value) => String(value).padStart(2, '0');
      showReminder({
        id: 'debug-reminder',
        title: 'Проверка напоминания',
        date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
        time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
        note: 'Пример заметки с ссылкой https://example.com',
        recurrence: 'none'
      });
      setTimeout(() => {
        if (reminderWin && !reminderWin.isDestroyed()) captureWindow(reminderWin, 'shot-reminder-late.png');
      }, 2200);
    }, 3500);
  }

  if (DEBUG && process.env.PP_REMINDERTEST === '1') {
    setTimeout(async () => {
      const now = new Date();
      const pad = (value) => String(value).padStart(2, '0');
      const fake = {
        id: 'debug-reminder-test',
        title: 'Проверка отложенного напоминания',
        date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
        time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
        note: '',
        recurrence: 'none'
      };
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const clickSnooze = () => {
        if (!reminderWin || reminderWin.isDestroyed()) return Promise.resolve();
        return reminderWin.webContents.executeJavaScript("document.getElementById('btnSnooze').click()");
      };
      try {
        showReminder(fake);
        await wait(1200);
        await clickSnooze();
        await wait(800);
        debugLog(`remindertest after first snooze visible=${reminderWin ? reminderWin.isVisible() : 'none'}`);
        showReminder(fake);
        await wait(900);
        await clickSnooze();
        await wait(800);
        debugLog(`remindertest after same-id snooze visible=${reminderWin ? reminderWin.isVisible() : 'none'}`);
      } catch (err) {
        debugLog(`remindertest error: ${err.message}`);
      } finally {
        if (reminderWin && reminderWin.isVisible()) handleReminderAction('snooze');
      }
    }, 3500);
  }

  if (DEBUG && process.env.PP_SHOT_AT) {
    const shotAt = Number(process.env.PP_SHOT_AT);
    if (Number.isFinite(shotAt) && shotAt > 0) {
      setTimeout(() => {
        if (widgetWin && !widgetWin.isDestroyed()) captureWindow(widgetWin, 'shot-widget-2.png');
      }, shotAt);
    }
  }

  if (DEBUG) {
    setTimeout(() => {
      try {
        debugLog(`widget state url=${widgetWin.webContents.getURL()} loading=${widgetWin.webContents.isLoading()} crashed=${widgetWin.webContents.isCrashed()} visible=${widgetWin.isVisible()}`);
      } catch (err) {
        debugLog(`widget state error: ${err.message}`);
      }
    }, 4000);
  }
  widgetWin.on('closed', () => {
    widgetWin = null;
    widgetPinned = false;
    refreshTrayMenu();
    broadcastWidgetState();
    if (!quitting && !SMOKE) {
      debugLog('widget closed unexpectedly, recreating');
      setTimeout(() => {
        if (!quitting && !widgetWin) createWidget();
      }, 1500);
    }
  });
  widgetWin.on('show', () => {
    refreshTrayMenu();
    broadcastWidgetState();
  });
  widgetWin.on('hide', () => {
    refreshTrayMenu();
    broadcastWidgetState();
  });
  logConsole(widgetWin, 'widget');
}

function openPlanner() {
  if (plannerWin) {
    if (!SMOKE) {
      plannerWin.show();
      plannerWin.focus();
    }
    return;
  }
  plannerWin = new BrowserWindow({
    width: 1020,
    height: 740,
    minWidth: 900,
    minHeight: 620,
    frame: false,
    backgroundColor: THEME_BG[currentTheme()],
    show: false,
    title: 'Go, Now!',
    icon: path.join(__dirname, 'renderer', 'assets', 'icon-256.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  });
  plannerWin.loadFile(path.join(__dirname, 'renderer', 'planner.html'), { query: { theme: currentTheme() } })
    .then(() => debugLog('planner loadFile resolved'))
    .catch((err) => debugLog(`planner loadFile rejected: ${err.message}`));
  plannerWin.webContents.on('did-start-loading', () => debugLog('planner did-start-loading'));
  plannerWin.webContents.on('dom-ready', () => debugLog('planner dom-ready'));
  plannerWin.webContents.once('did-finish-load', () => {
    debugLog('planner did-finish-load');
    captureWindow(plannerWin, 'shot-planner.png');
    if (!SMOKE) plannerWin.show();
    if (DEBUG && process.env.PP_SETTINGS === '1') {
      setTimeout(() => {
        if (plannerWin && !plannerWin.isDestroyed()) {
          plannerWin.webContents.executeJavaScript("document.getElementById('settingsToggle').click()");
        }
      }, 700);
    }
    if (DEBUG && process.env.PP_SOUNDTEST === '1') {
      setTimeout(async () => {
        if (!plannerWin || plannerWin.isDestroyed()) return;
        const original = store.getSettings().notificationSound;
        const originalTagSounds = { ...(store.getSettings().notificationTagSounds || {}) };
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const run = (script) => plannerWin.webContents.executeJavaScript(script);
        try {
          await run(`(() => {
            document.getElementById('settingsToggle').click();
            document.getElementById('soundSelectBtn').scrollIntoView({ block: 'center' });
            return true;
          })()`);
          await wait(800);
          for (const id of ['soft', 'pixel', 'bell', 'pulse', 'chime', 'click']) {
            await run(`(() => {
              document.getElementById('soundSelectBtn').click();
              const choice = document.querySelector('.pp-choice[data-value="${id}"]');
              if (choice) choice.click();
              return true;
            })()`);
            await wait(500);
            debugLog(`soundtest ${id} store=${store.getSettings().notificationSound}`);
          }
          const custom = customSoundList();
          if (custom.length) {
            await run(`(() => {
              document.getElementById('soundSelectBtn').click();
              const choice = Array.from(document.querySelectorAll('.pp-choice')).find((button) => button.dataset.value.startsWith('custom-'));
              if (choice) choice.click();
              return true;
            })()`);
            await wait(900);
            debugLog(`soundtest custom store=${store.getSettings().notificationSound}`);
          }
          const active = await run(`document.getElementById('soundSelectLabel').textContent.trim()`);
          debugLog(`soundtest active=${active}`);
          const volumeChecks = [];
          for (const value of [0, 50, 100]) {
            const state = await run(`(() => {
              const input = document.getElementById('soundVolume');
              input.value = '${value}';
              input.dispatchEvent(new Event('input', { bubbles: true }));
              return {
                value: input.value,
                label: document.getElementById('soundVolumeValue').textContent,
                fill: input.style.getPropertyValue('--sound-volume')
              };
            })()`);
            volumeChecks.push(state);
          }
          debugLog(`soundtest volume=${JSON.stringify(volumeChecks)}`);
          const tags = [...new Set(store.listTasks().flatMap((task) => task.tags || []))];
          const tagKey = tags.length
            ? `tag:${String(tags[0]).trim().toLowerCase().replace(/\s+/g, ' ')}`
            : 'important';
          await run(`document.getElementById('tagSoundSave').scrollIntoView({ block: 'center' })`);
          await wait(300);
          await run(`(() => {
            document.getElementById('tagSoundTagBtn').click();
            const tagChoice = document.querySelector('.pp-choice[data-value=${JSON.stringify(tagKey)}]');
            if (tagChoice) tagChoice.click();
            document.getElementById('tagSoundSoundBtn').click();
            const soundChoice = document.querySelector('.pp-choice[data-value="pulse"]');
            if (soundChoice) soundChoice.click();
            document.getElementById('tagSoundSave').click();
            return true;
          })()`);
          await wait(800);
          debugLog(`soundtest tag=${tagKey} store=${JSON.stringify(store.getSettings().notificationTagSounds)}`);
          const tagRows = await run(`document.querySelectorAll('.tag-sound-item').length`);
          debugLog(`soundtest tagrows=${tagRows}`);
          if (process.env.PP_SCREENSHOT === '1') {
            await run(`document.getElementById('soundSelectBtn').scrollIntoView({ block: 'center' })`);
            await wait(900);
            captureWindow(plannerWin, 'shot-sound.png');
            await wait(1000);
            await run(`document.getElementById('tagSoundSave').scrollIntoView({ block: 'center' })`);
            await wait(300);
            captureWindow(plannerWin, 'shot-tag-sound.png');
            await wait(1000);
            await run(`document.getElementById('soundSelectBtn').click()`);
            await wait(300);
            captureWindow(plannerWin, 'shot-sound-menu.png');
            await wait(1200);
            await run(`window.ppPicker.close()`);
          }
          await wait(300);
          await run(`(() => {
            const remove = document.querySelector('.tag-sound-remove');
            if (remove) remove.click();
            return true;
          })()`);
          await wait(500);
          debugLog(`soundtest tagremoved=${JSON.stringify(store.getSettings().notificationTagSounds)}`);
          await wait(1000);
        } catch (err) {
          debugLog(`sound test error: ${err.message}`);
        } finally {
          store.setSettings({ notificationSound: original, notificationTagSounds: originalTagSounds });
        }
      }, 3500);
    }
    if (DEBUG && process.env.PP_VOLUMETEST === '1') {
      setTimeout(async () => {
        if (!plannerWin || plannerWin.isDestroyed()) return;
        const original = store.getSettings().notificationVolume;
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const run = (script) => plannerWin.webContents.executeJavaScript(script);
        try {
          await run(`(() => {
            document.getElementById('settingsToggle').click();
            document.getElementById('soundVolume').scrollIntoView({ block: 'center' });
            return true;
          })()`);
          await wait(800);
          const rect = await run(`(() => {
            const box = document.getElementById('soundVolume').getBoundingClientRect();
            return { x: box.x, y: box.y, width: box.width, height: box.height };
          })()`);
          const clickAt = async (ratio) => {
            const x = Math.round(rect.x + rect.width * ratio);
            const y = Math.round(rect.y + rect.height / 2);
            plannerWin.webContents.sendInputEvent({ type: 'mouseMove', x, y });
            plannerWin.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
            plannerWin.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
            await wait(250);
            return run(`(() => ({
              value: document.getElementById('soundVolume').value,
              label: document.getElementById('soundVolumeValue').textContent,
              fill: document.getElementById('soundVolume').style.getPropertyValue('--sound-volume')
            }))()`);
          };
          debugLog(`volumetest max=${JSON.stringify(await clickAt(1))}`);
          debugLog(`volumetest min=${JSON.stringify(await clickAt(0))}`);
        } catch (err) {
          debugLog(`volumetest error: ${err.message}`);
        } finally {
          store.setSettings({ notificationVolume: original });
        }
      }, 3000);
    }
    if (DEBUG && process.env.PP_SEARCHTEST === '1') {
      setTimeout(() => {
        if (!plannerWin || plannerWin.isDestroyed()) return;
        plannerWin.webContents.executeJavaScript(`(() => {
          const input = document.getElementById('searchInput');
          input.value = 'дом';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        })()`).catch(() => {});
      }, 900);
      setTimeout(() => captureWindow(plannerWin, 'shot-search.png'), 1800);
    }
    if (DEBUG && process.env.PP_UNDOTEST === '1') {
      setTimeout(() => {
        if (!plannerWin || plannerWin.isDestroyed()) return;
        plannerWin.webContents.executeJavaScript(`(() => {
          const btn = document.querySelector('#dayList .del-btn, #noDueList .del-btn');
          if (btn) btn.click();
          return !!btn;
        })()`).then((clicked) => debugLog(`undotest delete clicked=${clicked}`)).catch(() => {});
      }, 900);
      setTimeout(() => captureWindow(plannerWin, 'shot-undo.png'), 1500);
      setTimeout(() => {
        if (!plannerWin || plannerWin.isDestroyed()) return;
        plannerWin.webContents.executeJavaScript(`(() => {
          const undo = document.getElementById('toastUndo');
          const visible = !document.getElementById('toast').hidden;
          if (undo && !undo.hidden) undo.click();
          return { toastVisible: visible };
        })()`).then((result) => debugLog(`undotest ${JSON.stringify(result)}`)).catch(() => {});
      }, 2800);
      setTimeout(() => debugLog(`undotest tasks=${store.listTasks().length}`), 4000);
    }
    if (DEBUG && process.env.PP_STATSTEST === '1') {
      setTimeout(() => {
        if (!plannerWin || plannerWin.isDestroyed()) return;
        plannerWin.webContents.executeJavaScript("document.getElementById('statsToggle').click()").catch(() => {});
      }, 800);
      setTimeout(() => captureWindow(plannerWin, 'shot-stats.png'), 1600);
    }
    if (DEBUG && process.env.PP_TAGTEST === '1') {
      setTimeout(() => {
        if (!plannerWin || plannerWin.isDestroyed()) return;
        plannerWin.webContents.executeJavaScript(`(() => {
          document.getElementById('tagsInput').value = 'работа, дом';
          document.getElementById('tagsToggle').click();
        })()`).catch(() => {});
      }, 900);
      setTimeout(() => captureWindow(plannerWin, 'shot-tags.png'), 1700);
      setTimeout(() => {
        if (!plannerWin || plannerWin.isDestroyed()) return;
        plannerWin.webContents.executeJavaScript(`(() => {
          const toggle = document.getElementById('tagsToggle');
          toggle.click();
          return toggle.getAttribute('aria-expanded');
        })()`).then((value) => debugLog(`tagtest closed expanded=${value}`)).catch(() => {});
      }, 2800);
      setTimeout(() => {
        if (!plannerWin || plannerWin.isDestroyed()) return;
        plannerWin.webContents.executeJavaScript(`(() => {
          const btn = document.querySelector('.pp-tag-del');
          if (btn) btn.click();
          return { rows: document.querySelectorAll('.pp-tag-row').length };
        })()`).then((value) => debugLog(`tagtest delete ${JSON.stringify(value)}`)).catch(() => {});
      }, 2300);
      setTimeout(() => debugLog(`tagtest hidden=${JSON.stringify(store.getSettings().hiddenTags || [])}`), 2600);
    }
    if (DEBUG && process.env.PP_REPEATTEST === '1') {
      setTimeout(() => {
        if (!plannerWin || plannerWin.isDestroyed()) return;
        plannerWin.webContents.executeJavaScript("document.getElementById('repeatBtn').click()").catch(() => {});
      }, 900);
      setTimeout(() => captureWindow(plannerWin, 'shot-repeat.png'), 1200);
      setTimeout(() => {
        if (!plannerWin || plannerWin.isDestroyed()) return;
        plannerWin.webContents.executeJavaScript(`(() => {
          const choice = document.querySelector('.pp-choice[data-value="weekly"]');
          if (choice) choice.click();
          return {
            value: document.getElementById('repeatInput').value,
            label: document.getElementById('repeatBtn').textContent
          };
        })()`).then((value) => debugLog(`repeattest ${JSON.stringify(value)}`)).catch(() => {});
      }, 2300);
    }
    if (DEBUG && process.env.PP_PLATFORMTEST === '1') {
      setTimeout(() => {
        if (!plannerWin || plannerWin.isDestroyed()) return;
        plannerWin.webContents.executeJavaScript(`(() => ({
          platform: navigator.platform,
          pinHidden: document.getElementById('pinBtn').hidden,
          onTopHidden: document.getElementById('widgetOnTopLine').hidden,
          onTopChecked: document.getElementById('widgetOnTopToggle').checked
        }))()`).then((value) => debugLog(`platformtest ${JSON.stringify(value)}`)).catch(() => {});
      }, 1200);
    }
    const langTarget = process.env.PP_LANG;
    if (DEBUG && (langTarget === 'ru' || langTarget === 'en')) {
      setTimeout(() => {
        if (plannerWin && !plannerWin.isDestroyed()) {
          plannerWin.webContents.executeJavaScript(`document.querySelector('.lang-card[data-language="${langTarget}"]').click()`);
        }
      }, 400);
    }
  });
  if (DEBUG) {
    setTimeout(() => {
      try {
        debugLog(`planner state url=${plannerWin.webContents.getURL()} loading=${plannerWin.webContents.isLoading()} crashed=${plannerWin.webContents.isCrashed()}`);
      } catch (err) {
        debugLog(`planner state error: ${err.message}`);
      }
    }, 4500);
  }
  plannerWin.on('maximize', () => {
    if (plannerWin && !plannerWin.isDestroyed()) plannerWin.webContents.send('planner:maximized', true);
  });
  plannerWin.on('unmaximize', () => {
    if (plannerWin && !plannerWin.isDestroyed()) plannerWin.webContents.send('planner:maximized', false);
  });
  plannerWin.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      plannerWin.hide();
    }
  });
  plannerWin.on('closed', () => {
    plannerWin = null;
  });
  logConsole(plannerWin, 'planner');
}

function createQuickWindow() {
  if (quickWin && !quickWin.isDestroyed()) return;
  quickWin = new BrowserWindow({
    width: QUICK_WIDTH,
    height: QUICK_HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  });
  quickWin.loadFile(path.join(__dirname, 'renderer', 'quick.html'), { query: { theme: currentTheme() } })
    .then(() => debugLog('quick loadFile resolved'))
    .catch((err) => debugLog(`quick loadFile rejected: ${err.message}`));
  quickWin.setAlwaysOnTop(true, 'pop-up-menu');
  quickWin.webContents.once('did-finish-load', () => {
    if (quickPendingShow) {
      quickPendingShow = false;
      showQuickAdd();
    }
  });
  quickWin.on('blur', () => {
    if (quickWin && !quickWin.isDestroyed()) quickWin.hide();
  });
  quickWin.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      quickWin.hide();
    }
  });
  quickWin.on('closed', () => {
    quickWin = null;
  });
  logConsole(quickWin, 'quick');
}

function positionQuickWindow() {
  if (!quickWin || quickWin.isDestroyed()) return;
  const point = screen.getCursorScreenPoint();
  const { workArea } = screen.getDisplayNearestPoint(point);
  const x = Math.round(workArea.x + (workArea.width - QUICK_WIDTH) / 2);
  const y = Math.round(workArea.y + workArea.height * 0.2);
  quickWin.setBounds({ x, y, width: QUICK_WIDTH, height: QUICK_HEIGHT });
}

function showQuickAdd() {
  if (SMOKE) return;
  if (!quickWin || quickWin.isDestroyed()) {
    quickPendingShow = true;
    createQuickWindow();
    return;
  }
  positionQuickWindow();
  quickWin.show();
  quickWin.focus();
  quickWin.webContents.send('quick:show');
}

function hideQuickAdd() {
  if (quickWin && !quickWin.isDestroyed()) quickWin.hide();
}

function bridgeFilePath() {
  return path.join(app.getPath('userData'), 'bridge.json');
}

function storeLockPath() {
  return path.join(app.getPath('userData'), 'store.lock');
}

function backupStore() {
  try {
    const file = path.join(app.getPath('userData'), 'pixel-planner.json');
    if (!fs.existsSync(file)) return;
    const raw = fs.readFileSync(file, 'utf8');
    try {
      JSON.parse(raw);
    } catch (err) {
      debugLog(`store backup skipped, file is corrupt: ${err.message}`);
      return;
    }
    fs.copyFileSync(file, `${file}.bak`);
    const dir = path.join(app.getPath('userData'), 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const daily = path.join(dir, `pixel-planner-${localDateString()}.json`);
    if (!fs.existsSync(daily)) fs.copyFileSync(file, daily);
    pruneBackups(dir);
  } catch (err) {
    debugLog(`store backup failed: ${err.message}`);
  }
}

function pruneBackups(dir) {
  try {
    const files = fs.readdirSync(dir)
      .filter((name) => /^pixel-planner-\d{4}-\d{2}-\d{2}\.json$/.test(name))
      .sort();
    while (files.length > 7) {
      fs.unlinkSync(path.join(dir, files.shift()));
    }
  } catch (err) {
    debugLog(`backup prune failed: ${err.message}`);
  }
}

function sleepSync(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch (err) {
    // ignore
  }
}

function acquireStoreLock(timeoutMs = 2000) {
  const lockPath = storeLockPath();
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

let bridgeLogCount = 0;

function logBridge(line) {
  try {
    const file = path.join(app.getPath('userData'), 'bridge.log');
    bridgeLogCount += 1;
    if (bridgeLogCount % 100 === 0) {
      try {
        if (fs.statSync(file).size > 256 * 1024) fs.renameSync(file, `${file}.old`);
      } catch (err) {
        // ignore
      }
    }
    fs.appendFileSync(file, `${new Date().toISOString()} ${line}\n`, 'utf8');
  } catch (err) {
    // ignore
  }
}

function bridgeEndpoint() {
  if (process.platform === 'win32') {
    const hash = crypto.createHash('sha256').update(app.getPath('userData')).digest('hex').slice(0, 16);
    return `\\\\.\\pipe\\gonow-${hash}`;
  }
  const socketPath = path.join(app.getPath('userData'), 'gonow.sock');
  if (Buffer.byteLength(socketPath) <= 100) return socketPath;
  const hash = crypto.createHash('sha256').update(app.getPath('userData')).digest('hex').slice(0, 16);
  return path.join(app.getPath('temp'), `gonow-${hash}.sock`);
}

function startBridge() {
  if (SMOKE) return;
  try {
    const token = crypto.randomBytes(16).toString('hex');
    bridgeEndpointPath = bridgeEndpoint();
    if (process.platform !== 'win32') {
      try {
        fs.unlinkSync(bridgeEndpointPath);
      } catch (err) {
        // ignore stale socket
      }
    }
    bridgeServer = net.createServer((socket) => handleBridgeConnection(socket, token));
    bridgeServer.on('error', (err) => {
      debugLog(`bridge error: ${err.message}`);
      logBridge(`error ${err.message}`);
    });
    bridgeServer.listen(bridgeEndpointPath, () => {
      if (process.platform !== 'win32') {
        try {
          fs.chmodSync(bridgeEndpointPath, 0o600);
        } catch (err) {
          debugLog(`bridge chmod failed: ${err.message}`);
        }
      }
      fs.writeFileSync(
        bridgeFilePath(),
        JSON.stringify({ transport: 'pipe', path: bridgeEndpointPath, token, pid: process.pid }),
        { encoding: 'utf8', mode: 0o600 }
      );
      debugLog(`bridge listening on ${bridgeEndpointPath}`);
      logBridge(`listening on ${bridgeEndpointPath}`);
    });
  } catch (err) {
    debugLog(`bridge start failed: ${err.message}`);
    logBridge(`start failed: ${err.message}`);
  }
}

function stopBridge() {
  try {
    if (bridgeServer) bridgeServer.close();
  } catch (err) {
    // ignore
  }
  bridgeServer = null;
  if (process.platform !== 'win32' && bridgeEndpointPath) {
    try {
      fs.unlinkSync(bridgeEndpointPath);
    } catch (err) {
      // ignore
    }
  }
  bridgeEndpointPath = null;
  logBridge('stopped');
  try {
    fs.unlinkSync(bridgeFilePath());
  } catch (err) {
    // ignore
  }
}

function routeBridgeRequest(method, rawPath, body) {
  let url;
  try {
    url = new URL(rawPath, 'http://local');
  } catch (err) {
    return { status: 400, body: { error: 'bad url' } };
  }
  const parts = url.pathname.split('/').filter(Boolean);

  if (parts[0] === 'health' && parts.length === 1 && method === 'GET') {
    return {
      status: 200,
      body: {
        ok: true,
        pid: process.pid,
        version: app.getVersion(),
        uptime: Math.round(process.uptime()),
        tasks: store.listTasks().length
      }
    };
  }

  if (parts[0] === 'tasks' && parts.length === 1 && method === 'GET') {
    const date = url.searchParams.get('date');
    const archivedOnly = url.searchParams.get('archived') === '1';
    const includeArchived = url.searchParams.get('include_archived') === '1';
    const all = archivedOnly ? store.listArchived() : store.listTasks({ includeArchived });
    return { status: 200, body: { tasks: date ? all.filter((task) => task.date === date) : all } };
  }

  if (parts[0] === 'tasks' && parts[1] === 'archived' && parts.length === 2 && method === 'GET') {
    return { status: 200, body: { tasks: store.listArchived() } };
  }

  if (parts[0] === 'tasks' && parts[1] === 'archived' && parts.length === 2 && method === 'DELETE') {
    const olderThan = Number(url.searchParams.get('older_than') || 0);
    const removed = store.purgeArchived(olderThan);
    if (removed) broadcastChange();
    return { status: 200, body: { removed } };
  }

  if (parts[0] === 'tasks' && parts[1] === 'archive-done' && parts.length === 2 && method === 'POST') {
    const days = body && body.days != null ? Number(body.days) : 0;
    const archived = store.archiveDone(days);
    if (archived) broadcastChange();
    return { status: 200, body: { archived } };
  }

  if (parts[0] === 'tasks' && parts.length === 1 && method === 'POST') {
    try {
      const task = store.addTask(body || {});
      broadcastChange();
      setTimeout(scanReminders, 200);
      return { status: 200, body: { task } };
    } catch (err) {
      return { status: 400, body: { error: err.message } };
    }
  }

  if (parts[0] === 'tasks' && parts[1] === 'bulk' && parts.length === 2 && method === 'POST') {
    const items = body && Array.isArray(body.tasks) ? body.tasks : [];
    if (!items.length) return { status: 400, body: { error: 'tasks required' } };
    try {
      const tasks = items.map((item) => store.addTask(item || {}));
      broadcastChange();
      setTimeout(scanReminders, 200);
      return { status: 200, body: { tasks } };
    } catch (err) {
      return { status: 400, body: { error: err.message } };
    }
  }

  if (parts[0] === 'tasks' && parts.length === 3 && (parts[2] === 'archive' || parts[2] === 'unarchive') && method === 'POST') {
    const id = decodeURIComponent(parts[1]);
    if (!store.getTask(id)) return { status: 404, body: { error: 'not found' } };
    const task = parts[2] === 'archive' ? store.archiveTask(id) : store.unarchiveTask(id);
    broadcastChange();
    return { status: 200, body: { task } };
  }

  if (parts[0] === 'tasks' && parts.length === 3 && parts[2] === 'snooze' && method === 'POST') {
    const id = decodeURIComponent(parts[1]);
    const task = store.getTask(id);
    if (!task) return { status: 404, body: { error: 'not found' } };
    const requested = body && body.minutes != null ? Number(body.minutes) : 10;
    const minutes = Number.isFinite(requested) ? Math.min(1440, Math.max(1, Math.round(requested))) : 10;
    store.snooze(id, minutes * 60 * 1000);
    broadcastChange();
    return { status: 200, body: { task } };
  }

  if (parts[0] === 'tasks' && parts.length === 2) {
    const id = decodeURIComponent(parts[1]);
    if (method === 'GET') {
      const task = store.getTask(id);
      return task ? { status: 200, body: { task } } : { status: 404, body: { error: 'not found' } };
    }
    if (method === 'PATCH') {
      if (body && body.archived !== undefined) {
        if (!store.getTask(id)) return { status: 404, body: { error: 'not found' } };
        if (body.archived) store.archiveTask(id);
        else store.unarchiveTask(id);
      }
      let task = store.updateTask(id, body || {});
      if (!task) return { status: 404, body: { error: 'not found' } };
      if (body && body.done !== undefined) task = store.setDone(id, !!body.done) || task;
      broadcastChange();
      setTimeout(scanReminders, 200);
      return { status: 200, body: { task } };
    }
    if (method === 'DELETE') {
      if (!store.getTask(id)) return { status: 404, body: { error: 'not found' } };
      store.removeTask(id);
      broadcastChange();
      return { status: 200, body: { ok: true } };
    }
  }

  return { status: 404, body: { error: 'not found' } };
}

function handleBridgeConnection(socket, token) {
  socket.setEncoding('utf8');
  socket.setTimeout(30000, () => socket.destroy());
  let buffer = '';
  socket.on('data', (chunk) => {
    buffer += chunk;
    if (buffer.length > 1e6) {
      socket.destroy();
      return;
    }
    let index = buffer.indexOf('\n');
    while (index !== -1) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line) {
        const startedAt = Date.now();
        let message = null;
        try {
          message = JSON.parse(line);
        } catch (err) {
          message = null;
        }
        let result;
        if (!message || message.token !== token) {
          result = { status: 401, body: { error: 'unauthorized' } };
        } else {
          const method = String(message.method || 'GET').toUpperCase();
          const requestPath = String(message.path || '/');
          result = routeBridgeRequest(method, requestPath, message.body);
          logBridge(`${method} ${requestPath} ${result.status} ${Date.now() - startedAt}ms`);
        }
        const response = {
          id: message && message.id != null ? message.id : null,
          status: result.status,
          body: result.body
        };
        try {
          socket.write(`${JSON.stringify(response)}\n`);
        } catch (err) {
          // ignore closed socket
        }
      }
      index = buffer.indexOf('\n');
    }
  });
  socket.on('error', () => {
    // ignore
  });
}

function exportTasksTo(filePath) {
  const payload = buildExport(store.listTasks({ includeArchived: true }), { schemaVersion: Store.SCHEMA_VERSION });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return payload.tasks.length;
}

function snapshotStore(reason) {
  try {
    const dir = path.join(app.getPath('userData'), 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(dir, `pre-${reason}-${stamp}.json`);
    fs.writeFileSync(file, JSON.stringify(store.data, null, 2), 'utf8');
    return file;
  } catch (err) {
    debugLog(`snapshot ${reason} failed: ${err.message}`);
    return null;
  }
}

function importTasksFrom(filePath, mode = 'replace') {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = parseImport(raw);
  snapshotStore('import');
  const count = mode === 'merge' ? store.mergeTasks(parsed.tasks) : store.replaceTasks(parsed.tasks);
  store.saveNow();
  broadcastChange();
  return { count, mode, skipped: parsed.skipped, meta: parsed.meta };
}

function showPlannerDialog(method, options) {
  if (plannerWin && !plannerWin.isDestroyed()) return dialog[method](plannerWin, options);
  return dialog[method](options);
}

function togglePlanner() {
  if (SMOKE) return;
  if (!plannerWin || plannerWin.isDestroyed()) {
    openPlanner();
    return;
  }
  if (plannerWin.isVisible() && plannerWin.isFocused()) {
    plannerWin.hide();
    return;
  }
  openPlanner();
}

function registerHotkey(accel, handler) {
  if (!accel) return true;
  try {
    return globalShortcut.register(accel, handler);
  } catch (err) {
    debugLog(`hotkey error ${accel}: ${err.message}`);
    return false;
  }
}

function applyHotkeys(plannerAccel, quickAccel) {
  try {
    globalShortcut.unregisterAll();
  } catch (err) {
    // ignore
  }
  hotkeyRegistered = registerHotkey(plannerAccel, () => togglePlanner());
  quickHotkeyRegistered = registerHotkey(quickAccel, () => showQuickAdd());
  debugLog(`hotkeys planner=${plannerAccel || 'none'} registered=${hotkeyRegistered} quick=${quickAccel || 'none'} registered=${quickHotkeyRegistered}`);
  return { planner: hotkeyRegistered, quick: quickHotkeyRegistered };
}

function setHotkeySetting(kind, accel) {
  if (kind !== 'planner' && kind !== 'quick') return { ok: false, reason: 'invalid' };
  const normalized = normalizeAccelerator(accel);
  if (normalized === null) return { ok: false, reason: 'invalid' };

  const settings = store.getSettings();
  const previousPlanner = settings.hotkey ?? DEFAULT_HOTKEY;
  const previousQuick = settings.quickHotkey ?? DEFAULT_QUICK_HOTKEY;
  const nextPlanner = kind === 'planner' ? normalized : previousPlanner;
  const nextQuick = kind === 'quick' ? normalized : previousQuick;

  if (nextPlanner && nextQuick && sameAccelerator(nextPlanner, nextQuick, process.platform)) {
    return { ok: false, reason: 'duplicate' };
  }

  const applied = applyHotkeys(nextPlanner, nextQuick);
  if (!applied[kind]) {
    applyHotkeys(previousPlanner, previousQuick);
    return { ok: false, reason: 'taken' };
  }

  store.setSettings(kind === 'planner' ? { hotkey: normalized } : { quickHotkey: normalized });
  refreshTrayMenu();
  return { ok: true, plannerRegistered: applied.planner, quickRegistered: applied.quick };
}

function resetHotkeySetting(kind) {
  if (kind === 'planner') return setHotkeySetting('planner', DEFAULT_HOTKEY);
  if (kind === 'quick') return setHotkeySetting('quick', DEFAULT_QUICK_HOTKEY);
  return { ok: false, reason: 'invalid' };
}

function ensureWidgetOnScreen() {
  if (!widgetWin || widgetWin.isDestroyed()) return;
  try {
    const bounds = widgetWin.getBounds();
    const size = clampWidgetSize(bounds.width, bounds.height, bounds.x, bounds.y);
    const pos = clampWidgetPosition(bounds.x, bounds.y, size.width, size.height);
    if (pos.x === bounds.x && pos.y === bounds.y && size.width === bounds.width && size.height === bounds.height) {
      return;
    }
    widgetSize = { width: size.width, height: size.height };
    widgetWin.setBounds({ x: pos.x, y: pos.y, width: size.width, height: size.height });
    store.setSettings({ widgetPos: { x: pos.x, y: pos.y, width: size.width, height: size.height }, widgetSize });
    debugLog(`widget re-clamped to ${pos.x},${pos.y} ${size.width}x${size.height}`);
  } catch (err) {
    debugLog(`widget re-clamp failed: ${err.message}`);
  }
}

let pinCheckBusy = false;

function ensureWidgetPinned() {
  if (pinCheckBusy || !widgetWin || widgetWin.isDestroyed() || quitting) return;
  pinCheckBusy = true;
  isPinnedToDesktop(widgetWin)
    .then((pinned) => {
      if (!pinned && widgetWin && !widgetWin.isDestroyed() && !quitting) {
        debugLog('watchdog: widget lost pin, re-pinning');
        return pinWidget();
      }
      return null;
    })
    .catch(() => {})
    .finally(() => {
      pinCheckBusy = false;
    });
}

function startWidgetWatchdog() {
  if (SMOKE || process.platform !== 'win32') return;
  const intervalMs = Number(process.env.PP_WATCHDOG_MS || 300000);
  setInterval(ensureWidgetPinned, intervalMs);
}

async function pinWidget() {
  if (SMOKE || process.platform !== 'win32') {
    debugLog(`pin skipped smoke=${SMOKE} platform=${process.platform}`);
    return false;
  }
  const win = ensureWidgetWindow();
  if (!win) return false;
  debugLog(`pin start backend=${pinBackend()}`);
  await waitForWidgetLoad(win);
  if (!widgetWin || widgetWin.isDestroyed()) return false;
  if (!widgetWin.isVisible()) widgetWin.showInactive();
  const ok = await pinToDesktop(widgetWin);
  debugLog(`pin result=${ok}`);
  widgetPinned = ok;
  if (ok) console.log('[pin] widget pinned to desktop');
  else console.warn('[pin] widget stays as a regular window');
  refreshTrayMenu();
  broadcastWidgetState();
  return ok;
}

function ensureWidgetWindow() {
  if (widgetWin && !widgetWin.isDestroyed()) return widgetWin;
  if (SMOKE) return null;
  createWidget();
  return widgetWin && !widgetWin.isDestroyed() ? widgetWin : null;
}

function waitForWidgetLoad(win) {
  if (!win || win.isDestroyed() || !win.webContents.isLoading()) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, 5000);
    win.webContents.once('did-finish-load', finish);
    win.webContents.once('did-fail-load', finish);
  });
}

async function showWidget() {
  const win = ensureWidgetWindow();
  if (!win) return false;
  await waitForWidgetLoad(win);
  if (!win || win.isDestroyed()) return false;
  if (win.isMinimized()) win.restore();
  win.showInactive();
  refreshTrayMenu();
  broadcastWidgetState();
  return true;
}

function hideWidget() {
  if (!widgetWin || widgetWin.isDestroyed()) return;
  widgetWin.hide();
  refreshTrayMenu();
  broadcastWidgetState();
}

function applyWidgetOnTop(enabled) {
  if (!widgetWin || widgetWin.isDestroyed() || platform.isWindows) return;
  if (platform.isMac) {
    widgetWin.setAlwaysOnTop(!!enabled, 'floating');
  } else {
    widgetWin.setAlwaysOnTop(!!enabled);
  }
}

function createApplicationMenu() {
  if (!platform.isMac) return;
  const menu = Menu.buildFromTemplate([
    { role: 'appMenu' },
    { role: 'editMenu' },
    { role: 'windowMenu' }
  ]);
  Menu.setApplicationMenu(menu);
}

function createTray() {
  try {
    const icon = nativeImage.createFromPath(platform.trayIconPath());
    if (platform.isMac) icon.setTemplateImage(true);
    tray = new Tray(icon);
    tray.setToolTip('Go, Now!');
    if (!platform.isMac) tray.on('click', () => openPlanner());
    refreshTrayMenu();
  } catch (err) {
    console.error('[tray] failed:', err.message);
  }
}

function refreshTrayMenu() {
  if (!tray) return;
  const settings = store.getSettings();
  const quickValue = settings.quickHotkey ?? DEFAULT_QUICK_HOTKEY;
  const quickLabel = quickValue
    ? `${tr('quickAdd')}  ·  ${displayAccelerator(quickValue, process.platform)}`
    : tr('quickAdd');
  const menu = Menu.buildFromTemplate([
    { label: tr('openPlanner'), click: () => openPlanner() },
    { label: quickLabel, click: () => showQuickAdd() },
    {
      label: widgetWin && widgetWin.isVisible() ? tr('hideWidget') : tr('showWidget'),
      click: () => {
        if (widgetWin && !widgetWin.isDestroyed() && widgetWin.isVisible()) hideWidget();
        else showWidget();
      }
    },
    ...(platform.isWindows ? [{
      label: widgetPinned ? tr('pinned') : tr('pin'),
      enabled: !widgetPinned,
      click: () => {
        pinWidget();
      }
    }] : []),
    { type: 'separator' },
    {
      label: tr('autostart'),
      type: 'checkbox',
      checked: settings.autostart !== false,
      click: (item) => {
        store.setSettings({ autostart: item.checked });
        applyAutostart(item.checked);
      }
    },
    { type: 'separator' },
    {
      label: tr('quit'),
      click: () => {
        quitting = true;
        store.saveNow();
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(menu);
}

function applyAutostart(enabled) {
  platform.applyAutostart(enabled);
}

function startReminderLoop() {
  setTimeout(scanReminders, 3000);
  setTimeout(showMissedDigest, 6000);
  setInterval(scanReminders, 20000);
  powerMonitor.on('resume', () => {
    debugLog('power resume: rescan reminders');
    scanReminders();
    showMissedDigest();
  });
  powerMonitor.on('unlock-screen', () => {
    debugLog('unlock-screen: rescan reminders');
    scanReminders();
  });
}

function showMissedDigest() {
  if (!store) return;
  const missed = store.missedTasks(Date.now(), 7);
  if (!missed.length) return;
  if (typeof Notification === 'undefined' || !Notification.isSupported()) return;
  for (const task of missed) store.markNotified(task.id);
  store.saveNow();
  const titles = missed.slice(0, 3).map((task) => task.title);
  const body = missed.length > 3
    ? `${titles.join(', ')} ${tr('missedMore', { count: missed.length - 3 })}`
    : titles.join(', ');
  try {
    new Notification({
      title: tr('missedTitle', { count: missed.length }),
      body,
      silent: true
    }).show();
  } catch (err) {
    debugLog(`missed digest failed: ${err.message}`);
  }
}

function scanReminders() {
  if (!store || reminderBusyId) return;
  for (const task of store.dueTasks()) {
    if (task.id !== reminderBusyId && !reminderQueue.includes(task.id)) {
      reminderQueue.push(task.id);
    }
  }
  processReminderQueue();
}

function processReminderQueue() {
  if (reminderBusyId) return;
  while (reminderQueue.length) {
    const id = reminderQueue.shift();
    const task = store.getTask(id);
    if (!task || task.done) continue;
    store.markNotified(id);
    showReminder(task);
    return;
  }
}

function showReminder(task) {
  const availableSounds = new Set(BUILTIN_SOUND_IDS);
  for (const item of customSoundList()) {
    if (item.available) availableSounds.add(item.id);
  }
  task = { ...task, soundId: resolveTaskSound(task, store.getSettings(), availableSounds) };
  debugLog(`showReminder id=${task.id} title=${task.title} sound=${task.soundId}`);
  reminderBusyId = task.id;
  if (!reminderWin) {
    const { workArea } = screen.getPrimaryDisplay();
    reminderWin = new BrowserWindow({
      width: 320,
      height: 230,
      x: workArea.x + workArea.width - 344,
      y: workArea.y + workArea.height - 254,
      frame: false,
      transparent: true,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      hasShadow: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false
      }
    });
    reminderWin.setAlwaysOnTop(true, 'screen-saver');
    reminderWin.loadFile(path.join(__dirname, 'renderer', 'reminder.html'), { query: { theme: currentTheme() } });
    reminderWin.on('closed', () => {
      reminderWin = null;
    });
    if (DEBUG) {
      reminderWin.webContents.on('dom-ready', () => {
        reminderWin.webContents.executeJavaScript("document.documentElement.dataset.theme || 'none'")
          .then((theme) => debugLog(`reminder dom-ready theme=${theme}`))
          .catch(() => {});
      });
    }
    logConsole(reminderWin, 'reminder');
    reminderWin.webContents.once('did-finish-load', () => {
      debugLog('reminder did-finish-load');
      captureWindow(reminderWin, 'shot-reminder.png');
      if (!SMOKE) reminderWin.showInactive();
      reminderWin.webContents.send('reminder:show', task);
    });
  } else {
    if (reminderWin.webContents.isLoading()) {
      if (!SMOKE) reminderWin.showInactive();
      reminderWin.webContents.once('did-finish-load', () => {
        reminderWin.webContents.send('reminder:show', task);
      });
    } else {
      reminderWin.webContents.send('reminder:show', task);
      if (!SMOKE) reminderWin.showInactive();
    }
  }
  if (reminderHideTimer) clearTimeout(reminderHideTimer);
  reminderHideTimer = setTimeout(() => handleReminderAction('snooze'), 61000);
}

function handleReminderAction(action) {
  debugLog(`reminder action=${action} id=${reminderBusyId}`);
  const id = reminderBusyId;
  const task = id ? store.getTask(id) : null;
  if (task && action === 'done') store.setDone(task.id, true);
  if (task && action === 'snooze') store.snooze(task.id, 10 * 60 * 1000);
  reminderBusyId = null;
  if (reminderHideTimer) {
    clearTimeout(reminderHideTimer);
    reminderHideTimer = null;
  }
  if (reminderWin) reminderWin.hide();
  broadcastChange();
  setTimeout(processReminderQueue, 600);
}

let broadcastTimer = null;

function broadcastChange() {
  syncReminderWithStore();
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    for (const win of [widgetWin, plannerWin]) {
      if (win && !win.isDestroyed()) win.webContents.send('tasks:changed');
    }
  }, 50);
}

function broadcastTheme(theme) {
  for (const win of [widgetWin, plannerWin, reminderWin, quickWin]) {
    if (win && !win.isDestroyed()) win.webContents.send('theme:changed', theme);
  }
}

function broadcastLanguage(language) {
  for (const win of [widgetWin, plannerWin, reminderWin, quickWin]) {
    if (win && !win.isDestroyed()) win.webContents.send('language:changed', language);
  }
}

function broadcastWidgetState() {
  if (!plannerWin || plannerWin.isDestroyed()) return;
  plannerWin.webContents.send('widget:state', {
    pinned: widgetPinned,
    visible: !!(widgetWin && !widgetWin.isDestroyed() && widgetWin.isVisible())
  });
}

function customLogoPath() {
  const name = store.getSettings().customLogo;
  if (!name) return null;
  const file = path.join(app.getPath('userData'), name);
  return fs.existsSync(file) ? file : null;
}

function customLogoDataUrl() {
  const file = customLogoPath();
  if (!file) return null;
  try {
    return `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
  } catch (err) {
    debugLog(`logo read failed: ${err.message}`);
    return null;
  }
}

function normalizeSoundVolume(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_SOUND_VOLUME;
  return Math.min(100, Math.max(0, Math.round(number)));
}

function validCustomSoundFile(file) {
  return typeof file === 'string' && /^custom-[a-z0-9-]+\.(mp3|wav|ogg|m4a)$/i.test(file);
}

function customSoundPath(file) {
  return validCustomSoundFile(file) ? path.join(app.getPath('userData'), file) : null;
}

function customSoundAvailable(file) {
  const target = customSoundPath(file);
  if (!target) return false;
  try {
    const stat = fs.statSync(target);
    return stat.isFile() && stat.size > 0 && stat.size <= SOUND_MAX_BYTES;
  } catch (err) {
    return false;
  }
}

function customSoundList() {
  const list = store.getSettings().customSounds;
  if (!Array.isArray(list)) return [];
  return list.map((item) => ({
    id: item.id,
    name: item.name,
    file: item.file,
    available: customSoundAvailable(item.file)
  }));
}

function customSoundById(id) {
  return customSoundList().find((item) => item.id === id) || null;
}

function soundPayload() {
  const settings = store.getSettings();
  const custom = customSoundList();
  const requested = settings.notificationSound;
  const builtin = BUILTIN_SOUND_IDS.has(requested);
  const selected = custom.find((item) => item.id === requested);
  const missing = !builtin && (!selected || !selected.available);
  return {
    value: builtin ? requested : selected && selected.available ? selected.id : 'soft',
    selected: requested,
    volume: normalizeSoundVolume(settings.notificationVolume),
    custom: custom.map(({ id, name, available }) => ({ id, name, available })),
    maxCustom: MAX_CUSTOM_SOUNDS,
    selectedCustom: selected ? selected.id : null,
    tagSounds: settings.notificationTagSounds && typeof settings.notificationTagSounds === 'object'
      ? { ...settings.notificationTagSounds }
      : {},
    missing
  };
}

function normalizeTagSoundKey(value) {
  if (value === 'important') return value;
  if (typeof value !== 'string' || !value.startsWith('tag:')) return null;
  const tag = value.slice(4).trim().toLowerCase().replace(/\s+/g, ' ');
  return tag ? `tag:${tag.slice(0, 24)}` : null;
}

function readCustomSoundData(id) {
  const item = id ? customSoundById(id) : customSoundById(store.getSettings().notificationSound);
  if (!item) return { error: 'custom' };
  const target = customSoundPath(item.file);
  if (!target) return { error: 'missing' };
  try {
    const stat = fs.statSync(target);
    if (!stat.isFile() || stat.size <= 0) return { error: 'read' };
    if (stat.size > SOUND_MAX_BYTES) return { error: 'size' };
    const mime = SOUND_TYPES.get(path.extname(target).toLowerCase()) || 'application/octet-stream';
    return { dataUrl: `data:${mime};base64,${fs.readFileSync(target).toString('base64')}` };
  } catch (err) {
    debugLog(`sound read failed: ${err.message}`);
    return { error: 'read' };
  }
}

function uniqueSoundName(list, proposed) {
  const base = String(proposed || '').trim().replace(/\s+/g, ' ').slice(0, 40) || 'Свой звук';
  let name = base;
  let index = 2;
  while (list.some((item) => item.name === name)) {
    const suffix = ` ${index}`;
    name = `${base.slice(0, Math.max(1, 40 - suffix.length))}${suffix}`;
    index += 1;
  }
  return name;
}

function syncReminderWithStore() {
  if (!reminderBusyId) return;
  const task = store.getTask(reminderBusyId);
  if (task && !task.done) return;
  debugLog(`reminder closed because task is ${task ? 'done' : 'gone'}`);
  reminderBusyId = null;
  if (reminderHideTimer) {
    clearTimeout(reminderHideTimer);
    reminderHideTimer = null;
  }
  if (reminderWin) reminderWin.hide();
  setTimeout(processReminderQueue, 400);
}

function registerIpc() {
  ipcMain.handle('tasks:list', () => store.listTasks());

  ipcMain.handle('tasks:list-archived', () => store.listArchived());

  ipcMain.handle('tasks:archive', (_event, id) => {
    const task = store.archiveTask(id);
    if (task) broadcastChange();
    return task;
  });

  ipcMain.handle('tasks:unarchive', (_event, id) => {
    const task = store.unarchiveTask(id);
    if (task) broadcastChange();
    return task;
  });

  ipcMain.handle('tasks:archive-done', (_event, days) => {
    const archived = store.archiveDone(days);
    if (archived) broadcastChange();
    return archived;
  });

  ipcMain.handle('tasks:purge-archived', (_event, days) => {
    const removed = store.purgeArchived(days);
    if (removed) broadcastChange();
    return removed;
  });

  ipcMain.handle('tasks:add', (_event, payload) => {
    const task = store.addTask(payload || {});
    broadcastChange();
    setTimeout(scanReminders, 200);
    return task;
  });

  ipcMain.handle('tasks:restore', (_event, snapshot) => {
    const task = store.restoreTask(snapshot);
    if (task) {
      broadcastChange();
      setTimeout(scanReminders, 200);
    }
    return task;
  });

  ipcMain.handle('tasks:update', (_event, { id, patch }) => {
    const task = store.updateTask(id, patch || {});
    broadcastChange();
    if (!SMOKE) setTimeout(scanReminders, 200);
    return task;
  });

  ipcMain.handle('tasks:toggle', (_event, { id, done }) => {
    store.setDone(id, done);
    broadcastChange();
    return store.listTasks();
  });

  ipcMain.handle('tasks:delete', (_event, id) => {
    store.removeTask(id);
    broadcastChange();
    return store.listTasks();
  });

  ipcMain.handle('planner:open', () => {
    openPlanner();
  });

  ipcMain.handle('planner:minimize', () => {
    if (plannerWin) plannerWin.minimize();
  });

  ipcMain.handle('planner:hide', () => {
    if (plannerWin) plannerWin.hide();
  });

  ipcMain.handle('quick:hide', () => {
    hideQuickAdd();
  });

  ipcMain.handle('planner:maximize-toggle', () => {
    if (!plannerWin || plannerWin.isDestroyed()) return false;
    if (plannerWin.isMaximized()) plannerWin.unmaximize();
    else plannerWin.maximize();
    return plannerWin.isMaximized();
  });

  ipcMain.handle('app:info', () => ({
    autostart: store.getSettings().autostart !== false,
    pinned: widgetPinned,
    widgetVisible: !!(widgetWin && !widgetWin.isDestroyed() && widgetWin.isVisible()),
    packaged: app.isPackaged,
    openPlannerOnStart: store.getSettings().openPlannerOnStart !== false,
    platform: process.platform,
    canPin: platform.isWindows,
    widgetAlwaysOnTop: store.getSettings().widgetAlwaysOnTop === true,
    version: app.getVersion()
  }));

  ipcMain.handle('mcp:info', () => {
    const mcpPath = platform.stableMcpPath();
    const exePath = platform.executablePath();
    return {
      packaged: app.isPackaged,
      exePath,
      mcpPath,
      mcpExists: fs.existsSync(mcpPath),
      platform: process.platform
    };
  });

  ipcMain.handle('clipboard:write', (_event, text) => {
    clipboard.writeText(String(text));
    return true;
  });

  ipcMain.handle('startup:set', (_event, enabled) => {
    store.setSettings({ openPlannerOnStart: !!enabled });
    return !!enabled;
  });

  ipcMain.handle('autostart:set', (_event, enabled) => {
    store.setSettings({ autostart: !!enabled });
    applyAutostart(!!enabled);
    refreshTrayMenu();
    return true;
  });

  ipcMain.handle('theme:get', () => currentTheme());

  ipcMain.handle('theme:set', (_event, theme) => {
    if (!THEMES.includes(theme)) return currentTheme();
    store.setSettings({ theme });
    broadcastTheme(theme);
    if (plannerWin) plannerWin.setBackgroundColor(THEME_BG[theme]);
    return theme;
  });

  ipcMain.handle('language:get', () => currentLanguage());

  ipcMain.handle('language:set', (_event, language) => {
    if (!LANGUAGES.includes(language)) return currentLanguage();
    store.setSettings({ language });
    broadcastLanguage(language);
    refreshTrayMenu();
    return language;
  });

  ipcMain.handle('logo:get', () => customLogoDataUrl());

  ipcMain.handle('logo:choose', async () => {
    const options = {
      title: tr('chooseLogoTitle'),
      properties: ['openFile'],
      filters: [{ name: tr('imagesFilter'), extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    };
    const result = plannerWin
      ? await dialog.showOpenDialog(plannerWin, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths.length) return null;
    try {
      const image = nativeImage.createFromPath(result.filePaths[0]);
      if (image.isEmpty()) return { error: 'read' };
      const { width, height } = image.getSize();
      let targetHeight = 120;
      let targetWidth = Math.round(width * (targetHeight / height));
      if (targetWidth > 480) {
        targetWidth = 480;
        targetHeight = Math.max(1, Math.round(height * (480 / width)));
      }
      const resized = image.resize({ width: targetWidth, height: targetHeight, quality: 'best' });
      const fileName = 'custom-logo.png';
      const dest = path.join(app.getPath('userData'), fileName);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, resized.toPNG());
      const previous = store.getSettings().customLogo;
      if (previous && previous !== fileName) {
        try {
          fs.unlinkSync(path.join(app.getPath('userData'), previous));
        } catch (err) {
          // ignore
        }
      }
      store.setSettings({ customLogo: fileName });
      return customLogoDataUrl();
    } catch (err) {
      debugLog(`logo choose failed: ${err.message}`);
      return { error: 'save' };
    }
  });

  ipcMain.handle('logo:reset', () => {
    const previous = store.getSettings().customLogo;
    if (previous) {
      try {
        fs.unlinkSync(path.join(app.getPath('userData'), previous));
      } catch (err) {
        // ignore
      }
    }
    store.setSettings({ customLogo: null });
    return null;
  });

  ipcMain.handle('sound:get', () => soundPayload());

  ipcMain.handle('sound:data', (_event, id) => readCustomSoundData(id));

  ipcMain.handle('sound:set', (_event, id) => {
    if (typeof id !== 'string') return { ok: false, reason: 'invalid' };
    if (BUILTIN_SOUND_IDS.has(id)) {
      store.setSettings({ notificationSound: id });
      return { ok: true, ...soundPayload() };
    }
    const item = customSoundById(id);
    if (!item) return { ok: false, reason: 'invalid' };
    if (!item.available) return { ok: false, reason: 'custom-missing' };
    store.setSettings({ notificationSound: id });
    return { ok: true, ...soundPayload() };
  });

  ipcMain.handle('sound:set-volume', (_event, value) => {
    store.setSettings({ notificationVolume: normalizeSoundVolume(value) });
    return { ok: true, ...soundPayload() };
  });

  ipcMain.handle('sound:set-tag', (_event, payload) => {
    const data = payload && typeof payload === 'object' ? payload : {};
    const key = normalizeTagSoundKey(data.key);
    if (!key) return { ok: false, reason: 'invalid-key' };
    const current = {
      ...(store.getSettings().notificationTagSounds && typeof store.getSettings().notificationTagSounds === 'object'
        ? store.getSettings().notificationTagSounds
        : {})
    };
    const sound = typeof data.sound === 'string' ? data.sound.trim() : '';
    if (!sound) {
      delete current[key];
    } else {
      const custom = customSoundById(sound);
      if (!BUILTIN_SOUND_IDS.has(sound) && (!custom || !custom.available)) {
        return { ok: false, reason: custom ? 'custom-missing' : 'invalid-sound' };
      }
      current[key] = sound;
    }
    store.setSettings({ notificationTagSounds: current });
    return { ok: true, ...soundPayload() };
  });

  ipcMain.handle('sound:choose', async () => {
    const options = {
      title: tr('chooseSoundTitle'),
      properties: ['openFile'],
      filters: [{ name: tr('audioFilter'), extensions: ['mp3', 'wav', 'ogg', 'm4a'] }]
    };
    const result = plannerWin
      ? await dialog.showOpenDialog(plannerWin, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths.length) return null;
    const source = result.filePaths[0];
    const extension = path.extname(source).toLowerCase();
    if (!SOUND_TYPES.has(extension)) return { error: 'type' };
    try {
      const stat = fs.statSync(source);
      if (!stat.isFile() || stat.size <= 0) return { error: 'read' };
      if (stat.size > SOUND_MAX_BYTES) return { error: 'size' };
      const suggestedName = path.basename(source, path.extname(source)).trim().slice(0, 40) || 'Свой звук';
      return { source, suggestedName };
    } catch (err) {
      debugLog(`sound choose failed: ${err.message}`);
      return { error: 'read' };
    }
  });

  ipcMain.handle('sound:add', async (_event, payload) => {
    const data = payload && typeof payload === 'object' ? payload : {};
    const source = typeof data.source === 'string' ? data.source : '';
    if (!source) return { error: 'read' };
    const extension = path.extname(source).toLowerCase();
    if (!SOUND_TYPES.has(extension)) return { error: 'type' };
    const current = customSoundList();
    if (current.length >= MAX_CUSTOM_SOUNDS) return { error: 'limit' };
    let dest = null;
    try {
      const stat = fs.statSync(source);
      if (!stat.isFile() || stat.size <= 0) return { error: 'read' };
      if (stat.size > SOUND_MAX_BYTES) return { error: 'size' };
      const id = `custom-${crypto.randomUUID()}`;
      const fileName = `${id}${extension}`;
      dest = path.join(app.getPath('userData'), fileName);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(source, dest);
      const name = uniqueSoundName(current, data.name);
      const next = [...(store.getSettings().customSounds || []), { id, name, file: fileName }];
      store.setSettings({ customSounds: next, notificationSound: id });
      return { ok: true, ...soundPayload() };
    } catch (err) {
      if (dest) {
        try {
          fs.unlinkSync(dest);
        } catch (cleanupErr) {
          // ignore
        }
      }
      debugLog(`sound add failed: ${err.message}`);
      return { error: 'save' };
    }
  });

  ipcMain.handle('sound:remove', async (_event, id) => {
    const item = customSoundById(id);
    if (!item) return { ok: false, reason: 'invalid' };
    const confirmOptions = {
      type: 'question',
      title: tr('removeSoundTitle'),
      message: tr('removeSoundConfirm', { name: item.name }),
      buttons: [tr('remove'), tr('cancel')],
      defaultId: 1,
      cancelId: 1
    };
    const confirm = plannerWin
      ? await dialog.showMessageBox(plannerWin, confirmOptions)
      : await dialog.showMessageBox(confirmOptions);
    if (confirm.response !== 0) return { canceled: true };
    const target = customSoundPath(item.file);
    if (target) {
      try {
        fs.unlinkSync(target);
      } catch (err) {
        // ignore
      }
    }
    const next = (store.getSettings().customSounds || []).filter((entry) => entry.id !== id);
    const selected = store.getSettings().notificationSound === id;
    store.setSettings({ customSounds: next, ...(selected ? { notificationSound: 'soft' } : {}) });
    return { ok: true, ...soundPayload() };
  });

  ipcMain.handle('widget:pin', async () => {
    const ok = await pinWidget();
    refreshTrayMenu();
    return ok;
  });

  ipcMain.handle('widget:on-top-set', (_event, enabled) => {
    const value = !!enabled;
    store.setSettings({ widgetAlwaysOnTop: value });
    applyWidgetOnTop(value);
    return value;
  });

  ipcMain.handle('hotkeys:get', () => {
    const settings = store.getSettings();
    const plannerValue = settings.hotkey ?? DEFAULT_HOTKEY;
    const quickValue = settings.quickHotkey ?? DEFAULT_QUICK_HOTKEY;
    return {
      platform: process.platform,
      planner: {
        value: plannerValue,
        display: displayAccelerator(plannerValue, process.platform),
        registered: hotkeyRegistered
      },
      quick: {
        value: quickValue,
        display: displayAccelerator(quickValue, process.platform),
        registered: quickHotkeyRegistered
      }
    };
  });

  ipcMain.handle('hotkeys:set', (_event, payload) => {
    const data = payload && typeof payload === 'object' ? payload : {};
    return setHotkeySetting(data.kind, data.accelerator);
  });

  ipcMain.handle('hotkeys:reset', (_event, kind) => resetHotkeySetting(kind));

  ipcMain.handle('hotkeys:pause', () => {
    try {
      globalShortcut.unregisterAll();
    } catch (err) {
      // ignore
    }
    hotkeyRegistered = false;
    quickHotkeyRegistered = false;
    return true;
  });

  ipcMain.handle('hotkeys:resume', () => {
    const settings = store.getSettings();
    return applyHotkeys(settings.hotkey ?? DEFAULT_HOTKEY, settings.quickHotkey ?? DEFAULT_QUICK_HOTKEY);
  });

  ipcMain.handle('data:export', async () => {
    const result = await showPlannerDialog('showSaveDialog', {
      title: tr('exportTitle'),
      defaultPath: path.join(app.getPath('documents'), `gonow-tasks-${localDateString()}.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    try {
      return { count: exportTasksTo(result.filePath), filePath: result.filePath };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('data:import', async () => {
    const confirm = await showPlannerDialog('showMessageBox', {
      type: 'question',
      buttons: [tr('importReplace'), tr('importMerge'), tr('cancel')],
      defaultId: 0,
      cancelId: 2,
      message: tr('importModeMessage')
    });
    if (confirm.response === 2) return { canceled: true };
    const mode = confirm.response === 1 ? 'merge' : 'replace';
    const result = await showPlannerDialog('showOpenDialog', {
      title: tr('importTitle'),
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    try {
      const imported = importTasksFrom(result.filePaths[0], mode);
      return { count: imported.count, mode: imported.mode, skipped: imported.skipped };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('data:open-folder', () => shell.openPath(app.getPath('userData')));

  ipcMain.handle('cleanup:get', () => store.getSettings().autoCleanupDone || 'never');

  ipcMain.handle('tags:hidden', () => store.getSettings().hiddenTags || []);

  ipcMain.handle('tags:hide', (_event, tag) => store.hideTag(tag));

  ipcMain.handle('cleanup:set', (_event, value) => {
    const next = ['never', '30', '90'].includes(value) ? value : 'never';
    store.setSettings({ autoCleanupDone: next });
    let archived = 0;
    if (next !== 'never') archived = store.archiveDone(Number(next));
    if (archived) broadcastChange();
    return { value: next, archived };
  });

  ipcMain.handle('widget:drag-start', () => {
    if (widgetWin) {
      const b = widgetWin.getBounds();
      dragStartBounds = {
        x: b.x,
        y: b.y,
        width: widgetSize ? widgetSize.width : b.width,
        height: widgetSize ? widgetSize.height : b.height
      };
      debugLog(`drag-start bounds=${JSON.stringify(dragStartBounds)}`);
    }
  });

  ipcMain.handle('widget:drag-move', (_event, { dx, dy }) => {
    if (widgetWin && dragStartBounds) {
      const pos = clampWidgetPosition(
        dragStartBounds.x + dx,
        dragStartBounds.y + dy,
        dragStartBounds.width,
        dragStartBounds.height
      );
      widgetWin.setBounds({
        x: pos.x,
        y: pos.y,
        width: dragStartBounds.width,
        height: dragStartBounds.height
      });
    }
  });

  ipcMain.handle('widget:drag-end', () => {
    if (widgetWin) {
      const b = widgetWin.getBounds();
      store.setSettings({
        widgetPos: {
          x: b.x,
          y: b.y,
          width: dragStartBounds ? dragStartBounds.width : widgetSize.width,
          height: dragStartBounds ? dragStartBounds.height : widgetSize.height
        }
      });
      debugLog(`drag-end pos=${b.x},${b.y}`);
    }
    dragStartBounds = null;
    refreshTrayMenu();
  });

  ipcMain.handle('widget:resize-start', () => {
    if (widgetWin) {
      const b = widgetWin.getBounds();
      resizeStartBounds = {
        x: b.x,
        y: b.y,
        width: widgetSize ? widgetSize.width : b.width,
        height: widgetSize ? widgetSize.height : b.height
      };
      pendingResizeSize = { width: resizeStartBounds.width, height: resizeStartBounds.height };
      debugLog(`resize-start bounds=${JSON.stringify(resizeStartBounds)}`);
    }
  });

  ipcMain.handle('widget:resize-move', (_event, { dx, dy }) => {
    if (!widgetWin || !resizeStartBounds) return;
    const size = clampWidgetSize(
      resizeStartBounds.width + dx,
      resizeStartBounds.height + dy,
      resizeStartBounds.x,
      resizeStartBounds.y
    );
    pendingResizeSize = { width: size.width, height: size.height };
    widgetWin.setBounds({ x: resizeStartBounds.x, y: resizeStartBounds.y, width: size.width, height: size.height });
  });

  ipcMain.handle('widget:resize-end', () => {
    if (widgetWin && pendingResizeSize) {
      widgetSize = { width: pendingResizeSize.width, height: pendingResizeSize.height };
      store.setSettings({ widgetSize: widgetSize });
      debugLog(`resize-end size=${widgetSize.width}x${widgetSize.height}`);
    }
    resizeStartBounds = null;
    pendingResizeSize = null;
  });

  ipcMain.handle('reminder:current', () => (reminderBusyId ? store.getTask(reminderBusyId) : null));

  ipcMain.handle('reminder:action', (_event, action) => {
    handleReminderAction(action);
  });

  ipcMain.handle('link:open', (_event, url) => {
    try {
      const parsed = new URL(String(url));
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
      shell.openExternal(parsed.toString());
      debugLog(`open external link ${parsed.toString()}`);
      return true;
    } catch (err) {
      return false;
    }
  });
}

function logConsole(win, tag) {
  win.webContents.on('console-message', (event) => {
    const isError = event.level === 'error';
    const isWarning = event.level === 'warning';
    if (SMOKE || isError || isWarning) console.log(`[${tag}] ${event.message}`);
    if (isError || isWarning) debugLog(`${tag} console ${event.level}: ${event.message}`);
  });
  win.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error(`[${tag}] did-fail-load ${code} ${description} ${url}`);
    debugLog(`${tag} did-fail-load ${code} ${description} ${url}`);
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[${tag}] render-process-gone`, details);
    debugLog(`${tag} render-process-gone reason=${details && details.reason} exitCode=${details && details.exitCode}`);
    if (quitting || SMOKE) return;
    if (!shouldRecreateRenderer(tag)) {
      debugLog(`${tag} renderer crashed too often; not recreating`);
      return;
    }
    if (tag === 'planner') {
      try {
        if (plannerWin && !plannerWin.isDestroyed()) plannerWin.destroy();
      } catch (err) {
        // ignore
      }
      plannerWin = null;
      setTimeout(() => {
        if (!quitting) openPlanner();
      }, 800);
    } else if (tag === 'widget') {
      try {
        if (widgetWin && !widgetWin.isDestroyed()) widgetWin.destroy();
      } catch (err) {
        // ignore
      }
      widgetWin = null;
      setTimeout(() => {
        if (!quitting && !widgetWin) createWidget();
      }, 800);
    } else if (tag === 'quick') {
      try {
        if (quickWin && !quickWin.isDestroyed()) quickWin.destroy();
      } catch (err) {
        // ignore
      }
      quickWin = null;
    } else if (tag === 'reminder') {
      try {
        if (reminderWin && !reminderWin.isDestroyed()) reminderWin.destroy();
      } catch (err) {
        // ignore
      }
      reminderWin = null;
      reminderBusyId = null;
      setTimeout(() => processReminderQueue(), 500);
    }
  });
}
