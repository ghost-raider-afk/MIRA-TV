# Установка и конфигурация Telegram/MAX-бота MIRA-TV

**Стадия:** мастер конфигурации работает в ветке разработки. Исполняемый Docker-образ бота, вебхуки, транспорт, очередь доставки и Mini App ещё не реализованы. Поэтому мастер **не запускает бот** и не меняет активный reverse proxy. Не считайте подготовку `.env.bot` готовой установкой бота.

## Что понадобится до запуска мастера

1. Рабочий основной сервер MIRA-TV с установленным Traefik или Caddy, Docker Compose ≥2.33.1, доступ root и интернет.
2. **Отдельное доменное имя бота** (например, `bot.example.com`) с A-записью на адрес обратного прокси. AAAA указывайте только при работающем IPv6. Нельзя использовать тот же hostname, что и у основного MIRA-TV.
3. Telegram-бот, созданный через [@BotFather](https://t.me/BotFather): токен формата `<числа>:<секрет>` и числовой **Telegram User ID** администратора. Это **не** имя `@username` и **не** ID группового чата. Администратор должен открыть чат с ботом и отправить `/start`, иначе бот не сможет первым написать ему.
4. Для MAX — зарегистрированный бот с токеном и собственным **MAX User ID** администратора. Если аккаунта/доступа ещё нет, выберите «Пропустить MAX» — Telegram продолжит настраиваться отдельно. Для работы Mini App дополнительно нужно имя зарегистрированного MAX-бота.
5. HTTPS-сертификат доверенного УЦ на отдельный домен. MAX принимает webhooks **только на HTTPS:443**; самоподписанные сертификаты не поддерживаются. Telegram поддерживает HTTPS webhooks на 443, 80, 88 и 8443, но здесь используем существующий 443.

Ключевой принцип: числовой ID администратора ограничивает допустимого отправителя и адрес доставки, **но не присваивает роль MIRA-TV**. CRM-роль и разрешённые торговые точки проверяются сервером после безопасной привязки учётной записи.

## Мастер общего установщика

После установки MIRA-TV выполните `sudo mira-tv` и выберите **10) Настроить Telegram/MAX-бот (подготовка)**. Либо `sudo mira-tv bot`. Мастер последовательно спросит:

1. Отдельный домен бота (без `https://`).
2. Имя выделенной Docker-сети: по умолчанию `mira-tv-bot`. Можно указать другое имя. Сеть `mira-tv-internal` и сеть `mira-tv-proxy` отклоняются. Если выбранной bridge-сети нет, мастер предложит создать её.
3. Токен Telegram (скрытый ввод) и числовой Telegram User ID администратора.
4. «Настроить MAX?» — `N` пропускает MAX. При `Y`: токен MAX (скрытый ввод), числовой MAX User ID, необязательное публичное имя бота для Mini App.
5. Мастер автоматически генерирует разные webhook secrets Telegram/MAX и отдельный секрет будущего внутреннего API; повторная настройка сохраняет прежние секреты. URL и секреты **не добавляются в аргументы команд Docker или shell-history**.
6. По завершении показывает тип работающего прокси, DNS/HTTPS требования, внутренние порты, пути вебхуков и местоположение документации. Прокси и основной сервер не перезапускаются.

Настройки хранятся отдельно:

- `/opt/MIRA-TV/.env.bot` — конфигурация бота с правами **0600**, вне Git.
- `/var/lib/mira-tv/bot.env` — защищённая резервная копия с правами **0600**. При штатном обновлении, удалении без очистки данных и автоматическом откате секреты сохраняются.
- `.env.bot.example` — **без секретов**, только шаблон. Основной `.env` не содержит токенов бота.

## Поля .env.bot

| Переменная | Смысл | Кто заполняет |
| --- | --- | --- |
| `BOT_DOMAIN` | Отдельный HTTPS-домен, например `bot.example.com` | Администратор |
| `BOT_DOCKER_NETWORK` | Внешняя bridge-сеть для `app`, `proxy` и `bot` | Администратор (default: `mira-tv-bot`) |
| `BOT_PORT` | Внутренний порт бота `8090`, **не** открывать наружу | Фиксировано |
| `MIRA_TV_API_BASE_URL` | Внутренний сервер CRM `http://app:8080` | Фиксировано |
| `BOT_INTERNAL_API_TOKEN` | Секрет будущего авторизованного внутреннего API, не привилегия сам по себе | Автоматически |
| `TELEGRAM_BOT_ENABLED` | Включено | Автоматически |
| `TELEGRAM_BOT_TOKEN` | Токен BotFather | Администратор |
| `TELEGRAM_ADMIN_ID` | Числовой Telegram User ID администратора | Администратор |
| `TELEGRAM_WEBHOOK_PATH` | `/webhooks/telegram` | Фиксировано |
| `TELEGRAM_WEBHOOK_SECRET` | Проверка заголовка `X-Telegram-Bot-Api-Secret-Token` | Автоматически |
| `MAX_BOT_ENABLED` | `false`, если MAX пропущен | Мастер |
| `MAX_BOT_TOKEN` | Токен MAX бота (пустой при пропуске) | Администратор |
| `MAX_ADMIN_ID` | Числовой MAX User ID (пустой при пропуске) | Администратор |
| `MAX_BOT_USERNAME` | Имя зарегистрированного MAX бота для `open_app` | Администратор, необязательно |
| `MAX_WEBHOOK_PATH` | `/webhooks/max` | Фиксировано |
| `MAX_WEBHOOK_SECRET` | Проверка заголовка `X-Max-Bot-Api-Secret` | Автоматически при включении MAX |
| `BOT_OFFLINE_CONFIRM_SECONDS` | **120**, подтверждение offline | Фиксировано |
| `BOT_NOTIFY_RECOVERY` | **true**, оповещение о восстановлении связи | Фиксировано |
| `BOT_SUPPRESS_DUPLICATES` | **true**, подавление повторных уведомлений | Фиксировано |

Все значения для `MAX_BOT_*` (кроме пути) и MAX ID остаются пустыми/выключенными при пропуске. Токены не должны попадать в Git, журналы, URL, диагностику и скриншоты.

## Прокси и Docker: после появления исполняемого бота

**Текущий`compose.bot.yaml` — неподключённый overlay**. Он добавляет выделенную внешнюю сеть `mira-tv-bot` к `app` и `proxy` и запускает `bot:8090` на той же сети; `db:5432` остаётся только во внутренней сети `mira-tv-internal`. Внешних портов у бота нет. Старые volumes, TV-сессии и Player не изменяются.

Перед активацией бот должен содержать рабочий Dockerfile/образ, безопасную проверку secret headers, проверенные Telegram/MAX webhooks, healthcheck, привязку аккаунтов, server-side CRM permissions и долговечную очередь уведомлений. Нельзя включать profile `bot` до выполнения этих условий.

### Traefik

Установленный Traefik использует file-provider и том `mira-tv-proxy-config` с `/dynamic/dynamic.yml`. После готовности бота можно переключить file-provider с `filename=/dynamic/dynamic.yml` на **`directory=/dynamic`**, сохранив остальные существующие flags, и добавить отдельный файл `/dynamic/bot.yml`:

~~~yaml
http:
  routers:
    mira-tv-bot:
      rule: "Host(`bot.example.com`) && (Path(`/webhooks/telegram`) || Path(`/webhooks/max`) || PathPrefix(`/miniapp`))"
      entryPoints: [websecure]
      service: mira-tv-bot
      tls:
        certResolver: letsencrypt
  services:
    mira-tv-bot:
      loadBalancer:
        servers:
          - url: "http://bot:8090"
~~~

Замените `bot.example.com` доменом из вашего `.env.bot`. **Не удаляйте** имеющиеся `mira-tv-login`, `mira-tv-device-activation`, правила rate limit и общий router MIRA-TV. Бот должен быть доступен по Docker DNS `bot` на выбранной общей сети. Другие пути на домене бота должны возвращать 404.

### Caddy

Caddy использует `deploy/caddy/Caddyfile` для основного приложения. После появления бота добавьте **второй отдельный site block**, не заменяя основной:

~~~caddy
bot.example.com {
    @webhooks path /webhooks/telegram /webhooks/max
    handle @webhooks {
        reverse_proxy bot:8090
    }
    handle /miniapp* {
        reverse_proxy bot:8090
    }
    handle {
        respond "Not Found" 404
    }
}
~~~

Обязательно замените `bot.example.com` на свой домен. За выдачу и продление TLS отвечает установленный Caddy; порты 80/443 уже обслуживаются существующим `proxy`, второй Caddy-контейнер не создавайте.

### DNS, порты и регистрация webhook

- DNS A-запись `bot.example.com` должна указывать на IPv4 внешнего прокси. AAAA — только если IPv6 действительно доступен. Открыты TCP 80/443; дополнительный порт 8090 в firewall и `ports:` **не публикуется**.
- Telegram: `setWebhook` с `https://bot.example.com/webhooks/telegram`, `secret_token` из `TELEGRAM_WEBHOOK_SECRET`, `allowed_updates` по реально нужным событиям; затем `getWebhookInfo` должен показывать правильный URL и отсутствие ошибок.
- MAX: `POST https://platform-api2.max.ru/subscriptions`, JSON с `url=https://bot.example.com/webhooks/max`, `secret` из `MAX_WEBHOOK_SECRET`, `update_types` по нужным событиям. Токен MAX передаётся только в заголовке `Authorization`. Затем `GET /subscriptions` подтверждает подписку.
- Webhook handler обязан проверять заголовок секретности, принимать только необходимые запросы, дедуплицировать повторные события и отвечать быстро. Не регистрировать webhook до успешного HTTPS/healthcheck.
- Telegram/MAX пользователь должен запустить бота до получения личных уведомлений. Если платформа не поддерживается или MAX пропущен, никаких запросов MAX не производится.

## Smoke после готовности runtime

Проверить `/readyz` основного приложения, Docker-сети и состояние `bot`, TLS на обоих доменах, Telegram `getMe/getWebhookInfo`, MAX `GET /subscriptions`, регистрацию `/start`, привязку аккаунта MIRA-TV, получение заявки, событие offline через 120 секунд, восстановление связи, дедупликацию, restart бота без потери очереди и отсутствие деградации TV LKG. Не объявлять установку завершённой, если любой критичный пункт не проверен.

Источники: [Telegram Bot API](https://core.telegram.org/bots/api), [Telegram Webhook Guide](https://core.telegram.org/bots/webhooks), [MAX Subscriptions](https://dev.max.ru/docs-api/methods/POST/subscriptions/), [MAX events](https://dev.max.ru/docs-api/use-cases/event-notifications/).

Полная установка MIRA-TV и команды для Docker — [INSTALLATION.md](INSTALLATION.md), устройство сетей — [REVERSE-PROXY.md](REVERSE-PROXY.md).

## Повторная настройка и доверие TLS MAX

При повторном запуске мастер предлагает сохранить уже введённые токены без их отображения. Если MAX ранее был включён, ответ `Enter` сохраняет его настройку; явный `n` выключает MAX и очищает его токен/ID из `.env.bot`. Секрет Telegram остаётся стабильным при повторной настройке до явной ротации.

**MAX API:** с 19 июля 2026 используется `platform-api2.max.ru` вместо старого домена. Официальная документация требует включить доверие к сертификату Минцифры в окружении клиента. В будущем Docker-образ бота должен включать корректно проверенную цепочку доверенных сертификатов (при необходимости — официально полученный дополнительный CA) и проверку HTTPS-запросов к MAX. **Не отключать TLS-проверку**, не использовать `NODE_TLS_REJECT_UNAUTHORIZED=0`. После установки проверить реальный `GET /me` и `GET /subscriptions` из контейнера; при ошибках сертификата не активировать MAX до исправления доверия. Источник: [MAX API changelog](https://dev.max.ru/docs-api/changelog-api).

При будущем подключении overlay используется конфигурация обеих env-файлов: `docker compose --env-file .env --env-file .env.bot -f compose.yaml -f compose.traefik.yaml -f compose.bot.yaml --profile bot config --quiet` (либо Caddy вместо Traefik). Флаг `--quiet` обязателен в инструкциях проверки: полный вывод `docker compose config` может содержать раскрытые переменные окружения и токены. Это **только проверка структуры**, запуск недопустим до готового bot runtime.
