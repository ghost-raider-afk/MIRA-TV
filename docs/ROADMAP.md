# MIRA-TV roadmap

## 1.0.0 baseline

Цель первого релиза новой продуктовой линии — чистая MIRA-TV без старого файлового transport pipeline и без старых runtime namespace.

В baseline входят:

- полный MIRA-TV rebrand;
- единый Docker Compose project;
- установка в `/opt/MIRA-TV`;
- PostgreSQL + Node.js/Express;
- TV Player с Last Known Good;
- IndexedDB durable runtime state;
- Cache Storage для media/shell;
- WebSocket invalidation/control channel;
- REST snapshot/delta fallback;
- bounded локальный журнал TV Player с пакетной отправкой после восстановления связи;
- render-on-change по независимым слоям;
- приоритет минимальной нагрузки на телевизор;
- актуальная документация установки и эксплуатации.

## После 1.0.0

Дальнейшее развитие допускается только без нарушения resource-budget Player. Более тяжёлые визуальные технологии должны добавляться как отдельные опциональные renderer-слои и не превращать статическое меню в постоянный GPU/CPU workload.
