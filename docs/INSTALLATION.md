# Установка и эксплуатация MIRA-TV 1.0.0

## Требования

- Ubuntu
- root/sudo
- публичный DNS A/AAAA для домена MIRA-TV
- свободные TCP-порты 80 и 443
- доступ к GitHub и Docker registry

Установщик сам устанавливает Docker Engine и Docker Compose plugin, если они отсутствуют.

## Быстрая установка

```bash
curl -fsSLo /tmp/mira-tv.sh https://raw.githubusercontent.com/ghost-raider-afk/MIRA-TV/main/mira-tv.sh
sudo bash /tmp/mira-tv.sh install
```

Установщик запросит:

1. HTTPS-домен MIRA-TV без `https://`.
2. Email для Let's Encrypt.
3. Логин администратора.

Пароль администратора, пароль PostgreSQL и session secret генерируются автоматически. Итоговый пароль администратора показывается один раз после успешного запуска.

## Структура установки

- рабочий каталог: `/opt/MIRA-TV`
- launcher: `/usr/local/bin/mira-tv`
- Compose project: `mira-tv`
- app container: `mira-tv`
- PostgreSQL container: `mira-tv-db`
- reverse proxy: `mira-tv-proxy`
- init container: `mira-tv-site-assets-init`
- database volume: `mira-tv-db-data`
- site assets volume: `mira-tv-site-assets`
- TLS volume: `mira-tv-letsencrypt`
- internal network: `mira-tv-internal`
- proxy network: `mira-tv-proxy`

Все сервисы входят в **один `compose.yaml`**. Отдельных Docker Compose проектов, отдельных proxy-каталогов и вручную создаваемых сетей нет.

## Обычное управление Docker Compose

Все команды выполняются из `/opt/MIRA-TV`:

```bash
cd /opt/MIRA-TV
```

Запуск/приведение runtime к описанному состоянию:

```bash
sudo docker compose up -d
```

Проверка состояния:

```bash
sudo docker compose ps
```

Логи:

```bash
sudo docker compose logs -f --tail=200
```

Перезапуск:

```bash
sudo docker compose restart
```

Остановка без удаления контейнеров:

```bash
sudo docker compose stop
```

Запуск остановленных контейнеров:

```bash
sudo docker compose start
```

Остановка и удаление контейнеров/сетей Compose-проекта с сохранением данных:

```bash
sudo docker compose down
```

Пересборка приложения после изменения исходного кода/Dockerfile:

```bash
sudo docker compose up -d --build --wait
```

Проверка итоговой Compose-конфигурации до запуска:

```bash
sudo docker compose config --quiet
```

**Volumes с данными не удаляются обычным `down`.** Полное удаление данных выполняется только явно:

```bash
sudo docker compose down -v
```

## Команды установщика

После установки доступен launcher `mira-tv`:

```bash
sudo mira-tv update
sudo mira-tv status
sudo mira-tv restart
sudo mira-tv logs
sudo mira-tv check-update
sudo mira-tv remove
sudo mira-tv purge
```

Без аргументов открывается интерактивное меню:

```bash
sudo mira-tv
```

`remove` удаляет приложение, но сохраняет именованные volumes. `purge` удаляет приложение вместе с volumes.

## Обновление

```bash
sudo mira-tv update
```

Обновление переключает репозиторий на последний стабильный GitHub Release, сохраняет существующий `.env`, добавляет отсутствующие новые параметры из `.env.example`, проверяет Compose-конфигурацию и выполняет:

```bash
docker compose up -d --build --wait
```

## Конфигурация

Единственный runtime-файл конфигурации:

```text
/opt/MIRA-TV/.env
```

`.env` является источником runtime-лимитов и секретов. Не дублировать значения лимитов в Compose или коде без необходимости.

## Сетевой транспорт ТВ

Отдельного файлового транспорта нет. TV Player работает через HTTPS/WebSocket, локальный Cache Storage и IndexedDB. Сервер не публикует JPEG-файлы в отдельные каталоги и не требует отдельного файлового сервиса.
