# MIRA Render Agent — pilot

Локальный Render Agent выполняет тяжёлую сборку Video Scene на компьютере администратора. Он не является серверным worker и не должен запускаться на VPS MIRA-TV.

## Установка из MIRA-TV

Если локальный Agent не найден, Scene Editor показывает кнопку «Установить Render Agent». Она скачивает Windows bootstrap, уже привязанный к текущему MIRA-TV.

Установка идёт без прав администратора в `%LOCALAPPDATA%\\MIRA-TV\\RenderAgent`: portable Node.js 24 проверяется по официальному SHA-256, FFmpeg — по опубликованному SHA-256 сборки, Chrome/Edge определяется автоматически, Agent добавляется в автозапуск текущего пользователя и сразу запускается.

Браузер может скачать установщик одной кнопкой, но не имеет права сам запустить скачанный файл. Поэтому пользователь один раз открывает `MIRA-Render-Agent-Setup.cmd`; дальше ручные команды не нужны.

## Ручной запуск пилота

Для разработки Agent по-прежнему можно запускать вручную. Нужны Node.js 24+, Chrome/Edge и FFmpeg в PATH.

```powershell
node tools/render-agent/agent.js --server=https://your-mira-tv.example
```

Agent слушает только `127.0.0.1:41417` и принимает задания только от указанного MIRA-TV origin.

Дополнительные переменные:

- `MIRA_RENDER_BROWSER_PATH` — путь к Chrome/Edge/Chromium;
- `FFMPEG_PATH` — путь к ffmpeg;
- `MIRA_RENDER_AGENT_PORT` — локальный порт Agent.

Production-версия будет упакована в отдельный установщик/трей-приложение; pilot нужен для проверки полного контура Editor → Agent → MP4 → VPS → TV.
