#!/usr/bin/env bash
set -Eeuo pipefail
INSTALL_DIR="${1:?MIRA-TV installation directory}"
PERSIST_DIR="${2:?MIRA-TV secret backup directory}"
BOT_ENV="${INSTALL_DIR}/.env.bot"
umask 077
temp_file=''
cleanup() { [[ -z "$temp_file" ]] || rm -f -- "$temp_file"; }
trap cleanup EXIT
fail() { printf 'Ошибка бота: %s\n' "$*" >&2; exit 1; }
[[ -f "${INSTALL_DIR}/.env" ]] || fail 'Сначала установите MIRA-TV.'
command -v openssl >/dev/null || fail 'Требуется openssl.'
# Reinstalling the application never silently enables the bot. Reuse the
# protected credentials only when the operator explicitly starts this wizard.
if [[ ! -f "$BOT_ENV" && -f "$PERSIST_DIR/bot.env" ]]; then
  install -m 600 "$PERSIST_DIR/bot.env" "$BOT_ENV"
fi

setting() {
  local file="$1" key="$2" fallback="${3:-}"
  local value
  value="$(sed -n "s/^${key}=//p" "$file" 2>/dev/null | tail -n 1 || true)"
  printf '%s' "${value:-$fallback}"
}
ask() {
  local dest="$1" label="$2" current="$3" value=''
  IFS= read -r -p "$label$([[ -n "$current" ]] && printf ' [Enter — сохранить]'): " value || fail 'Ввод прерван.'
  printf -v "$dest" '%s' "${value:-$current}"
}
secret() {
  local dest="$1" label="$2" current="$3" value=''
  IFS= read -r -s -p "$label$([[ -n "$current" ]] && printf ' [Enter — сохранить]'): " value || fail 'Ввод прерван.'
  printf '\n'
  printf -v "$dest" '%s' "${value:-$current}"
}
valid_domain() {
  [[ "$1" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ && "$1" == *.* &&
    "$1" != *..* && ${#1} -le 253 ]] || fail 'Некорректный домен бота.'
}
valid_id() {
  [[ "$1" =~ ^[1-9][0-9]{0,18}$ ]] || fail 'ID должен быть положительным числом.'
  [[ ${#1} -lt 19 || "$1" < "9223372036854775808" ]] || fail 'ID превышает int64.'
}
put() {
  [[ "$2" != *$'\n'* && "$2" != *$'\r'* ]] || fail "Некорректный перенос строки в $1."
  printf '%s=%s\n' "$1" "$2" >> "$temp_file"
}

main() {
  local domain='' tg_token='' tg_id='' max_enabled=false max_token='' max_id='' max_user=''
  local main_domain answer='' token tg_secret max_secret internal_key
  main_domain="$(setting "${INSTALL_DIR}/.env" MIRA_TV_DOMAIN)"
  printf '\nНастройка Telegram/MAX в MIRA-TV\n'
  printf 'Требуется отдельный домен бота с DNS и действительным HTTPS-сертификатом.\n'
  ask domain 'Домен бота, без https://' "$(setting "$BOT_ENV" BOT_DOMAIN)"
  valid_domain "$domain"
  [[ "${domain,,}" != "${main_domain,,}" ]] || fail 'Домен бота должен отличаться от основного.'
  secret tg_token 'Секретный токен Telegram BotFather' "$(setting "$BOT_ENV" TELEGRAM_BOT_TOKEN)"
  [[ "$tg_token" =~ ^[0-9]{5,16}:[A-Za-z0-9_-]{25,}$ ]] || fail 'Неправильный токен Telegram.'
  ask tg_id 'Числовой Telegram ID администратора' "$(setting "$BOT_ENV" TELEGRAM_ADMIN_ID)"
  valid_id "$tg_id"
  if [[ "$(setting "$BOT_ENV" MAX_BOT_ENABLED false)" == true ]]; then
    IFS= read -r -p 'Оставить MAX включённым? [Y/n]: ' answer || fail 'Ввод прерван.'
    [[ -z "$answer" || "${answer,,}" == y ]] && max_enabled=true
  else
    IFS= read -r -p 'Включить MAX? [y/N]: ' answer || fail 'Ввод прерван.'
    [[ "${answer,,}" == y ]] && max_enabled=true
  fi
  if [[ "$max_enabled" == true ]]; then
    secret max_token 'Секретный токен MAX' "$(setting "$BOT_ENV" MAX_BOT_TOKEN)"
    [[ ${#max_token} -ge 10 && ${#max_token} -le 2048 &&
       "$max_token" =~ ^[A-Za-z0-9._~:/+=-]+$ ]] || fail 'Некорректный токен MAX.'
    ask max_id 'Числовой MAX ID администратора' "$(setting "$BOT_ENV" MAX_ADMIN_ID)"
    valid_id "$max_id"
    ask max_user 'Имя MAX-бота для Mini App (необязательно)' "$(setting "$BOT_ENV" MAX_BOT_USERNAME)"
    [[ -z "$max_user" || "$max_user" =~ ^[A-Za-z0-9_]{3,64}$ ]] || fail 'Недопустимое имя MAX-бота.'
  fi
  internal_key="$(setting "$BOT_ENV" BOT_INTERNAL_API_TOKEN)"
  tg_secret="$(setting "$BOT_ENV" TELEGRAM_WEBHOOK_SECRET)"
  max_secret="$(setting "$BOT_ENV" MAX_WEBHOOK_SECRET)"
  [[ "$internal_key" =~ ^[a-f0-9]{64}$ ]] || internal_key="$(openssl rand -hex 32)"
  [[ "$tg_secret" =~ ^[A-Za-z0-9_-]{32,256}$ ]] || tg_secret="$(openssl rand -hex 32)"
  if [[ "$max_enabled" == true ]]; then
    [[ "$max_secret" =~ ^[A-Za-z0-9_-]{32,256}$ ]] || max_secret="$(openssl rand -hex 32)"
  else
    max_secret=''
  fi
  temp_file="$(mktemp "${INSTALL_DIR}/.env.bot.XXXXXX")"
  chmod 600 "$temp_file"
  printf '# MIRA-TV private bot credentials. Never commit.\n' > "$temp_file"
  put BOT_DOMAIN "$domain"
  put BOT_PORT 8090
  put MIRA_TV_API_BASE_URL http://app:8080
  put BOT_INTERNAL_API_TOKEN "$internal_key"
  put BOT_OFFLINE_CONFIRM_SECONDS 120
  put BOT_NOTIFY_RECOVERY true
  put BOT_SUPPRESS_DUPLICATES true
  put TELEGRAM_BOT_ENABLED true
  put TELEGRAM_BOT_TOKEN "$tg_token"
  put TELEGRAM_ADMIN_ID "$tg_id"
  put TELEGRAM_WEBHOOK_SECRET "$tg_secret"
  put MAX_BOT_ENABLED "$max_enabled"
  put MAX_BOT_TOKEN "$max_token"
  put MAX_ADMIN_ID "$max_id"
  put MAX_WEBHOOK_SECRET "$max_secret"
  put MAX_BOT_USERNAME "$max_user"
  mv -f -- "$temp_file" "$BOT_ENV"; temp_file=''
  chmod 600 "$BOT_ENV"
  install -d -m 700 "$PERSIST_DIR"
  install -m 600 "$BOT_ENV" "$PERSIST_DIR/bot.env"
  printf '\nГотово: секреты в .env.bot (0600), защищённая копия в %s/bot.env.\n' "$PERSIST_DIR"
  printf 'Важно: Telegram ID и MAX ID выдаются правами ТОЛЬКО в Настройки → Пользователи → Telegram и MAX.\n'
  printf 'Данные из установщика сами по себе не предоставляют доступ к CRM.\n'
  printf 'После запуска проверьте HTTPS и зарегистрируйте webhook по инструкции docs/BOT.md.\n'
}
main "$@"
