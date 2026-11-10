# Go, Now! — разработка

## Требования

- Windows 10/11 x64, macOS 12+, или Linux x64
- Node.js 20+ и npm
- PowerShell 5.1 (скрипты сборки ассетов, только Windows)
- macOS-сборка возможна только на macOS

## Запуск и тесты

```powershell
npm install
npm start
npm test           # юнит-тесты стора и парсера (scripts/test-store.js, test-quick-parse.js)
npm run smoke      # загрузка приложения без окон, авто-выход
npm run mcp:smoke  # MCP: init → list → add_tasks → update → delete
```

## Отладочные переменные

Все хуки работают только в режиме разработки (`app.isPackaged === false`) и при
`PP_DEBUG=1`:

```powershell
$env:PP_DEBUG="1"; $env:PP_QUIT_AFTER="15000"; npm start
```

| Переменная | Назначение |
|---|---|
| `PP_DEBUG=1` | включает `pp-debug.log` и отладочные хуки |
| `PP_QUIT_AFTER=<мс>` | авто-выход через N мс |
| `PP_SCREENSHOT=1` | снимки окон в папку данных (`shot-*.png`) |
| `PP_SHOT_AT=<мс>` | снимок виджета через N мс |
| `PP_SETTINGS=1` | открыть настройки планера |
| `PP_LANG=ru\|en` | переключить язык |
| `PP_DRAG=1`, `PP_RESIZE=1` | тесты перетаскивания и изменения размера |
| `PP_NOPIN=1` | не закреплять виджет на столе |
| `PP_UITEST=1`, `PP_ADDTEST=1`, `PP_DATATEST=1` | сценарии UI и данных |
| `PP_PINMODE=plain\|raise\|framechanged` | режим закрепления |
| `PP_WATCHDOG_MS=<мс>` | интервал watchdog закрепления |
| `PP_HOTKEYTEST=1`, `PP_HOTKEYTOGGLE=1`, `PP_HOTKEYVIEW=1` | проверка хоткея |
| `PP_QUICKHOTKEYTEST=1` | проверка быстрой клавиши, конфликта и сброса |
| `PP_PICKERTEST=1`, `PP_PICKERHOLD=date\|time\|widget` | проверка пикеров |
| `PP_NOTETEST=1`, `PP_MAXTEST=1`, `PP_REMINDER=1` | проверка заметки, разворота окна, напоминания |
| `PP_SEARCHTEST=1`, `PP_UNDOTEST=1`, `PP_STATSTEST=1` | проверка поиска, отмены и статистики |
| `PP_QUICKTEST=1` | сценарий быстрого добавления (`Ctrl+Alt+Space`)
| `PP_PLATFORMTEST=1` | проверка платформенных настроек (pin/on-top)
| `PP_TAGTEST=1`, `PP_REPEATTEST=1` | проверка списка тегов и выбора повтора

Отладочные снимки и `pp-debug.log` пишутся в папку данных приложения.

## Закрепление виджета

Виджет переродительствуется в `WorkerW`, содержащий `SHELLDLL_DefView` (слой над
иконками рабочего стола), и поднимается через `SetWindowPos`. Проверки используют
`GetAncestor(hwnd, GA_PARENT)` — у popup-окна `GetParent` возвращает 0.

## Быстрое добавление

- `renderer/shared/quick-parse.js` — UMD-парсер: даты (сегодня/завтра/дни недели/
  «через N дней»/`дд.мм`), время (`15:00`, «в 9 вечера»), теги `#tag`, «важно» `!`,
  «без срока». Тесты — `scripts/test-quick-parse.js`.
- `renderer/quick.*` — мини-окно (frameless, always-on-top), хоткей
  `Ctrl+Alt+Space` по умолчанию настраивается в параметрах и регистрируется
  вместе с основным в `applyHotkeys()`.
- Парсер общий для окна и тестов; менять поведение — только там.

## Поиск и статистика

- Поиск/фильтры живут в `renderer/planner.js` и работают поверх `allTasks`
  (заголовок, заметка, теги), результаты группируются по дате.
- Статистика считается из `doneAt` выполненных задач; автоочистка
  (`autoCleanupDone`) ограничивает окно истории.

## MCP

- `mcp/gonow-mcp.js` — stdio JSON-RPC, без зависимостей.
- При запущенном приложении используется мост `127.0.0.1` (порт и токен в
  `bridge.json`), иначе — файл данных с блокировкой `store.lock`.
- `bridge.log` и `GET /health` помогают диагностировать мост.
- `npm run mcp:smoke` создаёт и удаляет собственные тестовые задачи.

## Сборка релиза

```powershell
npm run icons     # build/icon.png, build/icon.icns, иконки трея
npm run dist:win  # NSIS + portable
npm run dist:linux # AppImage + deb (Linux или CI)
npm run dist:mac  # dmg + zip (только на macOS)
```

Иконки `build/icon.png`, `build/icon.icns` и иконки трея закоммичены;
`npm run icons` пересобирает их на Windows (PowerShell).

Результат:
- `dist/gonow-<version>-setup.exe`, `dist/gonow-<version>-portable.exe`;
- `dist/gonow-<version>-linux-<arch>.AppImage`, `dist/gonow-<version>-linux-<arch>.deb`;
- `dist/gonow-<version>-mac-<arch>.dmg`, `dist/gonow-<version>-mac-<arch>.zip`.

CI: `.github/workflows/build.yml` собирает все три ОС и прикрепляет артефакты к
GitHub Release по тегу `v*`. macOS собирается без подписи
(`CSC_IDENTITY_AUTO_DISCOVERY=false`), Windows — как раньше.

Код не подписан — electron-builder пропускает подпись без сертификата. Для
подписи добавьте `win.certificateFile`/`certificatePassword` (или
`CSC_LINK`/`CSC_KEY_PASSWORD`).

## Платформенные особенности

- `src/platform.js` — автозапуск, иконки трея и стабильные пути:
  - Windows: `setLoginItemSettings`, трей `tray.png`, закрепление через WorkerW;
  - macOS: Login Items, template-иконка меню-бара, плавающий виджет на всех
    Spaces, меню App/Edit/Window;
  - Linux: `~/.config/autostart/gonow.desktop`, трей 22×22 (нужен
    libappindicator), плавающий виджет, fallback без трея.
- Вне Windows кнопка «Закрепить» скрыта, вместо неё — «Поверх окон».
- MCP-скрипт копируется в `<userData>/mcp/gonow-mcp.js`, чтобы путь был
  стабильным в AppImage и macOS-бандле.
- Глобальные хоткеи и трей на Linux зависят от X11/Wayland и окружения.

## Данные

Папка данных (`app.getPath('userData')`):
- Windows: `%APPDATA%\Go, Now!\`
- macOS: `~/Library/Application Support/Go, Now!/`
- Linux: `~/.config/Go, Now!/`

- `pixel-planner.json` — задачи и настройки;
- `pixel-planner.json.bak` — резервная копия на момент запуска;
- `backups/pixel-planner-YYYY-MM-DD.json` — ежедневные копии (последние 7);
- `pixel-planner.json.corrupt-<timestamp>.json` — повреждённый файл, если JSON
  не разобрался (приложение восстанавливается из `.bak` или `backups/`);
- `bridge.json`, `bridge.log`, `store.lock` — рантайм моста;
- `mcp/gonow-mcp.js` — стабильная копия MCP-сервера для конфигов клиентов;
- `pp-debug.log`, `shot-*.png` — только в отладочном режиме.

Сброс данных: закрыть приложение и удалить папку данных.
