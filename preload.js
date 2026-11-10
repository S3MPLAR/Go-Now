const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  listTasks: () => ipcRenderer.invoke('tasks:list'),
  addTask: (payload) => ipcRenderer.invoke('tasks:add', payload),
  restoreTask: (snapshot) => ipcRenderer.invoke('tasks:restore', snapshot),
  updateTask: (id, patch) => ipcRenderer.invoke('tasks:update', { id, patch }),
  toggleTask: (id, done) => ipcRenderer.invoke('tasks:toggle', { id, done }),
  removeTask: (id) => ipcRenderer.invoke('tasks:delete', id),
  openPlanner: () => ipcRenderer.invoke('planner:open'),
  hideQuick: () => ipcRenderer.invoke('quick:hide'),
  onQuickShow: (callback) => {
    ipcRenderer.on('quick:show', () => callback());
  },
  minimizePlanner: () => ipcRenderer.invoke('planner:minimize'),
  hidePlanner: () => ipcRenderer.invoke('planner:hide'),
  toggleMaximize: () => ipcRenderer.invoke('planner:maximize-toggle'),
  onPlannerMaximized: (callback) => ipcRenderer.on('planner:maximized', (_event, value) => callback(value)),
  getInfo: () => ipcRenderer.invoke('app:info'),
  getMcpInfo: () => ipcRenderer.invoke('mcp:info'),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  setAutostart: (enabled) => ipcRenderer.invoke('autostart:set', enabled),
  getTheme: () => ipcRenderer.invoke('theme:get'),
  setTheme: (theme) => ipcRenderer.invoke('theme:set', theme),
  onThemeChanged: (callback) => {
    ipcRenderer.on('theme:changed', (_event, theme) => callback(theme));
  },
  getLanguage: () => ipcRenderer.invoke('language:get'),
  setLanguage: (language) => ipcRenderer.invoke('language:set', language),
  onLanguageChanged: (callback) => {
    ipcRenderer.on('language:changed', (_event, language) => callback(language));
  },
  getLogo: () => ipcRenderer.invoke('logo:get'),
  chooseLogo: () => ipcRenderer.invoke('logo:choose'),
  resetLogo: () => ipcRenderer.invoke('logo:reset'),
  pinWidget: () => ipcRenderer.invoke('widget:pin'),
  setWidgetOnTop: (enabled) => ipcRenderer.invoke('widget:on-top-set', enabled),
  getHotkeys: () => ipcRenderer.invoke('hotkeys:get'),
  setHotkey: (kind, accelerator) => ipcRenderer.invoke('hotkeys:set', { kind, accelerator }),
  resetHotkey: (kind) => ipcRenderer.invoke('hotkeys:reset', kind),
  pauseHotkeys: () => ipcRenderer.invoke('hotkeys:pause'),
  resumeHotkeys: () => ipcRenderer.invoke('hotkeys:resume'),
  setOpenPlanner: (enabled) => ipcRenderer.invoke('startup:set', enabled),
  exportData: () => ipcRenderer.invoke('data:export'),
  importData: () => ipcRenderer.invoke('data:import'),
  openDataFolder: () => ipcRenderer.invoke('data:open-folder'),
  getCleanup: () => ipcRenderer.invoke('cleanup:get'),
  setCleanup: (value) => ipcRenderer.invoke('cleanup:set', value),
  getHiddenTags: () => ipcRenderer.invoke('tags:hidden'),
  hideTag: (tag) => ipcRenderer.invoke('tags:hide', tag),
  dragStart: () => ipcRenderer.invoke('widget:drag-start'),
  dragMove: (dx, dy) => ipcRenderer.invoke('widget:drag-move', { dx, dy }),
  dragEnd: () => ipcRenderer.invoke('widget:drag-end'),
  resizeStart: () => ipcRenderer.invoke('widget:resize-start'),
  resizeMove: (dx, dy) => ipcRenderer.invoke('widget:resize-move', { dx, dy }),
  resizeEnd: () => ipcRenderer.invoke('widget:resize-end'),
  reminderCurrent: () => ipcRenderer.invoke('reminder:current'),
  reminderAction: (action) => ipcRenderer.invoke('reminder:action', action),
  openLink: (url) => ipcRenderer.invoke('link:open', url),
  onTasksChanged: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('tasks:changed', handler);
    return () => ipcRenderer.removeListener('tasks:changed', handler);
  },
  onReminderShow: (callback) => {
    ipcRenderer.on('reminder:show', (_event, task) => callback(task));
  }
});
