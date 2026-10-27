# SSH handoff for transferring an existing MIRA-TV installation.
# Sourced by mira-tv.sh; never executed independently.

MIGRATION_STATE_DIR="/var/lib/mira-tv/migration"
MIGRATION_SOURCE_STATE="$MIGRATION_STATE_DIR/source.state"
# Idle lease: a key is usable for up to 24h without activity. The source
# renews the lease during a verified transfer. A 7-day absolute cap prevents
# abandoned keys from surviving indefinitely; expiry-time is an SSH safeguard.
MIGRATION_IDLE_LEASE_SECONDS=86400
MIGRATION_MAX_KEY_SECONDS=604800

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
  [[ "$1" =~ ^[1-9][0-9]{0,4}$ ]] && (( 10#$1 <= 65535 ))
}

migration_known_hosts_entry() {
  local ip="$1" port="$2" key="$3"
  migration_valid_ipv4 "$ip" && migration_valid_port "$port" || return 1
  [[ "$key" =~ ^[A-Za-z0-9+/=]{40,200}$ ]] || return 1
  if [[ "$port" == 22 ]]; then
    printf '%s ssh-ed25519 %s\n' "$ip" "$key"
  else
    printf '[%s]:%s ssh-ed25519 %s\n' "$ip" "$port" "$key"
  fi
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


migration_source_touch_lease() {
  local now id current_expiry hard_expiry next_expiry tmp
  [[ -f "$MIGRATION_SOURCE_STATE" ]] || return 1
  id="$(sed -n '1p' "$MIGRATION_SOURCE_STATE")"
  current_expiry="$(sed -n '2p' "$MIGRATION_SOURCE_STATE")"
  hard_expiry="$(sed -n '3p' "$MIGRATION_SOURCE_STATE")"
  [[ "$id" =~ ^[0-9a-f]{24}$ && "$current_expiry" =~ ^[0-9]{10}$ &&
     "$hard_expiry" =~ ^[0-9]{10}$ ]] || return 1
  now="$(date -u +%s)" || return 1
  (( now < current_expiry && now < hard_expiry )) || return 1
  next_expiry=$(( now + MIGRATION_IDLE_LEASE_SECONDS ))
  (( next_expiry > hard_expiry )) && next_expiry="$hard_expiry"
  tmp="$(mktemp "$MIGRATION_STATE_DIR/.lease.XXXXXX")" || return 1
  chmod 600 "$tmp"
  printf '%s\n%s\n%s\n' "$id" "$next_expiry" "$hard_expiry" > "$tmp" || {
    rm -f -- "$tmp"; return 1
  }
  mv -f -- "$tmp" "$MIGRATION_SOURCE_STATE" || {
    rm -f -- "$tmp"; return 1
  }
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
  local ip port expires id key_dir host_key package now idle_expiry hard_expiry
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
  now="$(date -u +%s)"
  idle_expiry=$(( now + MIGRATION_IDLE_LEASE_SECONDS ))
  hard_expiry=$(( now + MIGRATION_MAX_KEY_SECONDS ))
  expires="$(date -u -d "@$hard_expiry" +%Y%m%d%H%M%SZ)"
  host_key="$(awk '$1=="ssh-ed25519" {print $2;exit}' /etc/ssh/ssh_host_ed25519_key.pub)"
  [[ "$host_key" =~ ^[A-Za-z0-9+/=]+$ ]] || die 'Не удалось прочитать SSH host key.'
  migration_source_clear_key
  # The key cannot open an interactive shell or forward network connections.
  printf 'restrict,expiry-time="%s",command="/bin/bash %s/mira-tv.sh migrate-remote" %s # MIRA-TV-MIGRATION-%s\n' \
    "$expires" "$INSTALL_DIR" "$(cut -d' ' -f1,2 "$key_dir/key.pub")" "$id" >> /root/.ssh/authorized_keys
  printf '%s\n%s\n%s\n' "$id" "$idle_expiry" "$hard_expiry" > "$MIGRATION_SOURCE_STATE"
  chmod 600 "$MIGRATION_SOURCE_STATE"
  # The handoff contains an authentication secret. It must not go into logs.
  package="$(printf '%s\n%s\n%s\n%s\n' "$ip" "$port" "$host_key" "$(base64 -w0 < "$key_dir/key")" | base64 -w0)"
  rm -rf -- "$key_dir"
  printf '\nСОХРАНИТЕ КОМПЛЕКТ ПОДКЛЮЧЕНИЯ (показывается один раз):\n\nMIRA1.%s\n\n' "$package"
  info 'Подключитесь в течение 24 часов; во время передачи доступ продлевается автоматически.'
  info 'Предельный срок временного ключа — 7 дней. После 24 часов без активности доступ истекает.'
  info 'Не отправляйте этот комплект в чат, почту или журнал терминала.'
  info 'Продолжайте на новом сервере: MIRA-TV → «Новый сервер».'
}

migration_source_cancel() {
  require_root migrate-cancel
  migration_source_clear_key
  rm -f -- "$MIGRATION_SOURCE_STATE"
  info 'Временный SSH-доступ миграции отозван. Приложение и данные не изменены.'
}


# Preliminary copy: production continues to serve traffic and is never stopped.
# These files are NOT a cutover-safe final snapshot while app writes continue.
migration_source_snapshot() {
  [[ -f "$MIGRATION_SOURCE_STATE" && -f "$INSTALL_DIR/.env" ]] || return 1
  [[ ! -f "$MIGRATION_STATE_DIR/source-frozen" ]] || return 1
  local work revision
  work="$(mktemp -d "$MIGRATION_STATE_DIR/snapshot.XXXXXX")" || return 1
  chmod 700 "$work"
  (
    heartbeat_pid=''
    migration_snapshot_cleanup() {
      if [[ -n "$heartbeat_pid" ]]; then
        kill "$heartbeat_pid" 2>/dev/null || true
        wait "$heartbeat_pid" 2>/dev/null || true
      fi
      rm -rf -- "$work"
    }
    trap migration_snapshot_cleanup EXIT
    # Keep access renewable even during a multi-hour SSH archive stream.
    # A failed or abandoned transfer stops its own heartbeat on exit.
    (
      while sleep 300; do
        migration_source_touch_lease || exit 1
      done
    ) &
    heartbeat_pid=$!
    cd "$INSTALL_DIR" || exit 1
    revision="$(git rev-parse HEAD)" || exit 1
    [[ "$revision" =~ ^[0-9a-f]{40}$ ]] || exit 1
    install -m 0600 .env "$work/install.env" || exit 1
    printf '%s\n' "$revision" > "$work/revision"
    docker compose exec -T db sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges' > "$work/database.dump" || exit 1
    [[ -s "$work/database.dump" ]] || exit 1
    docker compose exec -T app sh -ec 'tar -C "$SITE_ASSETS_ROOT" -czf - .' > "$work/site-assets.tar.gz" || exit 1
    [[ -s "$work/site-assets.tar.gz" ]] || exit 1
    docker volume inspect mira-tv-letsencrypt >/dev/null 2>&1 || exit 1
    docker run --rm --network none -v mira-tv-letsencrypt:/certs:ro busybox:1.37.0@sha256:9db7b59979c38555a39def84a31fb98b5296952f9e3afd4f6f11f05b07adfab0 \
      tar -C /certs -czf - . > "$work/letsencrypt.tar.gz" || exit 1
    [[ -s "$work/letsencrypt.tar.gz" ]] || exit 1
    (cd "$work" && sha256sum install.env revision database.dump site-assets.tar.gz letsencrypt.tar.gz > SHA256SUMS) || exit 1
    tar -C "$work" -czf - SHA256SUMS install.env revision database.dump site-assets.tar.gz letsencrypt.tar.gz
  )
}

migration_archive_validate() {
  local archive="$1" target="$2" expected actual
  [[ -s "$archive" && -d "$target" ]] || return 1
  expected="$(printf '%s\n' SHA256SUMS install.env revision database.dump site-assets.tar.gz letsencrypt.tar.gz | sort)"
  actual="$(tar -tzf "$archive" | sort)" || return 1
  [[ "$actual" == "$expected" ]] || return 1
  tar -xzf "$archive" -C "$target" --no-same-owner --no-same-permissions || return 1
  (cd "$target" && sha256sum -c SHA256SUMS >/dev/null) || return 1
  [[ -s "$target/database.dump" && -s "$target/site-assets.tar.gz" && -s "$target/letsencrypt.tar.gz" ]] || return 1
  [[ -s "$target/install.env" && -s "$target/revision" ]] || return 1
  [[ "$(cat "$target/revision")" =~ ^[0-9a-f]{40}$ ]] || return 1
  tar -tzf "$target/site-assets.tar.gz" >/dev/null || return 1
  tar -tzf "$target/letsencrypt.tar.gz" >/dev/null || return 1
}

migration_target_stage() {
  local ssh_ip="$1" ssh_port="$2" conn_dir="$3" revision="$4"
  [[ ! -e "$MIGRATION_STATE_DIR/staged" ]] || die 'Предварительная копия уже есть. Требуется отдельное подтверждение повторного переноса.'
  install -d -m 0700 "$MIGRATION_STATE_DIR"
  local work
  work="$(mktemp -d "$MIGRATION_STATE_DIR/staging.XXXXXX")" || die 'Не удалось выделить каталог предварительной копии.'
  chmod 700 "$work"
  # This stream contains authentication secrets. It must only be written to a root-owned directory.
  local -a ssh_args=(
    -T -F /dev/null -o BatchMode=yes -o IdentitiesOnly=yes
    -o StrictHostKeyChecking=yes -o GlobalKnownHostsFile=/dev/null
    -o UserKnownHostsFile="$conn_dir/known_hosts" -o HostKeyAlgorithms=ssh-ed25519
    -o ConnectTimeout=10 -o ConnectionAttempts=1
    -o ServerAliveInterval=20 -o ServerAliveCountMax=3
    -i "$conn_dir/id_ed25519" -p "$ssh_port"
  )
  if ! ssh "${ssh_args[@]}" "root@$ssh_ip" snapshot > "$work/bundle.tar.gz"; then
    rm -rf -- "$work"
    die 'Предварительная SSH-передача прервана. Исходный сервер не изменён.'
  fi
  if ! migration_archive_validate "$work/bundle.tar.gz" "$work"; then
    rm -rf -- "$work"
    die 'Снимок не прошёл проверку целостности. Исходный сервер не изменён.'
  fi
  [[ "$(cat "$work/revision")" == "$revision" ]] || {
    rm -rf -- "$work"
    die 'Исходный Git HEAD изменился во время переноса. Повторите миграцию.'
  }
  chmod -R go-rwx "$work"
  rm -f -- "$work/bundle.tar.gz"
  mv -- "$work" "$MIGRATION_STATE_DIR/staged" || {
    rm -rf -- "$work"
    die 'Не удалось зафиксировать предварительную копию.'
  }
  info "Предварительная копия БД, ресурсов, .env и HTTPS сохранена в $MIGRATION_STATE_DIR/staged"
  warn 'Копия НЕ финальная: источник продолжает принимать изменения. Переключение на новый сервер запрещено.'
}

migration_source_remote() {
  # Invoked exclusively by the forced-command authorized_keys entry.
  [[ -n "${SSH_ORIGINAL_COMMAND:-}" && -f "$MIGRATION_SOURCE_STATE" ]] || exit 1
  # Reject unexpected SSH commands without extending the access lease.
  case "$SSH_ORIGINAL_COMMAND" in
    probe)
      migration_source_touch_lease || exit 1
      [[ -f "$INSTALL_DIR/.env" ]] || exit 1
      local version domain revision
      version="$(installed_version)"
      domain="$(sed -nE 's/^MIRA_TV_DOMAIN=(.*)$/\1/p' "$INSTALL_DIR/.env" | head -1)"
      revision="$(git -C "$INSTALL_DIR" rev-parse HEAD)"
      [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$revision" =~ ^[a-f0-9]{40}$ ]] || exit 1
      validate_domain "$domain"
      printf 'MIRA-TV-SSH-1\n%s\n%s\n%s\n' "$version" "$revision" "$domain"
      ;;
    snapshot)
      migration_source_touch_lease || exit 1
      migration_source_snapshot
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
    local container
    for container in mira-tv-db mira-tv mira-tv-proxy mira-tv-site-assets-init mira-tv-proxy-config-init; do
      docker container inspect "$container" >/dev/null 2>&1 &&
        die "На целевом сервере существует контейнер $container. Перезапись запрещена."
    done
    for volume in mira-tv-db-data mira-tv-site-assets mira-tv-letsencrypt mira-tv-proxy-config; do
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
  migration_known_hosts_entry "$ip" "$port" "$host_key" > "$tmp/known_hosts"
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
  migration_target_stage "$ip" "$port" "$tmp" "${result_fields[2]}"
  rm -rf -- "$tmp"
  migration_target_prepare
  warn 'Финальное переключение ещё не реализовано — исходный сервер продолжает работать.'
}

migration_target_discard() {
  require_root migrate-discard
  local stage="$MIGRATION_STATE_DIR/staged"
  [[ -d "$stage" && ! -L "$stage" ]] || {
    info 'Предварительная копия отсутствует.'
    return 0
  }
  [[ ! -e "$MIGRATION_STATE_DIR/target-prepared" && ! -e "$MIGRATION_STATE_DIR/target-preparing" ]] ||
    die 'Сначала отмените подготовку нового сервера, затем удалите предварительную копию.'
  rm -rf -- "$stage"
  info 'Предварительная копия удалена. Исходный сервер и его данные не изменены.'
}

# Restore the validated preliminary archive on a brand-new target without
# starting the public Traefik proxy or changing the source.
migration_target_prepare() (
  set -Eeuo pipefail
  require_root migrate-prepare
  require_ubuntu
  local staged="$MIGRATION_STATE_DIR/staged" volume version revision state
  state="$MIGRATION_STATE_DIR/target-prepared"
  [[ -d "$staged" && -s "$staged/install.env" && -s "$staged/revision" ]] ||
    die 'Сначала получите и проверьте предварительную копию по SSH.'
  [[ ! -e "$INSTALL_DIR" && ! -e "$state" && ! -e "$MIGRATION_STATE_DIR/target-preparing" ]] ||
    die 'На новом сервере есть незавершённая подготовка. Сначала воспользуйтесь безопасной очисткой.'
  revision="$(cat "$staged/revision")"
  version="$(sed -nE 's/^MIRA_TV_VERSION=([0-9]+\.[0-9]+\.[0-9]+)$/\1/p' "$staged/install.env" | head -1)"
  [[ "$revision" =~ ^[0-9a-f]{40}$ && "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] ||
    die 'Повреждены метаданные версии в предварительной копии.'
  [[ "$(grep -c '^MIRA_TV_VERSION=' "$staged/install.env")" == 1 ]] ||
    die 'Файл конфигурации содержит неоднозначную версию.'
  install_prerequisites
  install_docker
  local container
  for container in mira-tv-db mira-tv mira-tv-proxy mira-tv-site-assets-init mira-tv-proxy-config-init; do
    docker container inspect "$container" >/dev/null 2>&1 &&
      die "На целевом сервере существует контейнер $container. Восстановление запрещено."
  done
  for volume in mira-tv-db-data mira-tv-site-assets mira-tv-letsencrypt mira-tv-proxy-config; do
    docker volume inspect "$volume" >/dev/null 2>&1 &&
      die "На целевом сервере уже существует Docker volume $volume. Восстановление запрещено."
  done
  # This marker proves that all subsequent artifacts are owned by this migration.
  install -m 0600 /dev/null "$MIGRATION_STATE_DIR/target-preparing"
  printf '%s\n' "$revision" > "$MIGRATION_STATE_DIR/target-preparing"
  local completed=no
  migration_prepare_rollback() {
    [[ "$completed" == yes ]] && return 0
    if [[ -d "$INSTALL_DIR" ]]; then
      (cd "$INSTALL_DIR" && docker compose down -v --remove-orphans) >/dev/null 2>&1 || true
      rm -rf -- "$INSTALL_DIR"
    fi
    # Volumes created during an unsuccessful preparation only, never original volumes.
    for volume in mira-tv-db-data mira-tv-site-assets mira-tv-letsencrypt mira-tv-proxy-config; do
      docker volume rm "$volume" >/dev/null 2>&1 || true
    done
  }
  trap migration_prepare_rollback EXIT
  git clone --quiet --depth 1 --branch "v$version" "$REPO_URL" "$INSTALL_DIR" ||
    die 'Не удалось загрузить исходную версию MIRA-TV.'
  [[ "$(git -C "$INSTALL_DIR" rev-parse HEAD)" == "$revision" ]] ||
    die 'Git HEAD установочного пакета отличается от исходного сервера.'
  install -m 0600 "$staged/install.env" "$INSTALL_DIR/.env"
  cd "$INSTALL_DIR"
  docker compose config --quiet ||
    die 'Неверная конфигурация Docker Compose для исходной версии.'
  docker compose up -d --wait db ||
    die 'PostgreSQL не запустился на целевом сервере.'
  docker compose exec -T db sh -ec 'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore --exit-on-error -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges' \
    < "$staged/database.dump" || die 'Восстановление PostgreSQL не завершилось.'
  docker compose run --rm --no-deps -T site-assets-init sh -ec \
    'mkdir -p "$SITE_ASSETS_ROOT"; tar -C "$SITE_ASSETS_ROOT" -xzf -' \
    < "$staged/site-assets.tar.gz" ||
    die 'Восстановление изображений не завершилось.'
  docker volume create mira-tv-letsencrypt >/dev/null
  docker run --rm -i --network none -v mira-tv-letsencrypt:/certs \
    busybox:1.37.0@sha256:9db7b59979c38555a39def84a31fb98b5296952f9e3afd4f6f11f05b07adfab0 \
    tar -C /certs -xzf - < "$staged/letsencrypt.tar.gz" ||
    die 'Восстановление HTTPS-хранилища не завершилось.'
  # Start only the internal app, NEVER the public proxy before final cutover.
  docker compose up -d --build --wait app ||
    die 'Внутренний запуск нового приложения завершился ошибкой.'
  wait_ready 30 || die 'Новый сервер не подтвердил /readyz.'
  # Smoke check: database tables needed for existing TV registrations.
  docker compose exec -T db sh -ec \
    'PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "SELECT (SELECT count(*) FROM tv_devices), (SELECT count(*) FROM tv_device_bindings WHERE active), (SELECT count(*) FROM tv_device_sessions WHERE revoked_at IS NULL)"' \
    > "$MIGRATION_STATE_DIR/tv-records-prepared" ||
    die 'Не удалось проверить перенесённые регистрации ТВ.'
  docker compose stop app ||
    die 'Не удалось остановить внутреннее тестовое приложение.'
  install -m 0600 "$staged/revision" "$state"
  rm -f -- "$MIGRATION_STATE_DIR/target-preparing"
  completed=yes
  info 'Предварительная копия восстановлена; PostgreSQL, ресурсы и /readyz проверены.'
  info 'Публичный Traefik на новом сервере не запускался. Источник продолжает работать.'
  warn 'Это НЕ окончательный перенос: изменения с исходного сервера необходимо синхронизировать повторно.'
)


migration_target_reset() {
  require_root migrate-reset
  local marker="$MIGRATION_STATE_DIR/target-preparing"
  local prepared="$MIGRATION_STATE_DIR/target-prepared"
  [[ -f "$marker" || -f "$prepared" ]] ||
    die 'Не найдено состояния подготовки MIRA-TV. Очистка существующей установки запрещена.'
  [[ ! -f "$MIGRATION_STATE_DIR/target-active" ]] ||
    die 'Нельзя очищать сервер после активации. Требуется отдельная процедура безопасного отката.'
  if command -v docker >/dev/null 2>&1; then
    [[ "$(docker ps --filter 'name=^/mira-tv-proxy$' --format '{{.ID}}' | head -1)" == "" ]] ||
      die 'Обнаружен работающий публичный Traefik. Автоматическая очистка запрещена.'
  fi
  if [[ -d "$INSTALL_DIR" ]]; then
    if [[ -f "$INSTALL_DIR/compose.yaml" ]]; then
      (cd "$INSTALL_DIR" && docker compose down -v --remove-orphans) ||
        die 'Невозможно остановить целевую тестовую установку. Данные не удалены.'
    fi
    rm -rf -- "$INSTALL_DIR"
  fi
  if command -v docker >/dev/null 2>&1; then
    local volume
    for volume in mira-tv-db-data mira-tv-site-assets mira-tv-letsencrypt mira-tv-proxy-config; do
      docker volume rm "$volume" >/dev/null 2>&1 ||
        { docker volume inspect "$volume" >/dev/null 2>&1 && die "Не удалось удалить тестовый volume $volume."; }
    done
  fi
  rm -f -- "$marker" "$prepared" "$MIGRATION_STATE_DIR/tv-records-prepared"
  info 'Тестовая установка удалена. Предварительная копия сохранена для повторной подготовки.'
}
