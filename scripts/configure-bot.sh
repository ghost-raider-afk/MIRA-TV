#!/usr/bin/env bash
set -Eeuo pipefail
# Private configuration wizard. Never starts an unavailable bot image.
INSTALL_DIR="${1:?Installation directory is required}"
PERSIST_DIR="${2:?Persistent directory is required}"
ENV_MAIN="$INSTALL_DIR/.env"
ENV_BOT="$INSTALL_DIR/.env.bot"
TEMP_FILE=""
umask 077

fail() { printf 'ОШИБКА: %s\n' "$*" >&2; exit 1; }
note() { printf '  %s\n' "$*"; }
cleanup() { [[ -z "$TEMP_FILE" ]] || rm -f -- "$TEMP_FILE"; }
trap cleanup EXIT
[[ -f "$ENV_MAIN" && -f "$INSTALL_DIR/.env.bot.example" ]] ||
  fail 'Сначала установите MIRA-TV; нужны .env и .env.bot.example.'
command -v docker >/dev/null || fail 'Не найден Docker.'
command -v openssl >/dev/null || fail 'Не найден OpenSSL.'

setting() {
  local file="$1" key="$2" default="${3:-}" value=''
  if [[ -f "$file" ]]; then
    value="$(sed -n "s/^${key}=//p" "$file" | tail -n 1)"
  fi
  printf '%s' "${value:-$default}"
}
ask() {
  local dest="$1" prompt="$2" current="${3:-}" answer=''
  IFS= read -r -p "$prompt$([[ -n "$current" ]] && printf ' [Enter — сохранить прежнее]'): " answer ||
    fail 'Ввод прерван.'
  printf -v "$dest" '%s' "${answer:-$current}"
}
secret() {
  local dest="$1" prompt="$2" current="${3:-}" answer=''
  IFS= read -r -s -p "$prompt$([[ -n "$current" ]] && printf ' [Enter — сохранить прежний]'): " answer ||
    fail 'Ввод прерван.'
  printf '\n'
  printf -v "$dest" '%s' "${answer:-$current}"
}
domain_ok() {
  [[ "$1" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ && "$1" == *.* &&
    "$1" != *..* && ${#1} -le 253 ]] || fail 'Укажите домен без https://, пути и порта.'
}
id_ok() {
  [[ "$1" =~ ^[1-9][0-9]{0,18}$ ]] || fail 'ID администратора должен быть положительным числом, не @username.'
  [[ ${#1} -lt 19 || "$1" < "9223372036854775808" ]] || fail 'ID превышает допустимый int64.'
}
telegram_token_ok() {
  [[ "$1" =~ ^[0-9]{5,16}:[A-Za-z0-9_-]{25,}$ ]] ||
    fail 'Проверьте формат токена Telegram BotFather.'
}
max_token_ok() {
  [[ ${#1} -ge 10 && ${#1} -le 2048 && "$1" =~ ^[A-Za-z0-9._~:/+=-]+$ ]] ||
    fail 'Токен MAX имеет некорректный формат.'
}
network_ok() {
  [[ "$1" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]{1,62}$ ]] ||
    fail 'Недопустимое имя Docker-сети.'
  [[ "$1" != mira-tv-internal && "$1" != mira-tv-proxy ]] ||
    fail 'Выберите отдельную сеть для бота, не сеть БД и не существующую сеть прокси.'
}
put() {
  [[ "$2" != *$'\n'* && "$2" != *$'\r'* ]] ||
    fail "Некорректный перенос строки в $1."
  printf '%s=%s\n' "$1" "$2" >> "$TEMP_FILE"
}

main() {
  local main_domain proxy domain network tg_token tg_id max_token='' max_id=''
  local max_user='' tg_secret max_secret='' internal_key choice enabled=false state
  main_domain="$(setting "$ENV_MAIN" MIRA_TV_DOMAIN)"
  domain_ok "$main_domain"
  proxy="$(setting "$ENV_MAIN" COMPOSE_FILE)"
  case "$proxy" in
    compose.yaml:compose.traefik.yaml) proxy='Traefik' ;;
    compose.yaml:compose.caddy.yaml) proxy='Caddy' ;;
    *) fail 'Основной сервер должен использовать поддерживаемый Traefik или Caddy.' ;;
  esac

  printf '\nНастройка Telegram/MAX бота MIRA-TV\n'
  note "Главный сервер: https://$main_domain"
  note "Прокси: $proxy. Внешние TCP-порты 80/443 уже принадлежат ему."
  note 'Telegram обязателен; MAX можно настроить позднее.'
  ask domain 'Отдельный домен бота (например bot.example.com)' "$(setting "$ENV_BOT" BOT_DOMAIN)"
  domain_ok "$domain"
  [[ "${domain,,}" != "${main_domain,,}" ]] || fail 'Для бота нужен другой домен.'
  ask network 'Docker-сеть для бота' "$(setting "$ENV_BOT" BOT_DOCKER_NETWORK mira-tv-bot)"
  network_ok "$network"

  secret tg_token 'Telegram BotFather token (скрытый ввод)' "$(setting "$ENV_BOT" TELEGRAM_BOT_TOKEN)"
  telegram_token_ok "$tg_token"
  ask tg_id 'Числовой Telegram User ID администратора' "$(setting "$ENV_BOT" TELEGRAM_ADMIN_ID)"
  id_ok "$tg_id"

  IFS= read -r -p 'Настроить MAX сейчас? [y/N]: ' choice || fail 'Ввод прерван.'
  if [[ "${choice,,}" == y || "${choice,,}" == yes ]]; then
    enabled=true
    secret max_token 'MAX bot token (скрытый ввод)' "$(setting "$ENV_BOT" MAX_BOT_TOKEN)"
    max_token_ok "$max_token"
    ask max_id 'Числовой MAX User ID администратора' "$(setting "$ENV_BOT" MAX_ADMIN_ID)"
    id_ok "$max_id"
    ask max_user 'Имя MAX бота для Mini App (необязательно)' "$(setting "$ENV_BOT" MAX_BOT_USERNAME)"
    [[ -z "$max_user" || "$max_user" =~ ^[A-Za-z0-9_]{3,64}$ ]] ||
      fail 'Некорректное имя MAX-бота.'
  fi

  tg_secret="$(setting "$ENV_BOT" TELEGRAM_WEBHOOK_SECRET)"
  max_secret="$(setting "$ENV_BOT" MAX_WEBHOOK_SECRET)"
  internal_key="$(setting "$ENV_BOT" BOT_INTERNAL_API_TOKEN)"
  [[ "$tg_secret" =~ ^[A-Za-z0-9_-]{32,256}$ ]] || tg_secret="$(openssl rand -hex 32)"
  if [[ "$enabled" == true ]]; then
    [[ "$max_secret" =~ ^[A-Za-z0-9_-]{32,256}$ ]] || max_secret="$(openssl rand -hex 32)"
  else
    max_secret=''
  fi
  [[ "$internal_key" =~ ^[a-f0-9]{64}$ ]] || internal_key="$(openssl rand -hex 32)"

  if docker network inspect "$network" >/dev/null 2>&1; then
    state="$(docker network inspect -f '{{.Internal}}' "$network")" ||
      fail 'Невозможно проверить Docker-сеть.'
    [[ "$state" == false ]] || fail 'Для бота нельзя использовать внутреннюю Docker-сеть.'
  else
    IFS= read -r -p "Создать внешнюю bridge-сеть $network? [Y/n]: " choice ||
      fail 'Ввод прерван.'
    case "${choice,,}" in
      ''|y|yes) docker network create --driver bridge "$network" >/dev/null ||
        fail 'Создание Docker-сети не удалось.' ;;
      *) fail 'Для работы бота необходима Docker-сеть.' ;;
    esac
  fi

  TEMP_FILE="$(mktemp "$INSTALL_DIR/.env.bot.XXXXXX")"
  chmod 600 "$TEMP_FILE"
  printf '# MIRA-TV private bot secrets. NEVER commit or print.\n' > "$TEMP_FILE"
  put BOT_DOMAIN "$domain"
  put BOT_DOCKER_NETWORK "$network"
  put BOT_PORT 8090
  put MIRA_TV_API_BASE_URL http://app:8080
  put BOT_INTERNAL_API_TOKEN "$internal_key"
  put BOT_OFFLINE_CONFIRM_SECONDS 120
  put BOT_NOTIFY_RECOVERY true
  put BOT_SUPPRESS_DUPLICATES true
  put TELEGRAM_BOT_ENABLED true
  put TELEGRAM_BOT_TOKEN "$tg_token"
  put TELEGRAM_ADMIN_ID "$tg_id"
  put TELEGRAM_WEBHOOK_PATH /webhooks/telegram
  put TELEGRAM_WEBHOOK_SECRET "$tg_secret"
  put MAX_BOT_ENABLED "$enabled"
  put MAX_BOT_TOKEN "$max_token"
  put MAX_ADMIN_ID "$max_id"
  put MAX_WEBHOOK_PATH /webhooks/max
  put MAX_WEBHOOK_SECRET "$max_secret"
  put MAX_BOT_USERNAME "$max_user"
  mv -f -- "$TEMP_FILE" "$ENV_BOT"; TEMP_FILE=''
  chmod 600 "$ENV_BOT"
  install -d -m 700 "$PERSIST_DIR"
  install -m 600 "$ENV_BOT" "$PERSIST_DIR/bot.env"
  printf '\nКонфигурация сохранена: %s (600); защищённая копия: %s/bot.env\n' "$ENV_BOT" "$PERSIST_DIR"
  note "Бот: https://$domain — Traefik/Caddy: $proxy — Docker-сеть: $network."
  note 'DNS A/AAAA → IP прокси; доверенный HTTPS-сертификат. Внешние порты только 80/443.'
  note 'В Telegram отправьте /start своему боту; если включён MAX — запустите его там.'
  note 'Только проверенный отправитель + привязка CRM получит права администратора.'
  note 'Webhook Telegram: /webhooks/telegram и X-Telegram-Bot-Api-Secret-Token.'
  note 'Webhook MAX: /webhooks/max и X-Max-Bot-Api-Secret; только HTTPS:443.'
  note 'Правила диагностики: offline 120 сек, recovery включено, повторы подавляются.'
  note 'Бот ещё не реализован: Docker-контейнер и маршруты прокси не запускаются.'
  note 'Примеры конфигурации: docs/BOT.md.'
}
main "$@"
