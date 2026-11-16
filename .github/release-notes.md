# Go, Now! 2.1.0

Пиксельный планер задач с виджетом на рабочем столе для Windows, Linux и macOS.

## Что нового

- **Архив выполненных:** фильтр «АРХИВ», восстановление, удаление навсегда и автоархивация через 30/90 дней.
- **Командная палитра:** `Ctrl+K` / `Cmd+K` для быстрого перехода к задачам, архиву, статистике, настройкам, экспорту, темам и языкам.
- **Повторения:** ежедневно, еженедельно, ежемесячно, по будням и каждые N дней; интервалы распознаются в быстром добавлении.
- **Звуки:** 6 встроенных сигналов и до 5 своих MP3/WAV/OGG/M4A; пиксельный ползунок громкости, отдельный звук для «Важного» и кастомных тегов. Встроенные сигналы громче на 30%.
- **MCP v2:** TypeScript/Zod SDK, named pipe, новые инструменты `complete_task`, `snooze_task`, `get_stats`, `list_tags`, `archive_task`, `restore_task`.
- **Безопасность и надёжность:** renderer sandbox, атомарное сохранение, валидация импорта, восстановление после сбоев, нативное закрепление виджета через Koffi.

## Установка

### Windows 10/11 (x64)

- `gonow-2.1.0-setup.exe` — установщик для текущего пользователя, без прав администратора.
- `gonow-2.1.0-portable.exe` — портативная версия.

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

# Go, Now! 2.1.0 (English)

A pixel-art task planner with a desktop widget for Windows, Linux and macOS.

**Highlights:** completed-task archive, command palette, monthly/weekday/every-N
repeats, custom and per-tag notification sounds with volume control, MCP v2 with
new tools, hardened storage/imports, renderer sandbox and native widget pinning.

**Install:** download the asset for your platform above. Builds are unsigned; on
first launch use SmartScreen “More info → Run anyway” or Gatekeeper right-click →
Open. Checksums are provided in `SHA256SUMS-*.txt`.

MIT © 2026 Alexander Ancibor.
