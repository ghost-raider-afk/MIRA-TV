#!/usr/bin/env bash
set -Eeuo pipefail

PROGRAM_NAME="MIRA-TV"
SCRIPT_VERSION="1.0.2"
INSTALL_DIR="/opt/MIRA-TV"
REPO_URL="https://github.com/ghost-raider-afk/MIRA-TV.git"
GITHUB_REPO="ghost-raider-afk/MIRA-TV"
GITHUB_API_URL="https://api.github.com/repos/${GITHUB_REPO}"
LAUNCHER_PATH="/usr/local/bin/mira-tv"
TEMP_BACKUP_DIR=""
KEEP_TEMP_BACKUP=false

log() { printf '\n==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf 'ПРЕДУПРЕЖДЕНИЕ: %s\n' "$*" >&2; }
die() { printf 'ОШИБКА: %s\n' "$*" >&2; exit 1; }

cleanup_temporary_backup() {
  if [[ -n "$TEMP_BACKUP_DIR" && -d "$TEMP_BACKUP_DIR" && "$KEEP_TEMP_BACKUP" != true ]]; then
    rm -rf -- "$TEMP_BACKUP_DIR"
  fi
}
trap cleanup_temporary_backup EXIT

confirm_action() {
  local prompt="$1" answer
  read -r -p "${prompt} [YES/NO]: " answer
  [[ "$answer" == "YES" ]]
}

require_root() {
  local action="${1:-menu}" source tmp status
  [[ ${EUID:-$(id -u)} -eq 0 ]] && return 0
  command -v sudo >/dev/null 2>&1 || die 'Для этой операции нужны права root. Установите sudo или войдите как root.'

  source="${BASH_SOURCE[0]}"
  [[ -r "$source" ]] || die 'Не удалось прочитать текущий установщик для запуска через sudo.'
  tmp="$(mktemp -t 'mira-tv.bootstrap.XXXXXX.sh')"
  cat -- "$source" > "$tmp"
  chmod 700 "$tmp"

  if sudo bash "$tmp" "$action"; then
    status=0
  else
    status=$?
  fi
  rm -f -- "$tmp"
  exit "$status"
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

installed_version() {
  local version=''
  if [[ -f "${INSTALL_DIR}/.env" ]]; then
    version="$(sed -nE 's/^MIRA_TV_VERSION=(.+)$/\1/p' "${INSTALL_DIR}/.env" | head -n 1)"
  fi
  if [[ -z "$version" && -f "${INSTALL_DIR}/package.json" ]]; then
    version="$(sed -nE 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"([0-9]+\.[0-9]+\.[0-9]+)".*/\1/p' "${INSTALL_DIR}/package.json" | head -n 1)"
  fi
  [[ -n "$version" ]] || return 1
  printf '%s\n' "$version"
}

version_is_newer() {
  local current="$1" candidate="$2"
  [[ "$current" != "$candidate" ]] || return 1
  [[ "$(printf '%s\n%s\n' "$current" "$candidate" | sort -V | tail -n 1)" == "$candidate" ]]
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
    -e 's|^MIRA_TV_VERSION=.*|MIRA_TV_VERSION=1.0.2|' \
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

create_temporary_backup() {
  local installer_source
  [[ -d "${INSTALL_DIR}/.git" ]] || die 'Каталог установки не является Git-репозиторием.'
  [[ -f "${INSTALL_DIR}/.env" ]] || die 'Не найден /opt/MIRA-TV/.env.'
  installer_source="$(readlink -f -- "${BASH_SOURCE[0]}")"
  [[ -f "$installer_source" ]] || die 'Не удалось сохранить текущий установщик перед обновлением.'

  TEMP_BACKUP_DIR="$(mktemp -d -t 'mira-tv.update.XXXXXX')"
  chmod 700 "$TEMP_BACKUP_DIR"
  tar --exclude='./.git' --exclude='./.env' --exclude='./node_modules' -C "$INSTALL_DIR" -czf "$TEMP_BACKUP_DIR/source.tar.gz" .
  cp "$INSTALL_DIR/.env" "$TEMP_BACKUP_DIR/.env"
  cp "$installer_source" "$TEMP_BACKUP_DIR/installer.sh"
  chmod 600 "$TEMP_BACKUP_DIR/.env"
  chmod 700 "$TEMP_BACKUP_DIR/installer.sh"
  git -C "$INSTALL_DIR" rev-parse HEAD > "$TEMP_BACKUP_DIR/git-revision"

  compose exec -T db sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges' > "$TEMP_BACKUP_DIR/database.dump"
  [[ -s "$TEMP_BACKUP_DIR/database.dump" ]] || die 'Резервная копия PostgreSQL пуста; обновление остановлено.'
  info 'Временная резервная копия создана.'
}

restore_database_exact() {
  local dump_file="$1"
  compose exec -T db sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" dropdb --if-exists --force -U "$POSTGRES_USER" "$POSTGRES_DB" && PGPASSWORD="$POSTGRES_PASSWORD" createdb -U "$POSTGRES_USER" -O "$POSTGRES_USER" "$POSTGRES_DB"' || return 1
  compose exec -T db sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore --exit-on-error -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges' < "$dump_file" || return 1
}

restore_temporary_backup() {
  [[ -n "$TEMP_BACKUP_DIR" ]] || return 1
  [[ -f "$TEMP_BACKUP_DIR/source.tar.gz" && -f "$TEMP_BACKUP_DIR/.env" && -f "$TEMP_BACKUP_DIR/git-revision" && -s "$TEMP_BACKUP_DIR/database.dump" ]] || return 1

  warn 'Обновление не прошло проверку. Выполняется автоматическое восстановление.'
  compose down --remove-orphans || true
  find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 ! -name '.git' ! -name '.env' -exec rm -rf -- {} + || return 1
  tar -C "$INSTALL_DIR" -xzf "$TEMP_BACKUP_DIR/source.tar.gz" || return 1
  cp "$TEMP_BACKUP_DIR/.env" "$INSTALL_DIR/.env" || return 1
  chmod 600 "$INSTALL_DIR/.env" || return 1
  git -C "$INSTALL_DIR" reset --hard "$(<"$TEMP_BACKUP_DIR/git-revision")" || return 1
  install -m 0755 "$TEMP_BACKUP_DIR/installer.sh" "$LAUNCHER_PATH" || return 1

  compose up -d --wait db || return 1
  restore_database_exact "$TEMP_BACKUP_DIR/database.dump" || return 1
  compose up -d --build --wait || return 1
  return 0
}

recover_failed_update() {
  if restore_temporary_backup; then
    die 'Обновление отменено: предыдущая версия, настройки и база данных автоматически восстановлены.'
  fi
  KEEP_TEMP_BACKUP=true
  die "Автоматическое восстановление не завершилось. Временная копия сохранена: ${TEMP_BACKUP_DIR:-не создана}"
}

install_app() {
  require_root install
  require_ubuntu
  install_prerequisites
  install_docker
  [[ ! -e "$INSTALL_DIR" ]] || die "${INSTALL_DIR} уже существует. Используйте пункт проверки обновления."

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
  info "Открыть меню: mira-tv"
}

update_app() {
  require_root update
  [[ -d "${INSTALL_DIR}/.git" ]] || die 'MIRA-TV не установлен.'

  local installed tag version answer
  installed="$(installed_version)" || die 'Не удалось определить установленную версию MIRA-TV.'
  tag="$(latest_tag)"
  [[ -n "$tag" ]] || die 'Стабильный релиз MIRA-TV не найден.'
  version="${tag#v}"

  printf 'Установлена: %s\nПоследний релиз: %s\n' "$installed" "$version"

  if [[ "$installed" == "$version" ]]; then
    info "У вас установлена последняя версия MIRA-TV (${installed})."
    return 0
  fi
  if ! version_is_newer "$installed" "$version"; then
    info "Установленная версия ${installed} новее стабильной версии ${version}."
    return 0
  fi

  read -r -p "Доступно обновление до ${version}. Обновить? [y/N]: " answer
  if [[ "${answer,,}" != y ]]; then
    info 'Обновление отменено.'
    return 0
  fi

  log "Обновление MIRA-TV ${installed} -> ${version}"
  cd "$INSTALL_DIR"
  git fetch --tags --force origin || die 'Не удалось получить теги GitHub.'
  git rev-parse "${tag}^{commit}" >/dev/null 2>&1 || die "Не найден релизный тег ${tag}."

  create_temporary_backup

  git checkout -f "$tag" || recover_failed_update
  merge_env_defaults || recover_failed_update
  sed -i "s|^MIRA_TV_VERSION=.*|MIRA_TV_VERSION=${version}|" .env || recover_failed_update
  chmod 600 .env || recover_failed_update
  docker compose config --quiet || recover_failed_update
  docker compose up -d --build --wait || recover_failed_update
  install -m 0755 mira-tv.sh "$LAUNCHER_PATH" || recover_failed_update

  rm -rf -- "$TEMP_BACKUP_DIR"
  TEMP_BACKUP_DIR=""
  info "MIRA-TV обновлён до версии ${version}."
}

status_app() {
  require_root status
  compose ps
}

restart_app() {
  require_root restart
  compose restart
}

logs_app() {
  require_root logs
  compose logs -f --tail=200
}

reset_admin_password() {
  require_root reset-admin-password
  [[ -d "${INSTALL_DIR}/.git" ]] || die 'MIRA-TV не установлен.'

  local username
  read -r -p 'Логин администратора (Enter, если администратор один): ' username

  if [[ -n "$username" ]]; then
    compose exec -T app node src/cli/reset-admin-password.js "$username"
  else
    compose exec -T app node src/cli/reset-admin-password.js
  fi
}

remove_app() {
  require_root remove
  [[ -d "$INSTALL_DIR" ]] || die 'MIRA-TV не установлен.'
  printf '\nБудет удалено приложение MIRA-TV и его рабочий каталог.\nДанные Docker будут сохранены.\n'
  if ! confirm_action 'Удалить приложение?'; then
    info 'Удаление отменено.'
    return 0
  fi
  compose down --remove-orphans
  rm -rf "$INSTALL_DIR"
  rm -f "$LAUNCHER_PATH"
  info 'Приложение удалено. Данные Docker сохранены.'
}

purge_app() {
  require_root purge
  [[ -d "$INSTALL_DIR" ]] || die 'MIRA-TV не установлен.'
  printf '\nВНИМАНИЕ: будут безвозвратно удалены приложение MIRA-TV, база данных, загруженные файлы и HTTPS-сертификаты.\n'
  if ! confirm_action 'Удалить приложение и ВСЕ данные?'; then
    info 'Удаление отменено.'
    return 0
  fi
  compose down -v --remove-orphans
  rm -rf "$INSTALL_DIR"
  rm -f "$LAUNCHER_PATH"
  info 'MIRA-TV и все его данные Docker удалены.'
}

show_menu() {
  printf '\nУстановщик MIRA-TV %s\n' "$SCRIPT_VERSION"
  printf '1) Установить\n2) Проверить обновление\n3) Статус\n4) Перезапустить\n5) Логи\n6) Сбросить пароль администратора\n7) Удалить приложение\n8) Удалить приложение и данные\n0) Выход\n'
  read -r -p 'Выберите действие: ' choice
  case "$choice" in
    1) install_app ;;
    2) update_app ;;
    3) status_app ;;
    4) restart_app ;;
    5) logs_app ;;
    6) reset_admin_password ;;
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
  reset-admin-password) reset_admin_password ;;
  remove) remove_app ;;
  purge) purge_app ;;
  menu) show_menu ;;
  *) die 'Команды: install | update | status | restart | logs | reset-admin-password | remove | purge | menu' ;;
esac
