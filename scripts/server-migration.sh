# SSH handoff for transferring an existing MIRA-TV installation.
# Sourced by mira-tv.sh; never executed independently.

MIGRATION_STATE_DIR="/var/lib/mira-tv/migration"
MIGRATION_SOURCE_STATE="$MIGRATION_STATE_DIR/source.state"

migration_valid_ipv4() {
  local ip="$1" part
  [[ "$ip" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || return 1
  local -a octets
  IFS='.' read -r -a octets <<< "$ip"
  for part in "${octets[@]}"; do
    [[ "$part" =~ ^(0|[1-9][0-9]{0,2})$ ]] && (( 10#$part <= 255 )) || return 1
  done
  [[ "$ip" != "0.0.0.0" ]] || return 1
}

migration_valid_port() {
  [[ "$1" =~ ^[0-9]{1,5}$ ]] && (( 10#$1 >= 1 && 10#$1 <= 65535 ))
}

migration_source_clear_key() {
  local key_file="/root/.ssh/authorized_keys"
  [[ -f "$key_file" ]] || return 0
  local filtered
  filtered="$(mktemp /root/.ssh/.authorized_keys.XXXXXX)" || return 1
  chmod 600 "$filtered"
  # Only delete keys issued by this installer, preserving all other access.
  grep -v ' # MIRA-TV-MIGRATION-' "$key_file" > "$filtered" || [[ $? -eq 1 ]]
  cat "$filtered" > "$key_file"
  rm -f -- "$filtered"
}

migration_source_setup() {
  require_root migrate-source
  [[ -f "$INSTALL_DIR/.env" && -f "$INSTALL_DIR/mira-tv.sh" ]] || die 'MIRA-TV должна быть установлена на исходном сервере.'
  [[ -f /etc/ssh/ssh_host_ed25519_key.pub ]] || die 'На исходном сервере должен работать OpenSSH с host key Ed25519.'
  command -v ssh-keygen >/dev/null 2>&1 || die 'Нужен установленный OpenSSH.'
  command -v sshd >/dev/null 2>&1 || die 'Нужен работающий SSH-сервер.'
  if ! systemctl is-active --quiet ssh && ! systemctl is-active --quiet sshd; then
    die 'SSH-сервер не запущен.'
  fi
  [[ ! -f "$MIGRATION_SOURCE_STATE" ]] || die 'Временный доступ уже подготовлен. Сначала отмените его.'
  local ip port expires id key_dir host_key package
  read -r -p 'Публичный IPv4 исходного сервера: ' ip
  migration_valid_ipv4 "$ip" || die 'Некорректный IPv4.'
  read -r -p 'SSH-порт [22]: ' port
  port="${port:-22}"
  migration_valid_port "$port" || die 'Некорректный SSH-порт.'
  install -d -m 700 "$MIGRATION_STATE_DIR" /root/.ssh
  touch /root/.ssh/authorized_keys
  chmod 600 /root/.ssh/authorized_keys
  key_dir="$(mktemp -d "$MIGRATION_STATE_DIR/key.XXXXXX")"
  chmod 700 "$key_dir"
  ssh-keygen -q -t ed25519 -N '' -f "$key_dir/key" -C 'mira-tv-ephemeral' || die 'Не удалось создать временный SSH-ключ.'
  id="$(openssl rand -hex 12)"
  expires="$(date -u -d '+2 hours' +%Y%m%d%H%M%SZ)"
  host_key="$(awk '$1=="ssh-ed25519" {print $2;exit}' /etc/ssh/ssh_host_ed25519_key.pub)"
  [[ "$host_key" =~ ^[A-Za-z0-9+/=]+$ ]] || die 'Не удалось прочитать SSH host key.'
  migration_source_clear_key
  # The key cannot open an interactive shell or forward network connections.
  printf 'restrict,expiry-time="%s",command="/bin/bash %s/mira-tv.sh migrate-remote" %s # MIRA-TV-MIGRATION-%s\n' \
    "$expires" "$INSTALL_DIR" "$(cut -d' ' -f1,2 "$key_dir/key.pub")" "$id" >> /root/.ssh/authorized_keys
  printf '%s\n%s\n' "$id" "$(date -u -d '+2 hours' +%s)" > "$MIGRATION_SOURCE_STATE"
  chmod 600 "$MIGRATION_SOURCE_STATE"
  # The handoff contains an authentication secret. It must not go into logs.
  package="$(printf '%s\n%s\n%s\n%s\n' "$ip" "$port" "$host_key" "$(base64 -w0 < "$key_dir/key")" | base64 -w0)"
  rm -rf -- "$key_dir"
  printf '\nСОХРАНИТЕ КОМПЛЕКТ ПОДКЛЮЧЕНИЯ (показывается один раз):\n\nMIRA1.%s\n\n' "$package"
  info 'Доступ ограничен двумя часами и только проверенными командами миграции.'
  info 'Не отправляйте этот комплект в чат, почту или журнал терминала.'
  info 'Продолжайте на новом сервере: MIRA-TV → «Новый сервер».'
}

migration_source_cancel() {
  require_root migrate-cancel
  migration_source_clear_key
  rm -f -- "$MIGRATION_SOURCE_STATE"
  info 'Временный SSH-доступ миграции отозван. Приложение и данные не изменены.'
}

migration_source_remote() {
  # Invoked exclusively by the forced-command authorized_keys entry.
  [[ -n "${SSH_ORIGINAL_COMMAND:-}" && -f "$MIGRATION_SOURCE_STATE" ]] || exit 1
  local id expires
  read -r id < "$MIGRATION_SOURCE_STATE"
  expires="$(sed -n '2p' "$MIGRATION_SOURCE_STATE")"
  [[ "$id" =~ ^[0-9a-f]{24}$ && "$expires" =~ ^[0-9]{10}$ ]] || exit 1
  (( $(date -u +%s) < expires )) || exit 1
  case "$SSH_ORIGINAL_COMMAND" in
    probe)
      [[ -f "$INSTALL_DIR/.env" ]] || exit 1
      local version domain revision
      version="$(installed_version)"
      domain="$(sed -nE 's/^MIRA_TV_DOMAIN=(.*)$/\1/p' "$INSTALL_DIR/.env" | head -1)"
      revision="$(git -C "$INSTALL_DIR" rev-parse HEAD)"
      [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$revision" =~ ^[a-f0-9]{40}$ ]] || exit 1
      validate_domain "$domain"
      printf 'MIRA-TV-SSH-1\n%s\n%s\n%s\n' "$version" "$revision" "$domain"
      ;;
    *) exit 1 ;;
  esac
}

migration_target_probe() {
  require_root migrate-target
  require_ubuntu
  if [[ -e "$INSTALL_DIR" ]]; then
    die 'Целевой сервер должен быть пустым: /opt/MIRA-TV уже существует. Данные не будут перезаписаны.'
  fi
  local volume
  if command -v docker >/dev/null 2>&1; then
    for volume in mira-tv-db-data mira-tv-site-assets mira-tv-letsencrypt; do
      docker volume inspect "$volume" >/dev/null 2>&1 && die "На новом сервере обнаружен существующий Docker volume: $volume"
    done
  fi
  command -v ssh >/dev/null 2>&1 || die 'Установите openssh-client перед переносом.'
  local token encoded tmp ip port host_key private_key result
  read -r -s -p 'Вставьте комплект MIRA1 с исходного сервера (ввод скрыт): ' token
  printf '\n'
  [[ "$token" =~ ^MIRA1\.[A-Za-z0-9+/=]{100,4096}$ ]] || die 'Неверный формат комплекта подключения.'
  encoded="${token#MIRA1.}"
  tmp="$(mktemp -d -t mira-tv-migrate.XXXXXX)"
  chmod 700 "$tmp"
  if ! printf '%s' "$encoded" | base64 -d > "$tmp/bundle" 2>/dev/null; then
    rm -rf -- "$tmp"; die 'Не удалось прочитать комплект подключения.'
  fi
  local -a fields
  mapfile -t fields < "$tmp/bundle"
  [[ "${#fields[@]}" -eq 4 ]] || { rm -rf -- "$tmp"; die 'Комплект подключения неполный.'; }
  ip="${fields[0]}"; port="${fields[1]}"; host_key="${fields[2]}"; private_key="${fields[3]}"
  migration_valid_ipv4 "$ip" && migration_valid_port "$port" && [[ "$host_key" =~ ^[A-Za-z0-9+/=]{40,200}$ ]] && [[ "$private_key" =~ ^[A-Za-z0-9+/=]{200,2000}$ ]] || {
    rm -rf -- "$tmp"; die 'Некорректные параметры SSH.'
  }
  if ! printf '%s' "$private_key" | base64 -d > "$tmp/id_ed25519" 2>/dev/null; then
    rm -rf -- "$tmp"; die 'Неверный временный SSH-ключ.'
  fi
  chmod 600 "$tmp/id_ed25519"
  # Trust only the host key included in the out-of-band transfer bundle.
  if [[ "$port" == 22 ]]; then
    printf '%s ssh-ed25519 %s\n' "$ip" "$host_key" > "$tmp/known_hosts"
  else
    printf '[%s]:%s ssh-ed25519 %s\n' "$ip" "$port" "$host_key" > "$tmp/known_hosts"
  fi
  chmod 600 "$tmp/known_hosts"
  unset token encoded private_key
  local -a ssh_args=(
    -T -F /dev/null -o BatchMode=yes -o IdentitiesOnly=yes
    -o StrictHostKeyChecking=yes -o GlobalKnownHostsFile=/dev/null
    -o UserKnownHostsFile="$tmp/known_hosts" -o HostKeyAlgorithms=ssh-ed25519
    -o ConnectTimeout=10 -o ConnectionAttempts=1
    -o ServerAliveInterval=20 -o ServerAliveCountMax=3
    -i "$tmp/id_ed25519" -p "$port"
  )
  if ! result="$(ssh "${ssh_args[@]}" "root@$ip" probe)"; then
    rm -rf -- "$tmp"; die 'SSH-проверка не прошла. Проверьте SSH-порт, разрешение root по ключу и firewall.'
  fi
  rm -rf -- "$tmp"
  local -a result_fields
  mapfile -t result_fields <<< "$result"
  [[ "${#result_fields[@]}" -eq 4 && "${result_fields[0]}" == 'MIRA-TV-SSH-1' ]] || die 'Исходный сервер вернул неверный протокол.'
  [[ "${result_fields[1]}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "${result_fields[2]}" =~ ^[a-f0-9]{40}$ ]] || die 'Не удалось проверить версию исходного сервера.'
  validate_domain "${result_fields[3]}"
  printf '\nSSH-соединение подтверждено:\n'
  info "Исходный сервер: $ip:$port"
  info "Версия MIRA-TV: ${result_fields[1]}"
  info "HEAD: ${result_fields[2]}"
  info "Домен: ${result_fields[3]}"
  warn 'Передача данных и переключение пока НЕ запускаются: реализован первый безопасный этап — одноразовое SSH-сопряжение.'
}
