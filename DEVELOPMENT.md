# Go, Now! — разработка

## Требования

- Windows 10/11 x64, macOS 12+, или Linux x64
- Node.js 20+ и npm
- Koffi ставится через `npm install` (Node-API, готовые бинарники; сборка не нужна)
- PowerShell 5.1 (скрипты сборки ассетов и fallback закрепления, только Windows)
- macOS-сборка возможна только на macOS

## Запуск и тесты

```powershell
npm install
npm start
npm test           # юнит-тесты: стор, парсер, хоткеи, звуки, импорт/экспорт, win32
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
| `PP_NOLOCK=1` | не требовать single-instance lock (для тестов при запущенном экземпляре) |
| `GONOW_USER_DATA=<путь>` | изолированная папка данных для smoke/e2e |
| `PP_CRASHTEST=1` | краш рендерера планера и проверка восстановления |
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
| `PP_SOUNDTEST=1` | проверка выбора звука уведомления |
| `PP_VOLUMETEST=1` | проверка ползунка громкости мышью на 0% и 100% |
| `PP_PINTEST=1` | скрыть, вернуть и пересоздать виджет с повторным закреплением |
| `PP_PICKERTEST=1`, `PP_PICKERHOLD=date\|time\|widget` | проверка пикеров |
| `PP_NOTETEST=1`, `PP_MAXTEST=1`, `PP_REMINDER=1` | проверка заметки, разворота окна, напоминания |
| `PP_REMINDERTEST=1` | повторный показ отложенного напоминания |
| `PP_SEARCHTEST=1`, `PP_UNDOTEST=1`, `PP_STATSTEST=1` | проверка поиска, отмены и статистики |
| `PP_QUICKTEST=1` | сценарий быстрого добавления (`Ctrl+Alt+Space`)
| `PP_PLATFORMTEST=1` | проверка платформенных настроек (pin/on-top)
| `PP_TAGTEST=1`, `PP_REPEATTEST=1` | проверка списка тегов и выбора повтора

Отладочные снимки и `pp-debug.log` пишутся в папку данных приложения.

## Закрепление виджета

Виджет переродительствуется в `WorkerW`, содержащий `SHELLDLL_DefView` (слой над
иконками рабочего стола), и поднимается через `SetWindowPos`. Проверки используют
`GetAncestor(hwnd, GA_PARENT)` — у popup-окна `GetParent` возвращает 0.

Основной путь — нативный `src/win32.js` через Koffi (Node-API). Если модуль
недоступен или вызов не удался, `src/pin.js` откатывается на прежний
PowerShell-скрипт. Watchdog проверяет закрепление раз в 5 минут, а также на
`powerMonitor.resume` и события смены дисплеев; параллельные проверки
заблокированы.

## Быстрое добавление

- `renderer/shared/quick-parse.js` — UMD-парсер: даты (сегодня/завтра/дни недели/
  «через N дней»/`дд.мм`), время (`15:00`, «в 9 вечера»), теги `#tag`, «важно» `!`,
  «без срока», повторения («каждый день», «еженедельно», «по будням»,
  «каждые N дней»). Тесты — `scripts/test-quick-parse.js`.
- `renderer/quick.*` — мини-окно (frameless, always-on-top), хоткей
  `Ctrl+Alt+Space` по умолчанию настраивается в параметрах и регистрируется
  вместе с основным в `applyHotkeys()`.
- Парсер общий для окна и тестов; менять поведение — только там.

## Повторения

- Значения `recurrence`: `none`, `daily`, `weekly`, `monthly`, `weekdays`,
  `everyN`. Для `everyN` хранится `recurrenceInterval` (2–365 дней).
- `monthly` клампится к последнему дню месяца (31 января → 28/29 февраля),
  `weekdays` пропускает субботу и воскресенье.
- При выполнении задачи создаётся следующая; если приложение было закрыто,
  catch-up доводит дату до сегодняшнего дня.
- Интервал и повторение валидируются в сторе, MCP и при импорте.

## Поиск и статистика

- Поиск/фильтры живут в `renderer/planner.js` и работают поверх `allTasks`
  (заголовок, заметка, теги), результаты группируются по дате. Архив — отдельный
  список `archivedTasks` с фильтром «АРХИВ».
- Статистика считается из `doneAt` выполненных задач, включая архив; автоархивация
  (`autoCleanupDone`, значения `30`/`90`) переносит старые выполненные задачи в
  архив, не удаляя их.
- `archived`/`archivedAt` хранятся в той же записи задачи; `listTasks()` по
  умолчанию исключает архив, `listArchived()` возвращает его отдельно.
- Командная палитра `Ctrl+K`/`Cmd+K` живёт в `renderer/planner.js`: оверлей,
  fuzzy-фильтр, `aria-activedescendant`, стрелки/Enter/Esc и команды поверх
  существующих функций (фильтры, настройки, MCP, экспорт, темы, языки).

## MCP

- `mcp/src/*.ts` — stdio MCP-сервер на `@modelcontextprotocol/server` v2 + Zod;
  `npm run build:mcp` собирает один CJS-бандл `mcp/gonow-mcp.js` (Node >= 20).
- `mcp/src/bridge.ts` — мост и файловый fallback; `mcp/src/store.ts` — операции
  над задачами; `mcp/src/index.ts` — регистрация инструментов и `serveStdio`.
- Инструменты: `list_tasks` (`include_archived`), `add_task`, `add_tasks`,
  `update_task`, `delete_task`, `complete_task`, `snooze_task`, `get_stats`,
  `list_tags`, `archive_task`, `restore_task`.
- При запущенном приложении используется named pipe (Windows) или Unix-socket
  (macOS/Linux); путь и токен лежат в `bridge.json`.
- Если приложение живо, но мост недоступен, MCP не пишет файл данных и
  возвращает ошибку — это защищает от потери изменений.
- Если приложение не запущено, используется файл данных с блокировкой
  `store.lock` и резервной копией `.bak`.
- `bridge.log` и `GET /health` помогают диагностировать мост.
- `npm run mcp:smoke` создаёт и удаляет собственные тестовые задачи.

## Сборка релиза

```powershell
npm run build:mcp # mcp/gonow-mcp.js из mcp/src (v2 SDK + Zod)
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

- `pixel-planner.json` — задачи и настройки (schemaVersion 3; архив хранится
  флагами `archived`/`archivedAt` в тех же задачах);
- `pixel-planner.json.bak` — резервная копия на момент запуска;
- `backups/pixel-planner-YYYY-MM-DD.json` — ежедневные копии (последние 7);
- `pixel-planner.json.corrupt-<timestamp>.json` — повреждённый файл, если JSON
  не разобрался (приложение восстанавливается из `.bak` или `backups/`);
- `bridge.json` — путь к named pipe/Unix-socket и токен моста;
- `bridge.log`, `store.lock` — журнал моста и блокировка файла данных;
- `mcp/gonow-mcp.js` — собранный из `mcp/src` CJS-бандл и его стабильная копия
  для конфигов клиентов;
- `pp-debug.log`, `shot-*.png` — только в отладочном режиме.

Сброс данных: закрыть приложение и удалить папку данных.
