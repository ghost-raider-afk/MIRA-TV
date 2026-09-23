#!/usr/bin/env bash
set -Eeuo pipefail

PROGRAM_NAME="MIRA-TV"
SCRIPT_VERSION="1.13.20"
INSTALL_DIR="/opt/MIRA-TV"
PERSIST_DIR="/var/lib/mira-tv"
PERSIST_ENV="${PERSIST_DIR}/install.env"
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
  if [[ -n "$TEMP_BACKUP_DIR" && -d "$TEMP_BACKUP_DIR" && "$KEEP_TEMP_BACKUP" != true ]]; then rm -rf -- "$TEMP_BACKUP_DIR"; fi
}
trap cleanup_temporary_backup EXIT

confirm_action() { local prompt="$1" answer; read -r -p "${prompt} [YES/NO]: " answer; [[ "$answer" == "YES" ]]; }

require_root() {
  local action="${1:-menu}" source tmp status
  [[ ${EUID:-$(id -u)} -eq 0 ]] && return 0
  command -v sudo >/dev/null 2>&1 || die 'Для этой операции нужны права root. Установите sudo или войдите как root.'
  source="${BASH_SOURCE[0]}"; [[ -r "$source" ]] || die 'Не удалось прочитать текущий установщик для запуска через sudo.'
  tmp="$(mktemp -t 'mira-tv.bootstrap.XXXXXX.sh')"; cat -- "$source" > "$tmp"; chmod 700 "$tmp"
  if sudo bash "$tmp" "$action"; then status=0; else status=$?; fi
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