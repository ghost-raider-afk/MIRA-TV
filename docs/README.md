# Документация MIRA-TV

Рабочие инструкции описывают опубликованное состояние проекта в `main`. **Актуальная стабильная версия — [v1.18.26](https://github.com/ghost-raider-afk/MIRA-TV/releases/tag/v1.18.26)**; перед установкой проверяйте [последний релиз](https://github.com/ghost-raider-afk/MIRA-TV/releases).

## Установка и эксплуатация

- [INSTALLATION.md](INSTALLATION.md) — установка на Ubuntu, обновление, откат и сохранность данных.
- [CONFIGURATION.md](CONFIGURATION.md) — параметры `.env`, секреты и безопасные настройки.
- [DEPLOYMENT-CHECKLIST.md](DEPLOYMENT-CHECKLIST.md) — готовность, HTTPS, база, Player и сохранение LKG.
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) — диагностика сайта, соединений и старых Android TV.

## Работа и разработка

- [USAGE.md](USAGE.md) — каталог, торговые точки, Scene Editor, темы, менеджеры и CRM-заявки.
- [PLAYER.md](PLAYER.md) — общий статический renderer, получение изменений, локальный кэш и восстановление связи.
- [PERFORMANCE.md](PERFORMANCE.md) — принципы работы слабых Android TV.
- [ARCHITECTURE.md](ARCHITECTURE.md) — компоненты системы и гарантии совместимости.
- [CONTRIBUTING.md](../CONTRIBUTING.md) — правила изменений, тестирования и релизов.
- [BRANDING.md](BRANDING.md) — название и оформление проекта.

## Развитие и история

- [ROADMAP.md](ROADMAP.md) — отдельный перечень планируемых или незавершённых задач.
- [CHANGELOG.md](../CHANGELOG.md) и [архив заметок релизов](releases/) — **исторические записи**, не инструкция к текущему коду.

В рабочем режиме MIRA-TV использует статическую сцену и общий `PlayerSceneRenderer`. Из открытых PR и архивов нельзя выводить, что неслитая или ранее удалённая функция доступна на сервере.
