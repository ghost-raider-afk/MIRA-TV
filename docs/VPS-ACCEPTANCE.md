# ТВ МЕНЮ 2 — критерии приёмки на чистой VPS

Цель: подтвердить, что проект устанавливается с нуля на пустую VPS и полностью проходит основной пользовательский сценарий в браузере.

## Fresh install

Для чистой VPS не выполняется перенос старой БД или файлов. Миграция нужна только при обнаруженной установленной старой версии.

## Установка тестовой ветки

До слияния в `main` установочный тест выполняется из ветки `agent/backend-modularization`:

```bash
curl -fsSL https://raw.githubusercontent.com/ghost-raider-afk/menu-tv-2/agent/backend-modularization/menu-tv-2.sh -o /tmp/menu-tv-2.sh
sudo env MENU_TV_REF=agent/backend-modularization bash /tmp/menu-tv-2.sh install
```

Установщик сохраняет выбранный ref в `/opt/menu-tv-2.0/.installer-ref`, поэтому последующие `sudo menu-tv-2.0 update` продолжают использовать ту же тестовую ветку.

После установки:

```bash
sudo menu-tv-2.0 status
```

должен показывать `Ref: agent/backend-modularization` и успешные проверки Health/SFTP.

## Автоматический smoke до VPS

GitHub Actions обязан успешно пройти два job на одном commit.

### `node-check`

- `npm ci`;
- синтаксическая проверка всех JS-файлов;
- API/unit tests;
- импорт полного графа frontend ES Modules;
- проверка финальной frontend-структуры;
- физическое отсутствие legacy `style.css`, `css/tv1/*`, `chrome.js`;
- тест env-driven лимитов;
- тест login limiter;
- тест длины генерируемого SFTP-пароля.

### `clean-install-smoke`

- `bash -n menu-tv-2.sh`;
- проверка `MENU_TV_REF`;
- создание чистого `.env` из `.env.example`;
- `docker compose config -q`;
- сборка production Docker image;
- запуск чистых PostgreSQL + SFTPGo + app через `docker compose up --wait`;
- `/healthz`;
- проверка `/css/index.css` и отсутствия `/style.css`;
- проверка модульных `shell/sidebar/header` внутри production image;
- вход bootstrap-администратором;
- создание торговой точки;
- создание монитора без шаблона;
- загрузка editor API;
- проверка тонкого `screen-editor.html` с `/css/index.css` и без legacy shell;
- `sftpgo ping`;
- полное удаление тестовых контейнеров и томов.

## Ожидаемый сценарий установки

1. Подготовить чистую поддерживаемую Ubuntu VPS.
2. Запустить штатный `menu-tv-2.sh` с нужным `MENU_TV_REF`.
3. Скрипт устанавливает/проверяет Docker и необходимые зависимости.
4. Создаётся `.env` со всеми runtime-лимитами, кроме намеренно отсутствующих CPU-квот контейнеров.
5. Поднимаются PostgreSQL, SFTPGo, app и init-контейнеры.
6. PostgreSQL проходит healthcheck до запуска приложения.
7. Приложение отвечает на `/healthz`.
8. Traefik публикует приложение по HTTPS при настроенном домене.
9. Создаётся начальный администратор, после чего bootstrap-пароль удаляется из `.env` штатной логикой установщика.

## Проверка контейнеров

Ожидается:

- `menu-tv-2-db` — healthy;
- `menu-tv-2-sftp` — healthy;
- `menu-tv-2.0` — healthy/running;
- init-контейнеры — completed successfully;
- Traefik — running.

Не должно быть crash-loop, постоянных restart или циклических ошибок подключения к PostgreSQL/SFTPGo.

## Проверка frontend в браузере

1. Страница входа соответствует оформлению ТВ МЕНЮ 1.
2. После входа отображается единый rail + контекстная панель + header.
3. В DOM нет старого sidebar/topbar ТВ МЕНЮ2.
4. Навигация работает при любом количестве переключений.
5. В контексте `Каталог` отдельные пункты `Продукция` и `Тара`.
6. Название торговой точки отображается полностью и заметно; `Добавить ТВ` находится под названием точки.
7. Раздел `Шаблоны` автоматически открывает последний сохранённый/доступный шаблон.

## Основной пользовательский сценарий

1. Войти администратором.
2. Создать торговую точку.
3. Настроить SFTP-папку и доступ точки.
4. Добавить продукцию и тару в каталог.
5. Создать монитор без обязательного шаблона.
6. Открыть редактор.
7. Добавить разделы, продукцию и тару.
8. Выбрать `Использовать шаблон` и нажать `Применить`.
9. Убедиться, что шаблон изменил только локальный Editor State.
10. Нажать `Сохранить монитор и меню`.
11. Убедиться, что draft сохранён и JPEG автоматически собран из той же render model, что preview.
12. Выполнить публикацию.
13. Проверить появление JPEG в каталоге SFTP.

Ручная загрузка JPEG допускается только как резервный путь при невозможности автоматической генерации в браузере; основной путь — автоматический.

## Проверка `.env`

Параметры ниже должны управляться только из `/opt/menu-tv-2.0/.env`:

```text
PASSWORD_MIN_LENGTH
PASSWORD_MAX_LENGTH
GENERATED_PASSWORD_LENGTH
SESSION_TTL_HOURS
SECURE_COOKIES
LOGIN_MAX_ATTEMPTS
LOGIN_WINDOW_MINUTES
LOGIN_LIMITER_MAX_ENTRIES
JSON_BODY_MAX_BYTES
MENU_DRAFT_MAX_BYTES
SCREEN_SOURCE_MAX_BYTES
DASHBOARD_REFRESH_MIN_SECONDS
DASHBOARD_REFRESH_MAX_SECONDS
SCREEN_MAX_WIDTH
SCREEN_MAX_HEIGHT
SITE_LOGO_MAX_BYTES
SITE_FAVICON_MAX_BYTES
```

Frontend не должен содержать собственные копии значений этих лимитов. Backend валидирует их по конфигурации `.env`.

Максимальное разрешение по текущей конфигурации: `1920×1080`.

## Проверка сохранности

После:

```bash
cd /opt/menu-tv-2.0
sudo docker compose --env-file .env restart
```

должны сохраниться пользователь, точки, мониторы, каталог, шаблоны, черновики, SFTP-привязки и опубликованные данные.

## Проверка логов

```bash
cd /opt/menu-tv-2.0
sudo docker compose --env-file .env ps
sudo docker compose --env-file .env logs --tail=200 app
sudo docker compose --env-file .env logs --tail=200 db
sudo docker compose --env-file .env logs --tail=200 sftp
```

Критерий: нет необработанных исключений, циклических ошибок подключения, ошибок схемы приложения и постоянных 5xx в основном пользовательском сценарии. Начальные сообщения SFTPGo о создании собственной схемы на пустой PostgreSQL допустимы, если инициализация завершается успешно и сервис становится healthy.

## Проверка обновления отдельно от fresh install

Обновление существующей установки тестируется отдельно. Только в этом сценарии разрешён перенос данных старой версии. Fresh install всегда начинается с пустой PostgreSQL.

## Итоговый критерий готовности

Версия готова к ручной установке на VPS, когда на одном commit:

- `node-check` = `success`;
- `clean-install-smoke` = `success`;
- production image собирается;
- PostgreSQL/SFTPGo/app поднимаются с пустыми томами;
- финальные frontend assets реально отдаются production container;
- основной API workflow проходит;
- чистая установка не требует ручного изменения файлов проекта.
