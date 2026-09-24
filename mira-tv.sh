#!/usr/bin/env bash
set -Eeuo pipefail

PROGRAM_NAME="MIRA-TV"
SCRIPT_VERSION="1.14.1"
INSTALL_DIR="/opt/MIRA-TV"
PERSIST_DIR="/var/lib/mira-tv"
PERSIST_ENV="${PERSIST_DIR}/install.env"
REPO_URL="https://github.com/ghost-raider-afk/MIRA-TV.git"
GITHUB_REPO="ghost-raider-afk/MIRA-TV"
GITHUB_API_URL="https://api.github.com/repos/${GITHUB_REPO}"
LAUNCHER_PATH="/usr/local/bin/mira-tv"
TEMP_BACKUP_DIR=""
KEEP_TEMP_BACKUP=false
FULL_BACKUP_WORKDIR=""
FULL_BACKUP_FORMAT_VERSION="1"
BACKUP_HELPER_IMAGE="busybox:1.37.0@sha256:9db7b59979c38555a39def84a31fb98b5296952f9e3afd4f6f11f05b07adfab0"
BACKUP_DIR="${PERSIST_DIR}/backups"

log() { printf '\n==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf 'ПРЕДУПРЕЖДЕНИЕ: %s\n' "$*" >&2; }
die() { printf 'ОШИБКА: %s\n' "$*" >&2; exit 1; }

cleanup_temporary_backup() {
  if [[ -n "$TEMP_BACKUP_DIR" && -d "$TEMP_BACKUP_DIR" && "$KEEP_TEMP_BACKUP" != true ]]; then rm -rf -- "$TEMP_BACKUP_DIR"; fi
  if [[ -n "$FULL_BACKUP_WORKDIR" && -d "$FULL_BACKUP_WORKDIR" ]]; then rm -rf -- "$FULL_BACKUP_WORKDIR"; fi
}
trap cleanup_temporary_backup EXIT

confirm_action() { local prompt="$1" answer; read -r -p "${prompt} [YES/NO]: " answer; [[ "$answer" == "YES" ]]; }

require_root() {
  local action="${1:-menu}" source tmp status
  shift || true
  [[ ${EUID:-$(id -u)} -eq 0 ]] && return 0
  command -v sudo >/dev/null 2>&1 || die 'Для этой операции нужны права root. Установите sudo или войдите как root.'
  source="${BASH_SOURCE[0]}"; [[ -r "$source" ]] || die 'Не удалось прочитать текущий установщик для запуска через sudo.'
  tmp="$(mktemp -t 'mira-tv.bootstrap.XXXXXX.sh')"; cat -- "$source" > "$tmp"; chmod 700 "$tmp"
  if sudo bash "$tmp" "$action" "$@"; then status=0; else status=$?; fi
  rm -f -- "$tmp"; exit "$status"
}

require_ubuntu() {
  [[ -r /etc/os-release ]] || die 'Не удалось определить операционную систему.'
  # shellcheck disable=SC1091
  . /etc/os-release
  [[ ${ID:-} == ubuntu ]] || die 'MIRA-TV поддерживает Ubuntu.'
}

install_prerequisites() { export DEBIAN_FRONTEND=noninteractive; apt-get update; apt-get install -y ca-certificates curl git openssl dnsutils; }
compose_supports_gateway_priority() {
  local current minimum='2.33.1'
  current="$(docker compose version --short 2>/dev/null | sed -E 's/^v//')" || return 1
  [[ -n "$current" ]] || return 1
  [[ "$(printf '%s\n%s\n' "$minimum" "$current" | sort -V | head -n 1)" == "$minimum" ]]
}
install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1 && compose_supports_gateway_priority; then return; fi
  log 'Установка или обновление Docker Engine и Docker Compose'; curl -fsSL https://get.docker.com | sh; systemctl enable --now docker
  docker compose version >/dev/null 2>&1 || die 'Docker Compose не установлен.'
  compose_supports_gateway_priority || die 'Требуется Docker Compose 2.33.1 или новее для корректного сетевого маршрута MIRA-TV.'
}
random_hex() { local length="$1" raw; raw="$(openssl rand -hex 64)"; printf '%s' "${raw:0:length}"; }
generated_admin_password() { printf 'Aa1!%s' "$(random_hex 16)"; }
latest_tag() { curl -fsSL -H 'Accept: application/vnd.github+json' "${GITHUB_API_URL}/releases/latest" | sed -nE 's/.*"tag_name"[[:space:]]*:[[:space:]]*"(v[0-9]+\.[0-9]+\.[0-9]+)".*/\1/p'; }

installed_version() {
  local version=''
  if [[ -f "${INSTALL_DIR}/.env" ]]; then version="$(sed -nE 's/^MIRA_TV_VERSION=(.+)$/\1/p' "${INSTALL_DIR}/.env" | head -n 1)"; fi
  if [[ -z "$version" && -f "${INSTALL_DIR}/package.json" ]]; then version="$(sed -nE 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"([0-9]+\.[0-9]+\.[0-9]+)".*/\1/p' "${INSTALL_DIR}/package.json" | head -n 1)"; fi
  [[ -n "$version" ]] || return 1; printf '%s\n' "$version"
}
version_is_newer() { local current="$1" candidate="$2"; [[ "$current" != "$candidate" ]] || return 1; [[ "$(printf '%s\n%s\n' "$current" "$candidate" | sort -V | tail -n 1)" == "$candidate" ]]; }
validate_domain() { [[ "$1" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] || die 'Укажите домен без https://, пути и порта.'; [[ "$1" == *.* ]] || die 'Укажите полное доменное имя, например mira.example.com.'; }
validate_email() { [[ "$1" == *@*.* ]] || die 'Укажите корректный email для HTTPS-сертификата.'; }

persist_env() {
  [[ -f "${INSTALL_DIR}/.env" ]] || return 0
  install -d -m 0700 "$PERSIST_DIR"
  install -m 0600 "${INSTALL_DIR}/.env" "$PERSIST_ENV"
}

merge_env_defaults() {
  local example="${INSTALL_DIR}/.env.example" env_file="${INSTALL_DIR}/.env" line key
  [[ -f "$env_file" ]] || die 'Не найден /opt/MIRA-TV/.env.'
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^([A-Z][A-Z0-9_]*)= ]] || continue; key="${BASH_REMATCH[1]}"
    grep -q "^${key}=" "$env_file" || printf '%s\n' "$line" >> "$env_file"
  done < "$example"
}

write_env() {
  local domain="$1" email="$2" admin="$3" admin_password="$4" db_password session_secret
  if [[ -f "$PERSIST_ENV" ]]; then
    cp "$PERSIST_ENV" "${INSTALL_DIR}/.env"
    merge_env_defaults
  else
    db_password="$(random_hex 48)"; session_secret="$(random_hex 64)"
    cp "${INSTALL_DIR}/.env.example" "${INSTALL_DIR}/.env"
    sed -i \
      -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${db_password}|" \
      -e "s|^SESSION_SECRET=.*|SESSION_SECRET=${session_secret}|" \
      -e "s|^BOOTSTRAP_ADMIN_USERNAME=.*|BOOTSTRAP_ADMIN_USERNAME=${admin}|" \
      -e "s|^BOOTSTRAP_ADMIN_PASSWORD=.*|BOOTSTRAP_ADMIN_PASSWORD=${admin_password}|" \
      "${INSTALL_DIR}/.env"
  fi
  sed -i \
    -e "s|^MIRA_TV_VERSION=.*|MIRA_TV_VERSION=${SCRIPT_VERSION}|" \
    -e "s|^MIRA_TV_DOMAIN=.*|MIRA_TV_DOMAIN=${domain}|" \
    -e "s|^MIRA_TV_ACME_EMAIL=.*|MIRA_TV_ACME_EMAIL=${email}|" \
    "${INSTALL_DIR}/.env"
  chmod 600 "${INSTALL_DIR}/.env"; persist_env
}

compose() { [[ -d "$INSTALL_DIR" ]] || die 'MIRA-TV не установлен.'; (cd "$INSTALL_DIR" && docker compose "$@"); }
validate_compose() { compose config --quiet; }

wait_ready() {
  local attempts="${1:-60}"
  for _attempt in $(seq 1 "$attempts"); do
    if compose exec -T app node -e "fetch('http://127.0.0.1:8080/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  return 1
}

start_stack() {
  validate_compose
  compose up -d --build --wait
  wait_ready || die 'Приложение запущено, но /readyz не подтвердил готовность.'
}

backup_site_assets() {
  compose exec -T app sh -ec 'tar -C "$SITE_ASSETS_ROOT" -czf - .' > "$TEMP_BACKUP_DIR/site-assets.tar.gz" || return 1
  [[ -s "$TEMP_BACKUP_DIR/site-assets.tar.gz" ]] || return 1
}

restore_site_assets() {
  [[ -s "$TEMP_BACKUP_DIR/site-assets.tar.gz" ]] || return 1
  compose run --rm --no-deps -T site-assets-init sh -ec \
    'mkdir -p "$SITE_ASSETS_ROOT"; find "$SITE_ASSETS_ROOT" -mindepth 1 -delete; tar -C "$SITE_ASSETS_ROOT" -xzf -' \
    < "$TEMP_BACKUP_DIR/site-assets.tar.gz" || return 1
}

backup_persistent_volume_to() {
  local kind="$1" output="$2" target
  case "$kind" in
    site-assets) target='/backup/site-assets' ;;
    letsencrypt) target='/backup/letsencrypt' ;;
    *) die "Неизвестное постоянное хранилище backup: $kind" ;;
  esac
  compose run --rm --no-deps -T -e BACKUP_TARGET="$target" backup-helper sh -ec 'tar -C "$BACKUP_TARGET" -czf - .' > "$output"
  [[ -s "$output" ]] || die "Резервная копия хранилища $kind пуста."
}

restore_persistent_volume_from() {
  local kind="$1" input="$2" target
  [[ -s "$input" ]] || die "Не найден архив данных для хранилища $kind."
  case "$kind" in
    site-assets) target='/backup/site-assets' ;;
    letsencrypt) target='/backup/letsencrypt' ;;
    *) die "Неизвестное постоянное хранилище restore: $kind" ;;
  esac
  compose run --rm --no-deps -T -e BACKUP_TARGET="$target" backup-helper sh -ec \
    'find "$BACKUP_TARGET" -mindepth 1 -delete; tar -C "$BACKUP_TARGET" -xzf -' < "$input"
}

manifest_value() {
  local manifest="$1" key="$2"
  sed -nE "s/^${key}=([^[:cntrl:]]*)$/\\1/p" "$manifest" | head -n 1
}

extract_and_verify_full_backup() {
  local archive="$1" target="$2" actual_members expected_members actual_checksums expected_checksums format version domain
  [[ -f "$archive" ]] || die "Файл резервной копии не найден: $archive"
  [[ -s "$archive" ]] || die 'Файл резервной копии пуст.'

  expected_members="$(printf '%s\n' '.env' 'checksums.sha256' 'database.dump' 'letsencrypt.tar.gz' 'manifest.env' 'site-assets.tar.gz' | sort)"
  actual_members="$(tar -tzf "$archive" 2>/dev/null | sort)" || die 'Не удалось прочитать резервную копию.'
  [[ "$actual_members" == "$expected_members" ]] || die 'Структура резервной копии не соответствует формату MIRA-TV.'

  mkdir -p "$target"
  tar --no-same-owner --no-same-permissions -xzf "$archive" -C "$target" -- \
    manifest.env .env database.dump site-assets.tar.gz letsencrypt.tar.gz checksums.sha256
  for file in manifest.env .env database.dump site-assets.tar.gz letsencrypt.tar.gz checksums.sha256; do
    [[ -f "$target/$file" && ! -L "$target/$file" ]] || die "Некорректный элемент резервной копии: $file"
  done

  expected_checksums="$(printf '%s\n' '.env' 'database.dump' 'letsencrypt.tar.gz' 'manifest.env' 'site-assets.tar.gz' | sort)"
  actual_checksums="$(awk '{print $2}' "$target/checksums.sha256" | sort)"
  [[ "$actual_checksums" == "$expected_checksums" ]] || die 'Список контрольных сумм резервной копии некорректен.'
  (cd "$target" && sha256sum -c checksums.sha256 >/dev/null) || die 'Контрольные суммы резервной копии не совпадают.'

  format="$(manifest_value "$target/manifest.env" format_version)"
  version="$(manifest_value "$target/manifest.env" mira_tv_version)"
  domain="$(manifest_value "$target/manifest.env" domain)"
  [[ "$format" == "$FULL_BACKUP_FORMAT_VERSION" ]] || die "Неподдерживаемая версия формата backup: ${format:-не указана}."
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die 'В backup указана некорректная версия MIRA-TV.'
  validate_domain "$domain"
}

create_full_backup() {
  local destination="${1:-}" timestamp filename version revision domain verify_dir
  require_root backup "$destination"
  [[ -d "$INSTALL_DIR/.git" ]] || die 'MIRA-TV не установлен.'
  [[ -f "$INSTALL_DIR/.env" ]] || die 'Не найден /opt/MIRA-TV/.env.'
  version="$(installed_version)" || die 'Не удалось определить установленную версию MIRA-TV.'
  revision="$(git -C "$INSTALL_DIR" rev-parse HEAD)" || die 'Не удалось определить Git revision.'
  domain="$(sed -nE 's/^MIRA_TV_DOMAIN=(.+)$/\1/p' "$INSTALL_DIR/.env" | head -n 1)"
  validate_domain "$domain"
  timestamp="$(date -u +'%Y%m%dT%H%M%SZ')"
  filename="mira-tv-${version}-${timestamp}.mirabackup"

  if [[ -z "$destination" ]]; then
    install -d -m 0700 "$BACKUP_DIR"
    destination="$BACKUP_DIR/$filename"
  elif [[ -d "$destination" ]]; then
    destination="${destination%/}/$filename"
  else
    install -d -m 0700 "$(dirname "$destination")"
  fi
  [[ ! -e "$destination" ]] || die "Файл уже существует: $destination"

  FULL_BACKUP_WORKDIR="$(mktemp -d -t 'mira-tv.backup.XXXXXX')"
  chmod 700 "$FULL_BACKUP_WORKDIR"
  cp "$INSTALL_DIR/.env" "$FULL_BACKUP_WORKDIR/.env"
  chmod 600 "$FULL_BACKUP_WORKDIR/.env"

  compose up -d --wait db
  compose exec -T db sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges' > "$FULL_BACKUP_WORKDIR/database.dump"
  [[ -s "$FULL_BACKUP_WORKDIR/database.dump" ]] || die 'Резервная копия PostgreSQL пуста.'
  backup_persistent_volume_to 'site-assets' "$FULL_BACKUP_WORKDIR/site-assets.tar.gz"
  backup_persistent_volume_to 'letsencrypt' "$FULL_BACKUP_WORKDIR/letsencrypt.tar.gz"

  {
    printf 'format_version=%s\n' "$FULL_BACKUP_FORMAT_VERSION"
    printf 'mira_tv_version=%s\n' "$version"
    printf 'created_at_utc=%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
    printf 'domain=%s\n' "$domain"
    printf 'git_revision=%s\n' "$revision"
  } > "$FULL_BACKUP_WORKDIR/manifest.env"

  (cd "$FULL_BACKUP_WORKDIR" && sha256sum manifest.env .env database.dump site-assets.tar.gz letsencrypt.tar.gz > checksums.sha256)
  tar -C "$FULL_BACKUP_WORKDIR" -czf "$destination" manifest.env .env database.dump site-assets.tar.gz letsencrypt.tar.gz checksums.sha256
  chmod 600 "$destination"

  verify_dir="$(mktemp -d -t 'mira-tv.verify.XXXXXX')"
  extract_and_verify_full_backup "$destination" "$verify_dir"
  rm -rf -- "$verify_dir"
  rm -rf -- "$FULL_BACKUP_WORKDIR"
  FULL_BACKUP_WORKDIR=""

  info "Полная резервная копия создана: $destination"
  info "Версия MIRA-TV: $version"
  info "Домен: $domain"
  info "Размер: $(du -h "$destination" | awk '{print $1}')"
  warn 'Файл содержит базу данных, секреты приложения и TLS-ключи. Храните его как конфиденциальный.'
}

verify_full_backup() {
  local archive="${1:-}" version domain created
  if [[ -z "$archive" ]]; then read -r -p 'Путь к файлу .mirabackup: ' archive; fi
  FULL_BACKUP_WORKDIR="$(mktemp -d -t 'mira-tv.verify.XXXXXX')"
  extract_and_verify_full_backup "$archive" "$FULL_BACKUP_WORKDIR"
  version="$(manifest_value "$FULL_BACKUP_WORKDIR/manifest.env" mira_tv_version)"
  domain="$(manifest_value "$FULL_BACKUP_WORKDIR/manifest.env" domain)"
  created="$(manifest_value "$FULL_BACKUP_WORKDIR/manifest.env" created_at_utc)"
  rm -rf -- "$FULL_BACKUP_WORKDIR"
  FULL_BACKUP_WORKDIR=""
  info 'Резервная копия исправна и пригодна для восстановления.'
  info "Версия MIRA-TV: $version"
  info "Домен: $domain"
  info "Создана: $created"
}

restore_full_backup() {
  local archive="${1:-}" version domain revision tag restored_revision env_domain
  if [[ -z "$archive" ]]; then read -r -p 'Путь к файлу .mirabackup: ' archive; fi
  require_root restore-backup "$archive"
  require_ubuntu

  FULL_BACKUP_WORKDIR="$(mktemp -d -t 'mira-tv.restore.XXXXXX')"
  chmod 700 "$FULL_BACKUP_WORKDIR"
  extract_and_verify_full_backup "$archive" "$FULL_BACKUP_WORKDIR"
  version="$(manifest_value "$FULL_BACKUP_WORKDIR/manifest.env" mira_tv_version)"
  domain="$(manifest_value "$FULL_BACKUP_WORKDIR/manifest.env" domain)"
  revision="$(manifest_value "$FULL_BACKUP_WORKDIR/manifest.env" git_revision)"
  [[ "$revision" =~ ^[0-9a-fA-F]{40}$ ]] || die 'В backup отсутствует корректный Git revision.'
  env_domain="$(sed -nE 's/^MIRA_TV_DOMAIN=(.+)$/\1/p' "$FULL_BACKUP_WORKDIR/.env" | head -n 1)"
  [[ "$env_domain" == "$domain" ]] || die 'Домен в manifest и .env резервной копии не совпадает.'

  install_prerequisites
  install_docker

  [[ ! -e "$INSTALL_DIR" ]] || die "$INSTALL_DIR уже существует. Восстановление полного сервера разрешено только на чистую установку."
  for volume in mira-tv-db-data mira-tv-site-assets mira-tv-letsencrypt mira-tv-proxy-config; do
    if docker volume inspect "$volume" >/dev/null 2>&1; then
      die "Обнаружены существующие данные MIRA-TV ($volume). Очистите старую установку перед полным восстановлением."
    fi
  done

  tag="v$version"
  log "Восстановление MIRA-TV $version из полной резервной копии"
  git clone --depth 1 --branch "$tag" "$REPO_URL" "$FULL_BACKUP_WORKDIR/source" || die "Не удалось получить релиз $tag."
  restored_revision="$(git -C "$FULL_BACKUP_WORKDIR/source" rev-parse HEAD)"
  [[ "$restored_revision" == "$revision" ]] || die 'Git revision релиза не совпадает с revision в backup; восстановление остановлено.'
  mv "$FULL_BACKUP_WORKDIR/source" "$INSTALL_DIR"

  cp "$FULL_BACKUP_WORKDIR/.env" "$INSTALL_DIR/.env"
  chmod 600 "$INSTALL_DIR/.env"
  persist_env
  validate_compose

  compose up -d --wait db
  restore_database_exact "$FULL_BACKUP_WORKDIR/database.dump" || die 'Не удалось восстановить PostgreSQL.'
  restore_persistent_volume_from 'site-assets' "$FULL_BACKUP_WORKDIR/site-assets.tar.gz"
  restore_persistent_volume_from 'letsencrypt' "$FULL_BACKUP_WORKDIR/letsencrypt.tar.gz"
  start_stack
  install -m 0755 "$INSTALL_DIR/mira-tv.sh" "$LAUNCHER_PATH"
  persist_env

  rm -rf -- "$FULL_BACKUP_WORKDIR"
  FULL_BACKUP_WORKDIR=""
  printf '\nMIRA-TV полностью восстановлен.\nURL: https://%s\nВерсия: %s\n\n' "$domain" "$version"
  info 'База данных, привязки телевизоров, пользовательские файлы, секреты и TLS-состояние восстановлены.'
  info 'После переключения DNS телевизоры продолжат работу с прежними идентификаторами и привязками.'
}

create_temporary_backup() {
  local installer_source
  [[ -d "${INSTALL_DIR}/.git" ]] || die 'Каталог установки не является Git-репозиторием.'
  [[ -f "${INSTALL_DIR}/.env" ]] || die 'Не найден /opt/MIRA-TV/.env.'
  if [[ -f "${INSTALL_DIR}/mira-tv.sh" ]]; then installer_source="${INSTALL_DIR}/mira-tv.sh"; elif [[ -f "$LAUNCHER_PATH" ]]; then installer_source="$LAUNCHER_PATH"; else die 'Не найден установленный скрипт MIRA-TV для резервной копии.'; fi
  TEMP_BACKUP_DIR="$(mktemp -d -t 'mira-tv.update.XXXXXX')"; chmod 700 "$TEMP_BACKUP_DIR"
  tar --exclude='./.git' --exclude='./.env' --exclude='./node_modules' -C "$INSTALL_DIR" -czf "$TEMP_BACKUP_DIR/source.tar.gz" .
  cp "$INSTALL_DIR/.env" "$TEMP_BACKUP_DIR/.env"; cp "$installer_source" "$TEMP_BACKUP_DIR/installer.sh"
  chmod 600 "$TEMP_BACKUP_DIR/.env"; chmod 700 "$TEMP_BACKUP_DIR/installer.sh"; git -C "$INSTALL_DIR" rev-parse HEAD > "$TEMP_BACKUP_DIR/git-revision"
  compose exec -T db sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges' > "$TEMP_BACKUP_DIR/database.dump"
  [[ -s "$TEMP_BACKUP_DIR/database.dump" ]] || die 'Резервная копия PostgreSQL пуста; обновление остановлено.'
  backup_site_assets || die 'Не удалось создать резервную копию загруженных файлов; обновление остановлено.'
  persist_env; info 'Временная резервная копия создана.'
}

capture_update_failure_diagnostics() {
  local stage="${1:-unknown}" output="${PERSIST_DIR}/last-update-failure.log" revision='unknown'
  install -d -m 0700 "$PERSIST_DIR" || return 0
  revision="$(git -C "$INSTALL_DIR" rev-parse HEAD 2>/dev/null || printf 'unknown')"
  if ! {
    printf 'MIRA-TV update failure diagnostics\n'
    printf 'captured_at=%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
    printf 'stage=%s\n' "$stage"
    printf 'revision=%s\n' "$revision"
    printf '\n[compose ps -a]\n'
    compose ps -a || true
    printf '\n[app state]\n'
    docker inspect mira-tv --format 'Status={{.State.Status}} Running={{.State.Running}} ExitCode={{.State.ExitCode}} Error={{.State.Error}}' || true
    printf '\n[app health]\n'
    docker inspect mira-tv --format '{{json .State.Health}}' || true
    printf '\n[app logs]\n'
    docker logs --tail 200 mira-tv 2>&1 || true
  } > "$output" 2>&1; then
    warn 'Не удалось сохранить диагностику неудачного обновления.'
    return 0
  fi
  chmod 600 "$output" || true
  warn "Диагностика неудачного обновления сохранена: $output"
}

restore_database_exact() {
  local dump_file="$1"
  compose exec -T db sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" dropdb --if-exists --force -U "$POSTGRES_USER" "$POSTGRES_DB" && PGPASSWORD="$POSTGRES_PASSWORD" createdb -U "$POSTGRES_USER" -O "$POSTGRES_USER" "$POSTGRES_DB"' || return 1
  compose exec -T db sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore --exit-on-error -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges' < "$dump_file" || return 1
}

restore_temporary_backup() {
  [[ -n "$TEMP_BACKUP_DIR" ]] || return 1
  [[ -f "$TEMP_BACKUP_DIR/source.tar.gz" && -f "$TEMP_BACKUP_DIR/.env" && -f "$TEMP_BACKUP_DIR/git-revision" && -s "$TEMP_BACKUP_DIR/database.dump" && -s "$TEMP_BACKUP_DIR/site-assets.tar.gz" ]] || return 1
  warn 'Обновление не прошло проверку. Выполняется автоматическое восстановление.'
  compose down --remove-orphans || true
  find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 ! -name '.git' ! -name '.env' -exec rm -rf -- {} + || return 1
  tar -C "$INSTALL_DIR" -xzf "$TEMP_BACKUP_DIR/source.tar.gz" || return 1
  cp "$TEMP_BACKUP_DIR/.env" "$INSTALL_DIR/.env" || return 1; chmod 600 "$INSTALL_DIR/.env" || return 1
  git -C "$INSTALL_DIR" reset --hard "$(<"$TEMP_BACKUP_DIR/git-revision")" || return 1
  install -m 0755 "$TEMP_BACKUP_DIR/installer.sh" "$LAUNCHER_PATH" || return 1
  compose up -d --wait db || return 1
  restore_database_exact "$TEMP_BACKUP_DIR/database.dump" || return 1
  restore_site_assets || return 1
  compose up -d --build --wait || return 1
  wait_ready || return 1
  persist_env || return 1
  return 0
}

recover_failed_update() {
  local stage="${1:-unknown}"
  capture_update_failure_diagnostics "$stage"
  if restore_temporary_backup; then
    warn 'Загруженные файлы также восстановлены из временной копии.'
    die "Обновление отменено: предыдущая версия, настройки и база данных автоматически восстановлены. Диагностика: ${PERSIST_DIR}/last-update-failure.log"
  fi
  KEEP_TEMP_BACKUP=true; die "Автоматическое восстановление не завершилось. Временная копия сохранена: ${TEMP_BACKUP_DIR:-не создана}. Диагностика: ${PERSIST_DIR}/last-update-failure.log"
}

install_app() {
  require_root install; require_ubuntu; install_prerequisites; install_docker
  [[ ! -e "$INSTALL_DIR" ]] || die "${INSTALL_DIR} уже существует. Используйте пункт проверки обновления."
  local domain email admin admin_password tag
  read -r -p 'Домен MIRA-TV для HTTPS: ' domain; validate_domain "$domain"
  read -r -p 'Email для HTTPS-сертификата: ' email; validate_email "$email"
  read -r -p 'Логин администратора: ' admin
  [[ "$admin" =~ ^[A-Za-z][A-Za-z0-9_.-]{2,63}$ ]] || die 'Логин: 3–64 латинских букв, цифр, точка, дефис или подчёркивание.'
  tag="$(latest_tag)"; [[ -n "$tag" ]] || die 'Стабильный релиз MIRA-TV не найден.'; admin_password="$(generated_admin_password)"
  log "Установка ${PROGRAM_NAME} ${tag#v}"; git clone --depth 1 --branch "$tag" "$REPO_URL" "$INSTALL_DIR"
  write_env "$domain" "$email" "$admin" "$admin_password"; start_stack; install -m 0755 "${INSTALL_DIR}/mira-tv.sh" "$LAUNCHER_PATH"; persist_env
  printf '\nMIRA-TV установлен.\nURL: https://%s\nАдминистратор: %s\nПароль: %s\n\n' "$domain" "$admin" "$admin_password"
  info "Рабочий каталог: ${INSTALL_DIR}"; info "Открыть меню: mira-tv"
}

update_app() {
  require_root update; [[ -d "${INSTALL_DIR}/.git" ]] || die 'MIRA-TV не установлен.'
  local installed tag version answer
  installed="$(installed_version)" || die 'Не удалось определить установленную версию MIRA-TV.'; tag="$(latest_tag)"; [[ -n "$tag" ]] || die 'Стабильный релиз MIRA-TV не найден.'; version="${tag#v}"
  printf 'Установлена: %s\nПоследний релиз: %s\n' "$installed" "$version"
  if [[ "$installed" == "$version" ]]; then info "У вас установлена последняя версия MIRA-TV (${installed})."; return 0; fi
  if ! version_is_newer "$installed" "$version"; then info "Установленная версия ${installed} новее стабильной версии ${version}."; return 0; fi
  read -r -p "Доступно обновление до ${version}. Обновить? [y/N]: " answer
  if [[ "${answer,,}" != y ]]; then info 'Обновление отменено.'; return 0; fi
  log "Обновление MIRA-TV ${installed} -> ${version}"; cd "$INSTALL_DIR"
  git fetch --tags --force origin || die 'Не удалось получить теги GitHub.'; git rev-parse "${tag}^{commit}" >/dev/null 2>&1 || die "Не найден релизный тег ${tag}."
  create_temporary_backup
  git checkout -f "$tag" || recover_failed_update 'git checkout release tag'
  merge_env_defaults || recover_failed_update 'merge env defaults'
  sed -i "s|^MIRA_TV_VERSION=.*|MIRA_TV_VERSION=${version}|" .env || recover_failed_update 'update MIRA_TV_VERSION'
  chmod 600 .env || recover_failed_update 'chmod .env'; persist_env || recover_failed_update 'persist merged .env'
  docker compose config --quiet || recover_failed_update 'docker compose config'
  docker compose up -d --build --wait || recover_failed_update 'docker compose up --build --wait'
  wait_ready || recover_failed_update 'wait /readyz'
  install -m 0755 mira-tv.sh "$LAUNCHER_PATH" || recover_failed_update 'install launcher'
  persist_env || recover_failed_update 'persist final .env'
  rm -rf -- "$TEMP_BACKUP_DIR"; TEMP_BACKUP_DIR=""; info "MIRA-TV обновлён до версии ${version}."
}

status_app() { require_root status; compose ps; }
restart_app() { require_root restart; compose restart; }
logs_app() { require_root logs; compose logs -f --tail=200; }

reset_admin_password() {
  require_root reset-admin-password; [[ -d "$INSTALL_DIR/.git" ]] || die 'MIRA-TV не установлен.'
  local username; read -r -p 'Логин администратора (Enter, если администратор один): ' username
  if [[ -n "$username" ]]; then compose exec -T app node src/cli/reset-admin-password.js "$username"; else compose exec -T app node src/cli/reset-admin-password.js; fi
}

remove_app() {
  require_root remove; [[ -d "$INSTALL_DIR" ]] || die 'MIRA-TV не установлен.'
  printf '\nБудет удалено приложение MIRA-TV и его рабочий каталог.\nДанные Docker и секреты доступа к сохранённой базе будут сохранены.\n'
  if ! confirm_action 'Удалить приложение?'; then info 'Удаление отменено.'; return 0; fi
  persist_env; compose down --remove-orphans; rm -rf "$INSTALL_DIR"; rm -f "$LAUNCHER_PATH"
  info "Приложение удалено. Docker-данные и ${PERSIST_ENV} сохранены."
}

purge_app() {
  require_root purge; [[ -d "$INSTALL_DIR" ]] || die 'MIRA-TV не установлен.'
  printf '\nВНИМАНИЕ: будут безвозвратно удалены приложение MIRA-TV, база данных, загруженные файлы, сохранённые секреты и HTTPS-сертификаты.\n'
  if ! confirm_action 'Удалить приложение и ВСЕ данные?'; then info 'Удаление отменено.'; return 0; fi
  compose down -v --remove-orphans; rm -rf "$INSTALL_DIR" "$PERSIST_DIR"; rm -f "$LAUNCHER_PATH"; info 'MIRA-TV и все его данные Docker удалены.'
}

show_menu() {
  printf '\nУстановщик MIRA-TV %s\n' "$SCRIPT_VERSION"
  printf '1) Установить\n2) Проверить обновление\n3) Статус\n4) Перезапустить\n5) Логи\n6) Сбросить пароль администратора\n7) Удалить приложение\n8) Удалить приложение и данные\n9) Создать полную резервную копию\n10) Проверить резервную копию\n11) Восстановить сервер из резервной копии\n0) Выход\n'
  read -r -p 'Выберите действие: ' choice
  case "$choice" in
    1) install_app ;; 2) update_app ;; 3) status_app ;; 4) restart_app ;; 5) logs_app ;; 6) reset_admin_password ;;
    7) remove_app ;; 8) purge_app ;; 9) create_full_backup ;; 10) verify_full_backup ;; 11) restore_full_backup ;;
    0) exit 0 ;; *) die 'Неизвестный пункт меню.' ;;
  esac
}

case "${1:-menu}" in
  install) install_app ;; update) update_app ;; status) status_app ;; restart) restart_app ;; logs) logs_app ;;
  reset-admin-password) reset_admin_password ;; remove) remove_app ;; purge) purge_app ;;
  backup) create_full_backup "${2:-}" ;; verify-backup) verify_full_backup "${2:-}" ;; restore-backup) restore_full_backup "${2:-}" ;;
  menu) show_menu ;;
  *) die 'Команды: install | update | status | restart | logs | reset-admin-password | backup | verify-backup | restore-backup | remove | purge | menu' ;;
esac
