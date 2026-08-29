# MIRA-TV — приёмка VPS

## Цель

Проверить чистую установку MIRA-TV 1.0.0 как одного Docker Compose проекта без устаревших транспортных сервисов.

## Обязательные проверки

- `mira-tv`, `mira-tv-db` и `mira-tv-proxy` запущены;
- HTTPS отвечает на каноническом домене;
- PostgreSQL доступен только внутренней Docker-сети;
- proxy network называется `mira-tv-proxy` и создаётся самим Compose;
- TV Player `/player` открывается и может пройти QR-привязку;
- локальные site assets доступны Player по HTTPS;
- на хосте нет отдельного файлового транспортного сервиса и лишнего открытого транспортного порта;
- из `/opt/MIRA-TV` команда `docker compose config --quiet` проходит без ошибок;
- из `/opt/MIRA-TV` команда `docker compose up -d` управляет всем серверным runtime без `-p`, `-f` и отдельного `--env-file`;
- повторный `update` не пересоздаёт существующие секреты из `.env`;
- `remove` сохраняет данные, `purge` удаляет volumes только после явного выбора пользователя.

## Проверка Compose

```bash
cd /opt/MIRA-TV
sudo docker compose config --quiet
sudo docker compose up -d
sudo docker compose ps
```

## Ресурсный критерий TV Player

При отсутствии изменений Player не должен постоянно пересобирать статические слои или выполнять частые сетевые запросы.
