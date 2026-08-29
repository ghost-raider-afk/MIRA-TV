#!/usr/bin/env bash
set -Eeuo pipefail

PROGRAM_NAME="MIRA-TV"
SCRIPT_VERSION="1.0.1"
INSTALL_DIR="/opt/MIRA-TV"
REPO_URL="https://github.com/ghost-raider-afk/MIRA-TV.git"
GITHUB_REPO="ghost-raider-afk/MIRA-TV"
GITHUB_API_URL="https://api.github.com/repos/${GITHUB_REPO}"
LAUNCHER_PATH="/usr/local/bin/mira-tv"

log() { printf '\n==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
die() { printf 'ОШИБКА: %s\n' "$*" >&2; exit 1; }

require_root() {
  [[ ${EUID:-$(id -u)} -eq 0 ]] || die 'Запустите установщик через sudo.'
}

require_ubuntu() {
  [[ -r /etc/os-release ]] || die 'Не удалось определить операционную систему.'
  # shellcheck disable=SC1091
  . /etc/os-release
  [[ ${ID:-} == ubuntu ]] || die 'MIRA-TV поддерживает Ubuntu.'
}

install_prerequisites() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y ca-certificates curl git openssl dnsutils
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    return
  fi
  log 'Установка Docker Engine и Docker Compose'
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
  docker compose version >/dev/null 2>&1 || die 'Docker Compose не установлен.'
}

random_hex() {
  local length="$1" raw
  raw="$(openssl rand -hex 64)"
  printf '%s' "${raw:0:length}"
}

generated_admin_password() {
  printf 'Aa1!%s' "$(random_hex 16)"
}

latest_tag() {
  curl -fsSL -H 'Accept: application/vnd.github+json' "${GITHUB_API_URL}/releases/latest" \
    | sed -nE 's/.*"tag_name"[[:space:]]*:[[:space:]]*"(v[0-9]+\.[0-9]+\.[0-9]+)".*/\1/p'
}

validate_domain() {
  [[ "$1" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] || die 'Укажите домен без https://, пути и порта.'
  [[ "$1" == *.* ]] || die 'Укажите полное доменное имя, например mira.example.com.'
}

validate_email() {
  [[ "$1" == *@*.* ]] || die 'Укажите корректный email для HTTPS-сертификата.'
}

write_env() {
  local domain="$1" email="$2" admin="$3" admin_password="$4" db_password session_secret
  db_password="$(random_hex 48)"
  session_secret="$(random_hex 64)"

  cp "${INSTALL_DIR}/.env.example" "${INSTALL_DIR}/.env"
  sed -i \
    -e 's|^MIRA_TV_VERSION=.*|MIRA_TV_VERSION=1.0.1|' \
    -e "s|^MIRA_TV_DOMAIN=.*|MIRA_TV_DOMAIN=${domain}|" \
    -e "s|^MIRA_TV_ACME_EMAIL=.*|MIRA_TV_ACME_EMAIL=${email}|" \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${db_password}|" \
    -e "s|^SESSION_SECRET=.*|SESSION_SECRET=${session_secret}|" \
    -e "s|^BOOTSTRAP_ADMIN_USERNAME=.*|BOOTSTRAP_ADMIN_USERNAME=${admin}|" \
    -e "s|^BOOTSTRAP_ADMIN_PASSWORD=.*|BOOTSTRAP_ADMIN_PASSWORD=${admin_password}|" \
    "${INSTALL_DIR}/.env"
  chmod 600 "${INSTALL_DIR}/.env"
}

merge_env_defaults() {
  local example="${INSTALL_DIR}/.env.example" env_file="${INSTALL_DIR}/.env" line key
  [[ -f "$env_file" ]] || die 'Не найден /opt/MIRA-TV/.env.'
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^([A-Z][A-Z0-9_]*)= ]] || continue
    key="${BASH_REMATCH[1]}"
    grep -q "^${key}=" "$env_file" || printf '%s\n' "$line" >> "$env_file"
  done < "$example"
}

compose() {
  [[ -d "$INSTALL_DIR" ]] || die 'MIRA-TV не установлен.'
  (cd "$INSTALL_DIR" && docker compose "$@")
}

validate_compose() {
  compose config --quiet
}

start_stack() {
  validate_compose
  compose up -d --build --wait
}

install_app() {
  require_root
  require_ubuntu
  install_prerequisites
  install_docker
  [[ ! -e "$INSTALL_DIR" ]] || die "${INSTALL_DIR} уже существует. Используйте команду update."

  local domain email admin admin_password tag
  read -r -p 'Домен MIRA-TV для HTTPS: ' domain
  validate_domain "$domain"
  read -r -p 'Email для HTTPS-сертификата: ' email
  validate_email "$email"
  read -r -p 'Логин администратора: ' admin
  [[ "$admin" =~ ^[A-Za-z][A-Za-z0-9_.-]{2,63}$ ]] || die 'Логин: 3–64 латинских букв, цифр, точка, дефис или подчёркивание.'

  tag="$(latest_tag)"
  [[ -n "$tag" ]] || die 'Стабильный релиз MIRA-TV не найден.'
  admin_password="$(generated_admin_password)"

  log "Установка ${PROGRAM_NAME} ${tag#v}"
  git clone --depth 1 --branch "$tag" "$REPO_URL" "$INSTALL_DIR"
  write_env "$domain" "$email" "$admin" "$admin_password"
  start_stack
  install -m 0755 "${INSTALL_DIR}/mira-tv.sh" "$LAUNCHER_PATH"

  printf '\nMIRA-TV установлен.\nURL: https://%s\nАдминистратор: %s\nПароль: %s\n\n' "$domain" "$admin" "$admin_password"
  info "Рабочий каталог: ${INSTALL_DIR}"
  info "Управление: cd ${INSTALL_DIR} && docker compose <команда>"
}

update_app() {
  require_root
  [[ -d "${INSTALL_DIR}/.git" ]] || die 'MIRA-TV не установлен.'

  local tag version
  tag="$(latest_tag)"
  [[ -n "$tag" ]] || die 'Стабильный релиз MIRA-TV не найден.'
  version="${tag#v}"

  log "Обновление MIRA-TV до ${version}"
  cd "$INSTALL_DIR"
  git fetch --tags --force origin
  git checkout -f "$tag"
  merge_env_defaults
  sed -i "s|^MIRA_TV_VERSION=.*|MIRA_TV_VERSION=${version}|" .env
  chmod 600 .env
  docker compose config --quiet
  docker compose up -d --build --wait
  install -m 0755 mira-tv.sh "$LAUNCHER_PATH"
}

status_app() {
  compose ps
}

restart_app() {
  require_root
  compose restart
}

logs_app() {
  compose logs -f --tail=200
}

check_update() {
  local installed='не установлена' latest
  if [[ -f "${INSTALL_DIR}/.env" ]]; then
    installed="$(sed -nE 's/^MIRA_TV_VERSION=(.+)$/\1/p' "${INSTALL_DIR}/.env" | head -n 1)"
  fi
  latest="$(latest_tag)"
  printf 'Установлена: %s\nПоследний релиз: %s\n' "$installed" "${latest:-не найден}"
}

remove_app() {
  require_root
  [[ -d "$INSTALL_DIR" ]] || die 'MIRA-TV не установлен.'
  compose down --remove-orphans
  rm -rf "$INSTALL_DIR"
  rm -f "$LAUNCHER_PATH"
  info 'Приложение удалено. Данные Docker сохранены.'
}

purge_app() {
  require_root
  [[ -d "$INSTALL_DIR" ]] || die 'MIRA-TV не установлен.'
  compose down -v --remove-orphans
  rm -rf "$INSTALL_DIR"
  rm -f "$LAUNCHER_PATH"
  info 'MIRA-TV и все его данные Docker удалены.'
}

show_menu() {
  printf '\nУстановщик MIRA-TV %s\n' "$SCRIPT_VERSION"
  printf '1) Установить\n2) Обновить\n3) Статус\n4) Перезапустить\n5) Логи\n6) Проверить обновление\n7) Удалить приложение\n8) Удалить приложение и данные\n0) Выход\n'
  read -r -p 'Выберите действие: ' choice
  case "$choice" in
    1) install_app ;;
    2) update_app ;;
    3) status_app ;;
    4) restart_app ;;
    5) logs_app ;;
    6) check_update ;;
    7) remove_app ;;
    8) purge_app ;;
    0) exit 0 ;;
    *) die 'Неизвестный пункт меню.' ;;
  esac
}

case "${1:-menu}" in
  install) install_app ;;
  update) update_app ;;
  status) status_app ;;
  restart) restart_app ;;
  logs) logs_app ;;
  check-update) check_update ;;
  remove) remove_app ;;
  purge) purge_app ;;
  menu) show_menu ;;
  *) die 'Команды: install | update | status | restart | logs | check-update | remove | purge | menu' ;;
esac
