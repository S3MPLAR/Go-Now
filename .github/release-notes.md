# Go, Now! 2.0.0

Пиксельный планер задач с виджетом на рабочем столе. Первый публичный релиз:
Windows, Linux и macOS.

## Что нового

- **Кроссплатформенность:** Windows 10/11, Linux (AppImage, deb) и macOS (dmg, zip, x64).
- **Виджет на рабочем столе:** в Windows закрепляется за иконками (WorkerW); в macOS и Linux — плавающее окно с управлением из трея и режимом «Поверх окон».
- **Планер:** день и неделя, поиск, фильтры, теги, важное, повторы, статистика, архив и отмена действий.
- **Быстрое добавление:** `Ctrl+Alt+Space` с разбором «завтра», «в понедельник», времени, дат, тегов и `!`.
- **Напоминания:** всплывающие уведомления, «Сделано» и «+10 мин».
- **Локальные данные:** атомарная запись, резервные копии, восстановление, экспорт/импорт JSON, без телеметрии.
- **MCP:** stdio-сервер для AI-ассистентов (opencode, Claude Desktop, Cursor, Cline и других).
- **Шесть тем**, русский и английский интерфейс, свой логотип.

## Установка

### Windows 10/11 (x64)

- `gonow-2.0.0-setup.exe` — установщик для текущего пользователя, без прав администратора.
- `gonow-2.0.0-portable.exe` — портативная версия.

### Linux (x64)

- `gonow-*-linux-*.AppImage` — `chmod +x` и запуск.
- `gonow-*-linux-*.deb` — `sudo apt install ./gonow-*-linux-*.deb`.

### macOS (x64, без подписи)

- `gonow-*-mac-x64.dmg` или `.zip`.
- При первом запуске Gatekeeper может заблокировать приложение: правый клик по
  `Go, Now!.app` → «Открыть» или `xattr -cr "/Applications/Go, Now!.app"`.

## Контрольные суммы

В ассетах релиза: `SHA256SUMS-win.txt`, `SHA256SUMS-linux.txt`,
`SHA256SUMS-mac.txt`.

## Ссылки

- [README](https://github.com/S3MPLAR/Go-Now#readme)
- [CHANGELOG](https://github.com/S3MPLAR/Go-Now/blob/main/CHANGELOG.md)
- [Поддержать проект](https://boosty.to/anc/donate)

---

# Go, Now! 2.0.0 (English)

A pixel-art task planner with a desktop widget. This is the first public release
for Windows, Linux and macOS.

**Highlights:** cross-platform builds, desktop widget (WorkerW on Windows,
floating window on macOS/Linux), day/week planner, quick add with natural-language
parsing, reminders, local-only data with backups, MCP integration, six themes,
Russian/English UI.

**Install:** download the asset for your platform above. Builds are unsigned; on
first launch use SmartScreen “More info → Run anyway” or Gatekeeper right-click →
Open. Checksums are provided in `SHA256SUMS-*.txt`.

MIT © 2026 Alexander Ancibor.
