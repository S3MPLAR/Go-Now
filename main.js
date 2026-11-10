const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, shell, dialog, globalShortcut, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const crypto = require('node:crypto');
const Store = require('./src/store');
const { pinToDesktop, isPinnedToDesktop } = require('./src/pin');
const platform = require('./src/platform');
const { normalizeAccelerator, sameAccelerator, displayAccelerator } = require('./src/accelerators');

const SMOKE = process.argv.includes('--smoke');
const DEBUG = !app.isPackaged && process.env.PP_DEBUG === '1';
const DEFAULT_HOTKEY = 'Alt+Shift+Q';
const DEFAULT_QUICK_HOTKEY = 'CommandOrControl+Alt+Space';
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
    exportTitle: 'Экспорт задач',
    importTitle: 'Импорт задач',
    importConfirm: 'Заменить текущий список задач данными из файла?',
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
    exportTitle: 'Export tasks',
    importTitle: 'Import tasks',
    importConfirm: 'Replace the current task list with the file contents?',
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

function tr(key) {
  const table = MAIN_STRINGS[currentLanguage()] || MAIN_STRINGS.ru;
  return table[key] || MAIN_STRINGS.ru[key] || key;
}

function debugLog(message) {
  if (!DEBUG) return;
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'pp-debug.log'), `${new Date().toISOString()} ${message}\n`);
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

process.on('uncaughtException', (err) => {
  debugLog(`uncaughtException: ${err && err.stack ? err.stack : err}`);
});
process.on('unhandledRejection', (err) => {
  debugLog(`unhandledRejection: ${err && err.stack ? err.stack : err}`);
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
let hotkeyRegistered = false;
const reminderQueue = [];

if (process.platform === 'win32') app.setAppUserModelId('com.gonow.app');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => openPlanner());
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

function init() {
  debugLog(`init userData=${app.getPath('userData')}`);
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
      const removed = store.cleanupDone(cleanupDays);
      if (removed) debugLog(`auto cleanup removed ${removed} done tasks`);
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
    screen.on('display-metrics-changed', ensureWidgetOnScreen);
    screen.on('display-added', ensureWidgetOnScreen);
    screen.on('display-removed', ensureWidgetOnScreen);
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
          debugLog(`datatest before=${before} exported=${exported} imported=${imported}`);
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
      sandbox: false,
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
    if (!quitting && !SMOKE) {
      debugLog('widget closed unexpectedly, recreating');
      setTimeout(() => {
        if (!quitting && !widgetWin) createWidget();
      }, 1500);
    }
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
      sandbox: false,
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
      sandbox: false,
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

function startBridge() {
  if (SMOKE) return;
  try {
    const token = crypto.randomBytes(16).toString('hex');
    bridgeServer = http.createServer((req, res) => handleBridgeRequest(req, res, token));
    bridgeServer.on('error', (err) => debugLog(`bridge error: ${err.message}`));
    bridgeServer.listen(0, '127.0.0.1', () => {
      const port = bridgeServer.address().port;
      fs.writeFileSync(bridgeFilePath(), JSON.stringify({ port, token, pid: process.pid }), 'utf8');
      debugLog(`bridge listening on 127.0.0.1:${port}`);
      logBridge(`listening on 127.0.0.1:${port}`);
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
  logBridge('stopped');
  try {
    fs.unlinkSync(bridgeFilePath());
  } catch (err) {
    // ignore
  }
}

function handleBridgeRequest(req, res, token) {
  const startedAt = Date.now();
  let logged = false;
  const send = (status, body) => {
    if (!logged) {
      logged = true;
      logBridge(`${req.method} ${req.url} ${status} ${Date.now() - startedAt}ms`);
    }
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };
  if (req.headers.authorization !== `Bearer ${token}`) {
    send(401, { error: 'unauthorized' });
    return;
  }
  let url;
  try {
    url = new URL(req.url, 'http://127.0.0.1');
  } catch (err) {
    send(400, { error: 'bad url' });
    return;
  }
  const parts = url.pathname.split('/').filter(Boolean);
  const readBody = (callback) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      if (!data) {
        callback({});
        return;
      }
      try {
        callback(JSON.parse(data));
      } catch (err) {
        send(400, { error: 'invalid json' });
      }
    });
  };

  if (parts[0] === 'health' && parts.length === 1 && req.method === 'GET') {
    send(200, {
      ok: true,
      pid: process.pid,
      version: app.getVersion(),
      uptime: Math.round(process.uptime()),
      tasks: store.listTasks().length
    });
    return;
  }

  if (parts[0] === 'tasks' && parts.length === 1 && req.method === 'GET') {
    const date = url.searchParams.get('date');
    const all = store.listTasks();
    send(200, { tasks: date ? all.filter((task) => task.date === date) : all });
    return;
  }

  if (parts[0] === 'tasks' && parts.length === 1 && req.method === 'POST') {
    readBody((body) => {
      try {
        const task = store.addTask(body || {});
        broadcastChange();
        setTimeout(scanReminders, 200);
        send(200, { task });
      } catch (err) {
        send(400, { error: err.message });
      }
    });
    return;
  }

  if (parts[0] === 'tasks' && parts[1] === 'bulk' && parts.length === 2 && req.method === 'POST') {
    readBody((body) => {
      try {
        const items = body && Array.isArray(body.tasks) ? body.tasks : [];
        if (!items.length) {
          send(400, { error: 'tasks required' });
          return;
        }
        const tasks = items.map((item) => store.addTask(item || {}));
        broadcastChange();
        setTimeout(scanReminders, 200);
        send(200, { tasks });
      } catch (err) {
        send(400, { error: err.message });
      }
    });
    return;
  }

  if (parts[0] === 'tasks' && parts.length === 2) {
    const id = decodeURIComponent(parts[1]);
    if (req.method === 'GET') {
      const task = store.getTask(id);
      if (task) send(200, { task });
      else send(404, { error: 'not found' });
      return;
    }
    if (req.method === 'PATCH') {
      readBody((body) => {
        let task = store.updateTask(id, body || {});
        if (!task) {
          send(404, { error: 'not found' });
          return;
        }
        if (body && body.done !== undefined) task = store.setDone(id, !!body.done) || task;
        broadcastChange();
        setTimeout(scanReminders, 200);
        send(200, { task });
      });
      return;
    }
    if (req.method === 'DELETE') {
      store.removeTask(id);
      broadcastChange();
      send(200, { ok: true });
      return;
    }
  }

  send(404, { error: 'not found' });
}

function exportTasksTo(filePath) {
  const payload = {
    app: 'Go, Now!',
    version: 1,
    exportedAt: new Date().toISOString(),
    tasks: store.listTasks()
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return payload.tasks.length;
}

function importTasksFrom(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const tasks = Array.isArray(parsed) ? parsed : parsed && parsed.tasks;
  if (!Array.isArray(tasks)) throw new Error('invalid file');
  const count = store.replaceTasks(tasks);
  store.saveNow();
  broadcastChange();
  return count;
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

function startWidgetWatchdog() {
  if (SMOKE || process.platform !== 'win32') return;
  const intervalMs = Number(process.env.PP_WATCHDOG_MS || 60000);
  setInterval(() => {
    if (!widgetWin || widgetWin.isDestroyed()) return;
    isPinnedToDesktop(widgetWin)
      .then((pinned) => {
        if (!pinned && widgetWin && !widgetWin.isDestroyed() && !quitting) {
          debugLog('watchdog: widget lost pin, re-pinning');
          pinWidget();
        }
      })
      .catch(() => {});
  }, intervalMs);
}

async function pinWidget() {
  if (!widgetWin || SMOKE || process.platform !== 'win32') {
    debugLog(`pin skipped win=${!!widgetWin} smoke=${SMOKE} platform=${process.platform}`);
    return false;
  }
  debugLog('pin start');
  const ok = await pinToDesktop(widgetWin);
  debugLog(`pin result=${ok}`);
  widgetPinned = ok;
  if (ok) console.log('[pin] widget pinned to desktop');
  else console.warn('[pin] widget stays as a regular window');
  refreshTrayMenu();
  return ok;
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
        if (!widgetWin) return;
        if (widgetWin.isVisible()) widgetWin.hide();
        else widgetWin.showInactive();
        refreshTrayMenu();
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
  setInterval(scanReminders, 20000);
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
  debugLog(`showReminder id=${task.id} title=${task.title}`);
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
        sandbox: false,
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
      buttons: [tr('importTitle'), tr('cancel')],
      defaultId: 1,
      cancelId: 1,
      message: tr('importConfirm')
    });
    if (confirm.response !== 0) return { canceled: true };
    const result = await showPlannerDialog('showOpenDialog', {
      title: tr('importTitle'),
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    try {
      return { count: importTasksFrom(result.filePaths[0]) };
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
    let removed = 0;
    if (next !== 'never') removed = store.cleanupDone(Number(next));
    if (removed) broadcastChange();
    return { value: next, removed };
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
  });
}
