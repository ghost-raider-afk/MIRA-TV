#!/usr/bin/env bash
set -Eeuo pipefail
PROGRAM_NAME="mira-tv"
SCRIPT_VERSION="1.0.0.1"
INSTALL_DIR="/opt/MIRA-TV"
REPO_URL="https://github.com/ghost-raider-afk/MIRA-TV.git"
GITHUB_REPO="ghost-raider-afk/MIRA-TV"
GITHUB_API_URL="https://api.github.com/repos/$GITHUB_REPO"
COMPOSE_PROJECT="mira-tv"
APP_CONTAINER="mira-tv"
DB_CONTAINER="mira-tv-db"
PROXY_DIR="/opt/MIRA-TV-proxy"
PROXY_NETWORK="mira-tv-proxy"
LAUNCHER_PATH="/usr/local/bin/mira-tv"
log(){ printf '\n==> %s\n' "$*"; }
info(){ printf '    %s\n' "$*"; }
die(){ printf 'ERROR: %s\n' "$*" >&2; exit 1; }
require_root(){ [[ ${EUID:-$(id -u)} -eq 0 ]] || die 'Запустите через sudo.'; }
require_ubuntu(){ . /etc/os-release; [[ ${ID:-} == ubuntu ]] || die 'Поддерживается Ubuntu.'; }
install_docker(){ command -v docker >/dev/null && docker compose version >/dev/null 2>&1 && return; apt-get update; apt-get install -y ca-certificates curl git openssl dnsutils; curl -fsSL https://get.docker.com | sh; systemctl enable --now docker; }
gen(){ openssl rand -base64 48 | tr -dc 'A-Za-z0-9_@%+=-' | head -c "$1"; }
latest_tag(){ curl -fsSL -H 'Accept: application/vnd.github+json' "$GITHUB_API_URL/releases/latest" | sed -nE 's/.*"tag_name"[[:space:]]*:[[:space:]]*"(v[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)".*/\1/p' | head -1; }
ensure_proxy(){
  mkdir -p "$PROXY_DIR"; docker network inspect "$PROXY_NETWORK" >/dev/null 2>&1 || docker network create "$PROXY_NETWORK" >/dev/null
  cat >"$PROXY_DIR/compose.yaml" <<'YAML'
services:
  proxy:
    image: traefik:v3.5
    container_name: mira-tv-proxy
    restart: unless-stopped
    command:
      - --providers.docker=true
      - --providers.docker.exposedbydefault=false
      - --entrypoints.web.address=:80
      - --entrypoints.websecure.address=:443
      - --certificatesresolvers.letsencrypt.acme.tlschallenge=true
      - --certificatesresolvers.letsencrypt.acme.email=${ACME_EMAIL}
      - --certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json
    ports: ["80:80", "443:443"]
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./letsencrypt:/letsencrypt
    networks: [proxy]
networks:
  proxy:
    external: true
    name: mira-tv-proxy
YAML
}
write_env(){
  local domain="$1" admin="$2" pass="$3" dbpass secret
  dbpass="$(gen 32)"; secret="$(gen 64)"
  cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
  sed -i \
    -e "s|^MIRA_TV_DOMAIN=.*|MIRA_TV_DOMAIN=$domain|" \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$dbpass|" \
    -e "s|^SESSION_SECRET=.*|SESSION_SECRET=$secret|" \
    -e "s|^BOOTSTRAP_ADMIN_USERNAME=.*|BOOTSTRAP_ADMIN_USERNAME=$admin|" \
    -e "s|^BOOTSTRAP_ADMIN_PASSWORD=.*|BOOTSTRAP_ADMIN_PASSWORD=$pass|" "$INSTALL_DIR/.env"
  chmod 600 "$INSTALL_DIR/.env"
}
install_app(){
  require_root; require_ubuntu; install_docker
  [[ ! -e "$INSTALL_DIR" ]] || die "$INSTALL_DIR уже существует. Используйте update."
  read -r -p 'HTTPS-домен MIRA-TV: ' domain; [[ -n "$domain" ]] || die 'Домен обязателен.'
  read -r -p 'Email для TLS: ' email; [[ -n "$email" ]] || die 'Email обязателен.'
  read -r -p 'Логин администратора: ' admin; [[ -n "$admin" ]] || die 'Логин обязателен.'
  pass="$(gen 16)"
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
  write_env "$domain" "$admin" "$pass"
  ensure_proxy; printf 'ACME_EMAIL=%s\n' "$email" >"$PROXY_DIR/.env"; mkdir -p "$PROXY_DIR/letsencrypt"; touch "$PROXY_DIR/letsencrypt/acme.json"; chmod 600 "$PROXY_DIR/letsencrypt/acme.json"
  docker compose -f "$PROXY_DIR/compose.yaml" --env-file "$PROXY_DIR/.env" up -d
  cd "$INSTALL_DIR"; docker compose -p "$COMPOSE_PROJECT" --env-file .env up -d --build --wait
  install -m 0755 "$INSTALL_DIR/mira-tv.sh" "$LAUNCHER_PATH"
  printf '\nMIRA-TV установлен.\nURL: https://%s\nАдминистратор: %s\nПароль: %s\n' "$domain" "$admin" "$pass"
}
update_app(){
  require_root; [[ -d "$INSTALL_DIR/.git" ]] || die 'MIRA-TV не установлен.'
  cd "$INSTALL_DIR"; git fetch --tags origin; tag="$(latest_tag)"; [[ -n "$tag" ]] || die 'Стабильный релиз не найден.'; git checkout -f "$tag"; docker compose -p "$COMPOSE_PROJECT" --env-file .env up -d --build --wait
}
status_app(){ cd "$INSTALL_DIR"; docker compose -p "$COMPOSE_PROJECT" --env-file .env ps; }
remove_app(){ require_root; cd "$INSTALL_DIR" 2>/dev/null || true; docker compose -p "$COMPOSE_PROJECT" --env-file .env down 2>/dev/null || true; rm -rf "$INSTALL_DIR"; rm -f "$LAUNCHER_PATH"; }
purge_app(){ require_root; cd "$INSTALL_DIR" 2>/dev/null || true; docker compose -p "$COMPOSE_PROJECT" --env-file .env down -v 2>/dev/null || true; rm -rf "$INSTALL_DIR" "$PROXY_DIR"; rm -f "$LAUNCHER_PATH"; }
case "${1:-menu}" in
 install) install_app;; update) update_app;; status) status_app;; remove) remove_app;; purge) purge_app;;
 check-update) printf 'Последний релиз: %s\n' "$(latest_tag)";;
 menu) printf 'MIRA-TV %s\n1) install  2) update  3) status  4) remove  5) purge\n' "$SCRIPT_VERSION";;
 *) die 'Команды: install | update | status | remove | purge | check-update';;
esac
