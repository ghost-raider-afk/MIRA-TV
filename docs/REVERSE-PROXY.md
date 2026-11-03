# Полная установка MIRA-TV: Docker, Traefik или Caddy

Этот документ рассчитан на пользователя со средним уровнем навыков работы с ПК. Здесь описано **развёртывание всей системы с чистого Ubuntu-сервера**, включая Docker, создание сетей, PostgreSQL, MIRA-TV, HTTPS, проверку TV Player, обновления и подготовку отдельного контейнера Telegram/MAX.

**Статус:** основной сервер, PostgreSQL, Traefik и Caddy — рабочие компоненты предлагаемой конфигурации. Telegram/MAX-бот пока не написан; `compose.bot.yaml` — только подготовленная схема. Не запускайте его в production.

## Шаг 1. Подготовьте сервер и домен

Нужны Ubuntu, доступ к терминалу сервера с правами `sudo`, доменное имя и доступ к DNS. Создайте A-запись домена, указывающую на внешний IPv4 сервера. AAAA-запись добавляйте только при рабочем IPv6. Если сервер за роутером, перенаправьте входящий TCP 80 и 443 на него; для Caddy можно также открыть UDP 443 для HTTP/3. Панель хостинга или файрвол должны разрешать эти же порты.

Например, используем `menu.example.com` и email `admin@example.com` **только как образец**. Замените их на собственные данные перед запуском.

Подключитесь к серверу по SSH и проверьте систему:

~~~bash
cat /etc/os-release
hostname -I
sudo ss -lntp | grep -E ':(80|443)\b' || true
~~~

Последняя команда помогает найти процесс, уже занявший 80/443. Если эти порты заняты Apache, nginx или другим прокси, разберитесь с конфликтом до запуска. Не выключайте неизвестный сервис без понимания его роли.

## Шаг 2. Установите Docker Engine и Docker Compose

~~~bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git openssl dnsutils
curl -fsSL https://get.docker.com -o get-docker.sh
# При необходимости просмотрите содержимое скрипта перед запуском:
less get-docker.sh
sudo sh get-docker.sh
rm get-docker.sh
sudo systemctl enable --now docker
sudo docker version
sudo docker compose version
~~~

Требуется Docker Compose **2.33.1 или новее**, поскольку MIRA-TV использует сетевой параметр `gw_priority`. Основной установщик MIRA-TV выполняет эти действия автоматически. Если используете официальный apt-репозиторий Docker вместо convenience script, смотрите [документацию Docker](https://docs.docker.com/engine/install/ubuntu/).

## Шаг 3. Разберитесь с сетями и портами

В MIRA-TV используются две Docker-сети:

- `mira-tv-proxy`: общая bridge-сеть для `proxy` и `app`. Она **external**, поэтому создаётся отдельно и не удаляется обычной командой `docker compose down`.
- `mira-tv-internal`: закрытая внутренняя сеть для PostgreSQL и приложения. Её создаёт Compose, вручную создавать не требуется.

Команды создания и проверки внешней сети:

~~~bash
sudo docker network inspect mira-tv-proxy >/dev/null 2>&1 || sudo docker network create --driver bridge mira-tv-proxy
sudo docker network inspect mira-tv-proxy --format '{{.Name}} ({{.Driver}})'
sudo docker network ls
~~~

### Какие порты используются

| Контейнер | Внутренний адрес/порт | Публикуется на сервере | Сеть |
| --- | --- | --- | --- |
| `proxy` — Traefik | `proxy:80/tcp`, `proxy:443/tcp` | `80:80/tcp`, `443:443/tcp` | `mira-tv-proxy` |
| `proxy` — Caddy (вместо Traefik) | `proxy:80/tcp`, `proxy:443/tcp`, `proxy:443/udp` | `80:80/tcp`, `443:443/tcp`, `443:443/udp` | `mira-tv-proxy` |
| `app` — MIRA-TV / Express | `app:8080/tcp` (также WebSocket) | **Нет** | `mira-tv-proxy` и `mira-tv-internal` |
| `db` — PostgreSQL 17 | `db:5432/tcp` | **Нет** | только `mira-tv-internal` |
| `site-assets-init` | Нет сервера/порта | Нет | сеть отключена |
| `proxy-config-init` — только Traefik | Нет сервера/порта | Нет | сеть отключена |
| `bot` — Telegram/MAX, **план** | `bot:8090/tcp` | **Нет** | `mira-tv-proxy` |

Сейчас интернет → HTTPS `proxy:443` → `app:8080` → `db:5432`. В будущем бот будет доступен только через HTTPS-маршрут прокси на `bot:8090`, а к данным обращаться через защищённый API `app:8080`; прямой доступ к PostgreSQL ему не нужен. **8090 — зарезервированный проектный порт, сейчас ни один бот его не слушает.**

Ни `5432`, ни `8080`, ни `8090` не нужно открывать на VPS, роутере или в firewall. Административная панель Traefik на `8080` также не публикуется.

## Шаг 4. Установите MIRA-TV штатным способом (рекомендуется)

На чистой Ubuntu выполните:

~~~bash
bash <(curl -Ls https://raw.githubusercontent.com/ghost-raider-afk/MIRA-TV/main/mira-tv.sh)
~~~

В меню выберите **1) Установить**. Установщик запросит домен, email для HTTPS, логин администратора и предложит выбор reverse proxy: **1 — Traefik (рекомендуется), 2 — Caddy**. Пароли PostgreSQL и начального администратора, секрет сессий генерируются установщиком. Сохраните показанный пароль администратора в защищённом месте.

Установщик разворачивает **последний опубликованный релиз**, а не незавершённый код `main`. Поэтому новая версия меню установки появится после выпуска релиза, включающего это изменение. Рабочие файлы появятся в `/opt/MIRA-TV`, команда управления — `mira-tv`.

~~~bash
sudo mira-tv status
cd /opt/MIRA-TV
sudo docker compose ps
~~~

Если выбираете автоматическую установку, переходите к **шагу 8 — Проверка**. Шаги 5–7 предназначены для ручной установки.

## Шаг 5. Ручная установка из GitHub (альтернатива)

Это путь для тех, кому нужно самостоятельно управлять Compose. Учитывайте, что ветка `main` может содержать ещё не выпущенные изменения: на production используйте утверждённый релизный тег, содержащий указанные ниже файлы.

~~~bash
sudo git clone https://github.com/ghost-raider-afk/MIRA-TV.git /opt/MIRA-TV
cd /opt/MIRA-TV
ls -l compose.yaml compose.traefik.yaml compose.caddy.yaml compose.bot.yaml deploy/caddy/Caddyfile
sudo cp .env.example .env
sudo chmod 600 .env
openssl rand -hex 32
openssl rand -hex 32
sudo nano .env
~~~

Две команды `openssl` выдадут **два разных** секрета. Вставьте первый в `POSTGRES_PASSWORD`, второй в `SESSION_SECRET`. В `.env` заполните также домен, email и данные первого администратора. Пример **строк для изменения внутри полного `.env`**, а не замена всего файла:

~~~dotenv
MIRA_TV_DOMAIN=menu.example.com
MIRA_TV_ACME_EMAIL=admin@example.com
POSTGRES_PASSWORD=ЗАМЕНИТЕ_ПЕРВЫМ_СЕКРЕТОМ
SESSION_SECRET=ЗАМЕНИТЕ_ВТОРЫМ_СЕКРЕТОМ
BOOTSTRAP_ADMIN_USERNAME=admin
BOOTSTRAP_ADMIN_PASSWORD=ЗАМЕНИТЕ_СЛОЖНЫМ_ПАРОЛЕМ
SECURE_COOKIES=true
COMPOSE_FILE=compose.yaml:compose.traefik.yaml
~~~

В этом примере выбран Traefik. Если нужен Caddy, замените **только** последнюю строку на:

~~~dotenv
COMPOSE_FILE=compose.yaml:compose.caddy.yaml
~~~

Не удаляйте остальные переменные из `.env.example`: приложение использует их для настройки API, Player, PostgreSQL, погоды, безопасности и лимитов. Никогда не публикуйте `.env` и не пересылайте его в чат.

## Шаг 6. Из каких файлов состоит Docker-конфигурация

Все файлы **уже лежат в репозитории**. Создавать их вручную не надо. Ниже приведены реальные имена, команды просмотра и примеры ключевых блоков, поясняющие маршруты и внутренние порты.

### `compose.yaml` — основное приложение

Этот файл поднимает `db`, `site-assets-init`, `app`, постоянные volumes БД/изображений и обе сети. Он **не содержит reverse proxy и бота**. В нём используются:

~~~yaml
services:
  db:
    # PostgreSQL 17; внутренний порт db:5432, без ports на хосте
    networks: [mira-tv-internal]
  app:
    # HTTP и WebSocket: app:8080, тоже без ports на хосте
    networks:
      mira-tv-internal:
      mira-tv-proxy:
        gw_priority: 1
networks:
  mira-tv-internal:
    name: mira-tv-internal
    internal: true
  mira-tv-proxy:
    name: mira-tv-proxy
    external: true
~~~

Это сокращённый поясняющий фрагмент; реальный `compose.yaml` также содержит healthcheck, ограничения ресурсов, инициализацию assets и Docker volumes. Для просмотра **полного актуального файла**: `cat /opt/MIRA-TV/compose.yaml`.

### `compose.traefik.yaml` — рекомендованный HTTPS-прокси

Файл содержит `proxy-config-init` и `proxy`. Traefik получает динамический конфиг через file-provider; он перенаправляет HTTP с 80 на HTTPS 443, выпускает сертификат Let's Encrypt и проксирует входящий трафик к `http://app:8080`.

~~~yaml
services:
  proxy:
    # образ Traefik 3, выбранный и закреплённый в файле
    ports:
      - "80:80"
      - "443:443"
    networks: [mira-tv-proxy]
  proxy-config-init:
    # формирует /dynamic/dynamic.yml; не открывает портов
~~~

Динамический маршрут будет содержать upstream `http://app:8080`. Дополнительно генерируются правила ограничения частоты логина и активации ТВ. Поэтому **не заменяйте** существующий генератор на упрощённый шаблон. Полный файл: `cat /opt/MIRA-TV/compose.traefik.yaml`.

TLS и настройки Traefik сохраняются в постоянных volumes `mira-tv-letsencrypt` и `mira-tv-proxy-config`.

### `compose.caddy.yaml` и `deploy/caddy/Caddyfile` — альтернатива Traefik

В Compose Caddy объявлены:

~~~yaml
services:
  proxy:
    image: caddy:2.11.7-alpine
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - ./deploy/caddy:/etc/caddy:ro
      - mira-tv-caddy-data:/data
      - mira-tv-caddy-config:/config
    networks: [mira-tv-proxy]
~~~

Готовый Caddyfile:

~~~caddyfile
{
    email {$MIRA_TV_ACME_EMAIL}
    admin off
}
{$MIRA_TV_DOMAIN} {
    reverse_proxy app:8080
}
~~~

Здесь домен и email подставляются из `.env`, TLS выпускается автоматически, а HTTP и WebSocket передаются на `app:8080`. Данные сертификатов сохраняются в `mira-tv-caddy-data`, настройки — в `mira-tv-caddy-config`. Обычный Caddy без дополнительных модулей **не воспроизводит rate-limit middleware Traefik**; серверная защита логина MIRA-TV остаётся активной. Полные файлы: `cat /opt/MIRA-TV/compose.caddy.yaml` и `cat /opt/MIRA-TV/deploy/caddy/Caddyfile`.

### `compose.bot.yaml` — будущий отдельный Telegram/MAX-бот

~~~yaml
services:
  bot:
    profiles: [bot]
    image: mira-tv-bot:local
    environment:
      BOT_PORT: "8090"
      MIRA_TV_API_BASE_URL: http://app:8080
    expose:
      - "8090"
    networks: [mira-tv-proxy]
~~~

**Важно:** `mira-tv-bot:local` пока не существует, поэтому файл только документирует будущую изоляцию. Не добавляйте `compose.bot.yaml` в `COMPOSE_FILE`, не запускайте `--profile bot` и не прописывайте действующий маршрут бота в Traefik/Caddy до готовности реализации. Подробнее: [BOT.md](BOT.md).

## Шаг 7. Запустите ручную установку

~~~bash
cd /opt/MIRA-TV
sudo docker network inspect mira-tv-proxy >/dev/null 2>&1 || sudo docker network create --driver bridge mira-tv-proxy
sudo docker compose config --quiet
sudo docker compose up -d --build --wait
sudo docker compose ps
~~~

`docker compose` автоматически читает `COMPOSE_FILE` из `.env` и включает **основной файл и ровно один прокси**. Указывать `-f compose.yaml` без выбранного прокси для production нельзя. Для просмотра объединённой конфигурации без запуска используйте `sudo docker compose config`.

## Шаг 8. Проверьте приложение и HTTPS

~~~bash
cd /opt/MIRA-TV
sudo docker compose ps
sudo docker compose logs --tail=100 app db proxy
sudo docker compose exec -T app node -e "fetch('http://127.0.0.1:8080/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
curl -I https://menu.example.com/
~~~

В последней команде поставьте **свой домен**. Если есть ошибка сертификата, проверьте DNS, открытые порты 80/443 и время сервера; повторно не удаляйте volumes и не запускайте полную установку.

При выборе Caddy можно проверить Caddyfile:

~~~bash
sudo docker compose exec proxy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
~~~

Проверьте в браузере вход администратора, создание/просмотр торговой точки, права менеджера, CRM и Preview. На телевизоре проверьте авторизацию, полноэкранный показ, общий renderer Preview/TV и восстановление связи. Полный чек-лист: [DEPLOYMENT-CHECKLIST.md](DEPLOYMENT-CHECKLIST.md).

## Шаг 9. Управление, обновление и переключение прокси

~~~bash
sudo mira-tv status
sudo mira-tv update
sudo mira-tv proxy
cd /opt/MIRA-TV
sudo docker compose logs -f --tail=100
sudo docker compose restart proxy
sudo docker volume ls
sudo docker network inspect mira-tv-proxy
~~~

`mira-tv proxy` предлагает выбор Traefik/Caddy и подтверждение смены. При неудачном запуске нового прокси выполняется попытка вернуть старый без изменения БД или регистрации телевизоров. **Переключение не является бесшовным:** HTTPS может кратковременно пропасть, а Caddy/Traefik используют разные TLS-volumes, поэтому новый сертификат оформляется отдельно. Производите смену в окно обслуживания и проверяйте HTTPS.

Обычное `docker compose down` не удаляет volumes и внешнюю сеть `mira-tv-proxy`, но останавливает сервисы. **Никогда не выполняйте `docker compose down -v` при обновлении**: это удаляет постоянные данные. Действующие команды установщика обновляют приложение и проверяют `/readyz`.

## Шаг 10. Отдельный бот

В меню предусмотрен пункт **10) Установить бот**. Сейчас он сообщает, что исполняемый бот ещё не выпущен, и **ничего не меняет**. Когда Telegram/MAX-бот будет реализован, его отдельный Dockerfile и Compose подключатся к `mira-tv-proxy`, а выбранный прокси получит HTTPS-маршрут на внутренний `bot:8090`. Дополнительных открытых портов на VPS не потребуется. Текущий статус — [BOT.md](BOT.md).

## Контроль безопасности

По завершении убедитесь, что опубликованы только необходимые порты, секреты скрыты, volumes `mira-tv-db-data` и `mira-tv-site-assets` существуют, Docker-сеть `mira-tv-internal` закрыта, внешний `mira-tv-proxy` существует, а телеплеер сохраняет Last Known Good при недоступности сети.
