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
  if ! awk 'index($0, " # MIRA-TV-MIGRATION-") == 0 { print }' "$key_file" > "$filtered"; then
    rm -f -- "$filtered"
    return 1
  fi
  mv -f -- "$filtered" "$key_file"
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
  [[ ! -e "$MIGRATION_STATE_DIR/source-frozen" &&
     ! -e "$MIGRATION_STATE_DIR/source-handoff" &&
     ! -e "$MIGRATION_STATE_DIR/proxy-retired" ]] ||
    die 'Сервер уже находится в процессе переноса или работает как прокси.'
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
  if [[ -f "$MIGRATION_STATE_DIR/source-frozen" ]]; then
    [[ -f "$MIGRATION_STATE_DIR/source-handoff" &&
       "$(cat "$MIGRATION_STATE_DIR/source-handoff")" == active\ * ]] ||
      die 'Исходный сервер заморожен: сначала восстановите его или завершите переключение.'
  fi
  migration_source_clear_key
  rm -f -- "$MIGRATION_SOURCE_STATE"
  info 'Временный SSH-доступ миграции отозван. Приложение и данные не изменены.'
}


# Preliminary copy: production continues to serve traffic and is never stopped.
# These files are NOT a cutover-safe final snapshot while app writes continue.

# Quiesce the only application writer before the final snapshot. Keep the
# database available for pg_dump and the existing public TLS endpoint alive.
migration_source_frozen_verified() {
  [[ -f "$MIGRATION_STATE_DIR/source-frozen" &&
     "$(cat "$MIGRATION_STATE_DIR/source-frozen")" == ready ]] || return 1
  local running policy
  running="$(docker inspect -f '{{.State.Running}}' mira-tv 2>/dev/null)" || return 1
  policy="$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' mira-tv 2>/dev/null)" || return 1
  [[ "$running" == false && "$policy" == no ]]
}

migration_source_freeze() {
  [[ -f "$INSTALL_DIR/.env" && -f "$MIGRATION_SOURCE_STATE" ]] || return 1
  [[ ! -f "$MIGRATION_STATE_DIR/source-handoff" ]] || return 1
  if migration_source_frozen_verified; then return 0; fi
  [[ ! -e "$MIGRATION_STATE_DIR/source-frozen" ]] || return 1
  install -m 0600 /dev/null "$MIGRATION_STATE_DIR/source-frozen" || return 1
  printf '%s\n' preparing > "$MIGRATION_STATE_DIR/source-frozen"
  # Fail closed across a Docker daemon restart, including a host reboot.
  docker update --restart=no mira-tv >/dev/null || return 1
  (cd "$INSTALL_DIR" && docker compose stop -t 30 app) || return 1
  [[ "$(docker inspect -f '{{.State.Running}}' mira-tv)" == false ]] || return 1
  printf '%s\n' ready > "$MIGRATION_STATE_DIR/source-frozen"
  migration_source_frozen_verified || return 1
  printf 'MIRA-TV-SOURCE-FROZEN-1\n'
}

migration_source_resume() {
  [[ ! -f "$MIGRATION_STATE_DIR/source-handoff" ]] ||
    die 'Новый сервер уже назначен основным: возвращать старую БД в запись запрещено.'
  [[ -f "$MIGRATION_STATE_DIR/source-frozen" ]] || {
    info 'Исходный сервер не заморожен.'
    return 0
  }
  docker update --restart=unless-stopped mira-tv >/dev/null ||
    die 'Не удалось восстановить политику перезапуска исходного приложения.'
  (cd "$INSTALL_DIR" && docker compose up -d --wait app) ||
    die 'Не удалось возобновить приложение; блокировка записи сохранена.'
  rm -f -- "$MIGRATION_STATE_DIR/source-frozen"
  info 'Исходный сервер снова принимает записи; финальную копию необходимо создать повторно.'
}



# Arm the irreversible writer handoff before starting the destination app.
# This prevents an old-source resume in the narrow activation window.

# Old-IP retirement: fail closed on DNS, HTTPS, TCP or traffic uncertainty.
MIGRATION_PROXY_QUIET_SECONDS=1209600

migration_proxy_dns_points_to() {
  local domain="$1" ip="$2" line found=no answers
  migration_valid_ipv4 "$ip" || return 1
  answers="$(dig +short A "$domain" 2>/dev/null)" || return 1
  [[ -n "$answers" ]] || return 1
  while IFS= read -r line; do
    migration_valid_ipv4 "$line" && [[ "$line" == "$ip" ]] || return 1
    found=yes
  done <<< "$answers"
  [[ "$found" == yes ]] || return 1
  local ipv6
  ipv6="$(dig +short AAAA "$domain" 2>/dev/null)" || return 1
  [[ -z "$ipv6" ]]
}

migration_proxy_network_bytes() {
  local pid
  pid="$(docker inspect -f '{{.State.Pid}}' mira-tv-proxy 2>/dev/null)" || return 1
  [[ "$pid" =~ ^[1-9][0-9]*$ && -r "/proc/$pid/net/dev" ]] || return 1
  awk 'NR > 2 && $1 !~ /^lo:/ { bytes += $2 + $10; count++ }
       END { if (!count) exit 1; printf "%.0f\n", bytes }' "/proc/$pid/net/dev"
}

migration_proxy_monitor_install() {
  local root='/etc/systemd/system'
  [[ -f "$LAUNCHER_PATH" ]] || return 1
  cat > "$root/mira-tv-migration-watch.service" <<'SERVICE'
[Unit]
Description=MIRA-TV source proxy retirement safety check
After=docker.service
Requires=docker.service
[Service]
Type=oneshot
ExecStart=/usr/local/bin/mira-tv migrate-proxy-check
SERVICE
  cat > "$root/mira-tv-migration-watch.timer" <<'TIMER'
[Unit]
Description=Check whether the old MIRA-TV proxy can be retired
[Timer]
OnCalendar=hourly
Persistent=true
RandomizedDelaySec=300
[Install]
WantedBy=timers.target
TIMER
  chmod 0644 "$root/mira-tv-migration-watch.service" "$root/mira-tv-migration-watch.timer"
  systemctl daemon-reload &&
    systemctl enable --now mira-tv-migration-watch.timer >/dev/null
}

migration_source_proxy_check() {
  require_root migrate-proxy-check
  [[ ! -f "$MIGRATION_STATE_DIR/proxy-retired" ]] || return 0
  local state="$MIGRATION_STATE_DIR/source-handoff" ip domain now pid bytes
  [[ -f "$state" ]] || return 0
  local line
  line="$(cat "$state")"
  [[ "$line" == active\ * ]] || return 0
  migration_source_frozen_verified || return 0
  ip="${line#active }"
  migration_valid_ipv4 "$ip" || return 0
  domain="$(sed -n 's/^MIRA_TV_DOMAIN=//p' "$INSTALL_DIR/.env" | head -1)" || return 0
  validate_domain "$domain"
  migration_proxy_dns_points_to "$domain" "$ip" || return 0
  curl --noproxy '*' -fsS --connect-timeout 5 --max-time 12 \
    --resolve "$domain:443:$ip" "https://$domain/readyz" -o /dev/null 2>/dev/null || return 0
  local connections
  connections="$(ss -Htn state established '( sport = :443 )' 2>/dev/null)" || return 0
  [[ -z "$connections" ]] || return 0
  bytes="$(migration_proxy_network_bytes)" || return 0
  pid="$(docker inspect -f '{{.State.Pid}}' mira-tv-proxy 2>/dev/null)" || return 0
  now="$(date -u +%s)"
  local observer="$MIGRATION_STATE_DIR/proxy-observer" old_stamp old_pid old_bytes
  old_stamp=''; old_pid=''; old_bytes=''
  if [[ -f "$observer" ]]; then
    read -r old_stamp old_pid old_bytes < "$observer" || true
  fi
  if [[ ! "$old_stamp" =~ ^[0-9]+$ || "$old_pid" != "$pid" ||
        "$old_bytes" != "$bytes" || "$now" -lt "$old_stamp" ]]; then
    printf '%s %s %s\n' "$now" "$pid" "$bytes" > "$observer"
    chmod 600 "$observer"
    return 0
  fi
  (( now - old_stamp >= MIGRATION_PROXY_QUIET_SECONDS )) || return 0
  # Check DNS, direct HTTPS and active TCP connections again before stopping.
  migration_proxy_dns_points_to "$domain" "$ip" || return 0
  curl --noproxy '*' -fsS --connect-timeout 5 --max-time 12 \
    --resolve "$domain:443:$ip" "https://$domain/readyz" -o /dev/null 2>/dev/null || return 0
  connections="$(ss -Htn state established '( sport = :443 )' 2>/dev/null)" || return 0
  [[ -z "$connections" ]] || return 0
  [[ "$(migration_proxy_network_bytes)" == "$bytes" ]] || return 0
  docker update --restart=no mira-tv-proxy >/dev/null || return 1
  docker stop --time 30 mira-tv-proxy >/dev/null || return 1
  printf '%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$MIGRATION_STATE_DIR/proxy-retired"
  chmod 600 "$MIGRATION_STATE_DIR/proxy-retired"
  systemctl disable --now mira-tv-migration-watch.timer >/dev/null || true
  info 'DNS указывает на новый сервер, старый прокси не использовался 14 дней: прокси отключён.'
}

migration_source_arm() {
  migration_source_frozen_verified || return 1
  [[ ! -f "$MIGRATION_STATE_DIR/source-handoff" ]] || {
    local current
    current="$(cat "$MIGRATION_STATE_DIR/source-handoff")"
    [[ "$current" == armed || "$current" == pending\ * || "$current" == active\ * ]] || return 1
    printf 'MIRA-TV-SOURCE-ARMED-1\n'
    return 0
  }
  printf 'armed\n' > "$MIGRATION_STATE_DIR/source-handoff" || return 1
  chmod 600 "$MIGRATION_STATE_DIR/source-handoff"
  printf 'MIRA-TV-SOURCE-ARMED-1\n'
}

# Move the existing Traefik file-provider service to the new server. HTTPS
# remains terminated on the old IP, and forwarding to the new IP is verified
# with the original domain and CA trust (never insecureSkipVerify).
migration_source_handoff() {
  local ip="$1" domain previous
  migration_valid_ipv4 "$ip" || return 1
  migration_source_frozen_verified || return 1
  [[ -f "$INSTALL_DIR/.env" ]] || return 1
  domain="$(sed -n 's/^MIRA_TV_DOMAIN=//p' "$INSTALL_DIR/.env" | head -1)"
  validate_domain "$domain"
  previous=''
  if [[ -f "$MIGRATION_STATE_DIR/source-handoff" ]]; then
    previous="$(cat "$MIGRATION_STATE_DIR/source-handoff")"
    [[ "$previous" == armed || "$previous" == "pending $ip" || "$previous" == "active $ip" ]] || return 1
  fi
  # Verify the new endpoint before committing the source to proxy-only mode.
  curl --noproxy '*' --fail --silent --show-error --connect-timeout 8 --max-time 20 \
    --resolve "$domain:443:$ip" "https://$domain/readyz" -o /dev/null || return 1
  if [[ -z "$previous" || "$previous" == armed ]]; then
    printf 'pending %s\n' "$ip" > "$MIGRATION_STATE_DIR/source-handoff" || return 1
    chmod 600 "$MIGRATION_STATE_DIR/source-handoff"
  fi
  docker run --rm --network none \
    -e MIGRATION_DOMAIN="$domain" -e MIGRATION_IP="$ip" \
    -v mira-tv-proxy-config:/dynamic \
    busybox:1.37.0@sha256:9db7b59979c38555a39def84a31fb98b5296952f9e3afd4f6f11f05b07adfab0 \
    sh -ec '
      set -eu
      source=/dynamic/dynamic.yml
      [ -s "$source" ]
      if grep -Fq "https://$MIGRATION_IP:443" "$source"; then
        grep -Fq "serversTransport: migration-server" "$source"
        exit 0
      fi
      grep -Fq "http://app:8080" "$source"
      if [ ! -e /dynamic/dynamic.before-migration.yml ]; then
        cp "$source" /dynamic/dynamic.before-migration.yml
      fi
      awk -v domain="$MIGRATION_DOMAIN" -v ip="$MIGRATION_IP" '"'"'
        /^  services:$/ {
          print "  serversTransports:"
          print "    migration-server:"
          print "      serverName: \"" domain "\""
        }
        /^      loadBalancer:$/ {
          print
          print "        serversTransport: migration-server"
          next
        }
        /url: "http:\/\/app:8080"/ {
          sub(/http:\/\/app:8080/, "https://" ip ":443")
        }
        { print }
      '"'"' "$source" > /dynamic/dynamic.next.yml
      grep -Fq "https://$MIGRATION_IP:443" /dynamic/dynamic.next.yml
      grep -Fq "serversTransport: migration-server" /dynamic/dynamic.next.yml
      mv -f /dynamic/dynamic.next.yml "$source"
    ' || return 1
  # Traefik reloads dynamically; do not re-run the config-init container.
  local attempt
  for attempt in 1 2 3 4 5; do
    if curl --noproxy '*' --fail --silent --show-error \
      --connect-timeout 5 --max-time 10 \
      --resolve "$domain:443:127.0.0.1" "https://$domain/readyz" \
      -o /dev/null 2>/dev/null; then
      printf 'active %s\n' "$ip" > "$MIGRATION_STATE_DIR/source-handoff"
      migration_proxy_monitor_install || return 1
      printf 'MIRA-TV-PROXY-ACTIVE-1\n'
      return 0
    fi
    sleep 2
  done
  return 1
}

migration_source_snapshot() {
  [[ -f "$MIGRATION_SOURCE_STATE" && -f "$INSTALL_DIR/.env" ]] || return 1
  local kind="${1:-preliminary}"
  case "$kind" in
    preliminary) [[ ! -e "$MIGRATION_STATE_DIR/source-frozen" ]] || return 1 ;;
    final) migration_source_frozen_verified || return 1 ;;
    *) return 1 ;;
  esac
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
    docker volume inspect mira-tv-site-assets >/dev/null 2>&1 || exit 1
    docker run --rm --network none -v mira-tv-site-assets:/assets:ro busybox:1.37.0@sha256:9db7b59979c38555a39def84a31fb98b5296952f9e3afd4f6f11f05b07adfab0 \
      tar -C /assets -czf - . > "$work/site-assets.tar.gz" || exit 1
    [[ -s "$work/site-assets.tar.gz" ]] || exit 1
    docker volume inspect mira-tv-letsencrypt >/dev/null 2>&1 || exit 1
    docker run --rm --network none -v mira-tv-letsencrypt:/certs:ro busybox:1.37.0@sha256:9db7b59979c38555a39def84a31fb98b5296952f9e3afd4f6f11f05b07adfab0 \
      tar -C /certs -czf - . > "$work/letsencrypt.tar.gz" || exit 1
    [[ -s "$work/letsencrypt.tar.gz" ]] || exit 1
    printf '%s\n' "$kind" > "$work/snapshot-kind" || exit 1
    (cd "$work" && sha256sum install.env revision database.dump site-assets.tar.gz letsencrypt.tar.gz snapshot-kind > SHA256SUMS) || exit 1
    tar -C "$work" -czf - SHA256SUMS install.env revision database.dump site-assets.tar.gz letsencrypt.tar.gz snapshot-kind
  )
}

migration_archive_validate() {
  local archive="$1" target="$2" expected actual
  [[ -s "$archive" && -d "$target" ]] || return 1
  expected="$(printf '%s\n' SHA256SUMS install.env revision database.dump site-assets.tar.gz letsencrypt.tar.gz snapshot-kind | sort)"
  actual="$(tar -tzf "$archive" | sort)" || return 1
  [[ "$actual" == "$expected" ]] || return 1
  tar -xzf "$archive" -C "$target" --no-same-owner --no-same-permissions || return 1
  (cd "$target" && sha256sum -c SHA256SUMS >/dev/null) || return 1
  [[ -s "$target/database.dump" && -s "$target/site-assets.tar.gz" && -s "$target/letsencrypt.tar.gz" ]] || return 1
  [[ -s "$target/install.env" && -s "$target/revision" ]] || return 1
  [[ "$(cat "$target/snapshot-kind")" == preliminary || "$(cat "$target/snapshot-kind")" == final ]] || return 1
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
      migration_source_snapshot preliminary
      ;;
    freeze)
      migration_source_touch_lease || exit 1
      migration_source_freeze
      ;;
    final-snapshot)
      migration_source_touch_lease || exit 1
      migration_source_snapshot final
      ;;
    resume)
      migration_source_touch_lease || exit 1
      migration_source_resume
      ;;
    frozen)
      migration_source_touch_lease || exit 1
      migration_source_frozen_verified && printf 'MIRA-TV-SOURCE-FROZEN-1\n'
      ;;
    role)
      migration_source_touch_lease || exit 1
      if [[ ! -e "$MIGRATION_STATE_DIR/source-frozen" &&
            ! -e "$MIGRATION_STATE_DIR/source-handoff" &&
            "$(docker inspect -f '{{.State.Running}}' mira-tv 2>/dev/null)" == true ]]; then
        printf 'MIRA-TV-SOURCE-LIVE-1\n'
      else
        printf 'MIRA-TV-SOURCE-FENCED-1\n'
      fi
      ;;
    arm)
      migration_source_touch_lease || exit 1
      migration_source_arm
      ;;
    revoke)
      migration_source_touch_lease || exit 1
      [[ -f "$MIGRATION_STATE_DIR/source-handoff" ]] || exit 1
      [[ "$(cat "$MIGRATION_STATE_DIR/source-handoff")" == active\ * ]] || exit 1
      migration_source_clear_key || exit 1
      rm -f -- "$MIGRATION_SOURCE_STATE"
      printf 'MIRA-TV-SSH-REVOKED-1\n'
      ;;
    *)
      if [[ "$SSH_ORIGINAL_COMMAND" =~ ^handoff[[:space:]]([0-9.]+)$ ]]; then
        local target_ip="${BASH_REMATCH[1]}"
        migration_valid_ipv4 "$target_ip" || exit 1
        migration_source_touch_lease || exit 1
        migration_source_handoff "$target_ip"
      else
        exit 1
      fi
      ;;
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
  migration_target_save_connection "$tmp" "$ip" "$port" "${result_fields[3]}" "${result_fields[2]}" ||
    die 'Не удалось сохранить закрытые SSH-данные для последующих этапов.'
  rm -rf -- "$tmp"
  migration_target_prepare
  migration_target_finalize
}


# Keep the pinned SSH credentials on the target only until handoff.
migration_target_save_connection() {
  local dir="$1" ip="$2" port="$3" domain="$4" revision="$5"
  [[ ! -e "$MIGRATION_STATE_DIR/connection" ]] || return 1
  local dst="$MIGRATION_STATE_DIR/connection"
  install -d -m 0700 "$dst" || return 1
  install -m 0600 "$dir/id_ed25519" "$dst/id_ed25519" || return 1
  install -m 0600 "$dir/known_hosts" "$dst/known_hosts" || return 1
  printf '%s\n%s\n%s\n%s\n' "$ip" "$port" "$domain" "$revision" > "$dst/source"
  chmod 600 "$dst/source"
}

migration_target_request() {
  local operation="$1" dir="$MIGRATION_STATE_DIR/connection" ip port domain revision
  [[ -d "$dir" && -s "$dir/id_ed25519" && -s "$dir/known_hosts" && -s "$dir/source" ]] || return 1
  local -a metadata
  mapfile -t metadata < "$dir/source"
  [[ "${#metadata[@]}" == 4 ]] || return 1
  ip="${metadata[0]}"; port="${metadata[1]}"; domain="${metadata[2]}"; revision="${metadata[3]}"
  migration_valid_ipv4 "$ip" && migration_valid_port "$port" || return 1
  [[ "$revision" =~ ^[a-f0-9]{40}$ ]] || return 1
  validate_domain "$domain"
  case "$operation" in
    probe|snapshot|freeze|final-snapshot|resume|frozen|role|arm|revoke) ;;
    handoff\ *) migration_valid_ipv4 "${operation#handoff }" || return 1 ;;
    *) return 1 ;;
  esac
  ssh -T -F /dev/null -o BatchMode=yes -o IdentitiesOnly=yes \
    -o StrictHostKeyChecking=yes -o GlobalKnownHostsFile=/dev/null \
    -o UserKnownHostsFile="$dir/known_hosts" -o HostKeyAlgorithms=ssh-ed25519 \
    -o ConnectTimeout=10 -o ConnectionAttempts=1 \
    -o ServerAliveInterval=20 -o ServerAliveCountMax=3 \
    -i "$dir/id_ed25519" -p "$port" "root@$ip" "$operation"
}

# A final archive is accepted only while the source has fenced its writer.
migration_target_capture_final() {
  [[ -s "$MIGRATION_STATE_DIR/target-prepared" && ! -e "$MIGRATION_STATE_DIR/target-active" ]] || return 1
  [[ ! -e "$MIGRATION_STATE_DIR/final-staged" ]] || return 1
  local work
  work="$(mktemp -d "$MIGRATION_STATE_DIR/final.XXXXXX")" || return 1
  chmod 700 "$work"
  if ! migration_target_request final-snapshot > "$work/bundle.tar.gz"; then
    rm -rf -- "$work"
    return 1
  fi
  if ! migration_archive_validate "$work/bundle.tar.gz" "$work"; then
    rm -rf -- "$work"
    return 1
  fi
  [[ "$(cat "$work/snapshot-kind")" == final &&
     "$(cat "$work/revision")" == "$(cat "$MIGRATION_STATE_DIR/target-prepared")" ]] || {
    rm -rf -- "$work"; return 1
  }
  local source_secret target_secret
  source_secret="$(sed -n 's/^SESSION_SECRET=//p' "$work/install.env")"
  target_secret="$(sed -n 's/^SESSION_SECRET=//p' "$INSTALL_DIR/.env")"
  [[ -n "$source_secret" && "$source_secret" == "$target_secret" ]] || {
    rm -rf -- "$work"; return 1
  }
  unset source_secret target_secret
  rm -f -- "$work/bundle.tar.gz"
  chmod -R go-rwx "$work"
  mv -- "$work" "$MIGRATION_STATE_DIR/final-staged"
}

# Internal command; must be followed by a validated cutover before release.

# Replace ALL preliminary data while the application is stopped. If restoring
# fails, only the sealed source snapshot is eligible for recovery.
migration_target_restore_final() {
  local data="$MIGRATION_STATE_DIR/final-staged"
  [[ -s "$MIGRATION_STATE_DIR/target-prepared" &&
     ! -f "$MIGRATION_STATE_DIR/target-active" &&
     -s "$data/database.dump" && -s "$data/site-assets.tar.gz" &&
     -s "$data/letsencrypt.tar.gz" ]] || return 1
  [[ "$(cat "$data/snapshot-kind")" == final ]] || return 1
  [[ "$(cat "$MIGRATION_STATE_DIR/target-prepared")" == "$(cat "$data/revision")" ]] || return 1
  local running
  running="$(docker inspect -f '{{.State.Running}}' mira-tv 2>/dev/null)" || return 1
  [[ "$running" == false ]] || return 1
  [[ "$(docker inspect -f '{{.State.Running}}' mira-tv-proxy 2>/dev/null || printf false)" == false ]] || return 1
  (
    cd "$INSTALL_DIR" || exit 1
    docker compose exec -T db sh -ec \
      'PGPASSWORD="$POSTGRES_PASSWORD" dropdb --if-exists --force -U "$POSTGRES_USER" "$POSTGRES_DB" && PGPASSWORD="$POSTGRES_PASSWORD" createdb -U "$POSTGRES_USER" -O "$POSTGRES_USER" "$POSTGRES_DB"' || exit 1
    docker compose exec -T db sh -ec \
      'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore --exit-on-error -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges' \
      < "$data/database.dump" || exit 1
    docker compose run --rm --no-deps -T site-assets-init sh -ec \
      'find "$SITE_ASSETS_ROOT" -mindepth 1 -delete; tar -C "$SITE_ASSETS_ROOT" -xzf -' \
      < "$data/site-assets.tar.gz" || exit 1
    docker run --rm -i --network none -v mira-tv-letsencrypt:/certs \
      busybox:1.37.0@sha256:9db7b59979c38555a39def84a31fb98b5296952f9e3afd4f6f11f05b07adfab0 \
      sh -ec 'find /certs -mindepth 1 -delete; tar -C /certs -xzf -' \
      < "$data/letsencrypt.tar.gz" || exit 1
    docker compose exec -T db sh -ec \
      'PGPASSWORD="$POSTGRES_PASSWORD" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "SELECT (SELECT count(*) FROM tv_devices), (SELECT count(*) FROM tv_device_bindings WHERE active), (SELECT count(*) FROM tv_device_sessions WHERE revoked_at IS NULL)"' \
      > "$MIGRATION_STATE_DIR/tv-records-final" || exit 1
  ) || return 1
  install -m 0600 "$data/revision" "$MIGRATION_STATE_DIR/target-final-restored"
}

migration_target_final_sync() {
  require_root migrate-final-sync
  [[ -s "$MIGRATION_STATE_DIR/target-prepared" &&
     -s "$MIGRATION_STATE_DIR/connection/source" ]] ||
    die 'Нет подготовленной и проверенной целевой установки.'
  [[ ! -e "$MIGRATION_STATE_DIR/final-staged" ]] ||
    die 'Финальная копия уже получена; повторная передача запрещена.'
  local response
  if ! response="$(migration_target_request freeze)"; then
    # SSH might have disconnected AFTER the source was frozen.
    if migration_target_request resume >/dev/null 2>&1; then
      die 'SSH оборвался при остановке источника. Его работа автоматически восстановлена.'
    fi
    die 'Состояние исходного сервера неизвестно: проверьте его консоль перед повтором.'
  fi
  if [[ "$response" != MIRA-TV-SOURCE-FROZEN-1 ]]; then
    migration_target_request resume >/dev/null 2>&1 || true
    die 'Исходный сервер не подтвердил блокировку записи.'
  fi
  if ! migration_target_capture_final; then
    warn 'Финальная копия не прошла проверку. Пытаюсь вернуть исходный сервер в работу.'
    if migration_target_request resume >/dev/null; then
      die 'Финальная передача отменена, старый сервер снова работает.'
    fi
    die 'Исходный сервер может оставаться замороженным! Выполните восстановление через его консоль.'
  fi
  if ! migration_target_restore_final; then
    warn 'На новом сервере не удалось восстановить финальные данные.'
    if migration_target_request resume >/dev/null; then
      rm -rf -- "$MIGRATION_STATE_DIR/final-staged"
      die 'Восстановление отменено. Старый сервер снова работает; целевую копию необходимо очистить и повторить.'
    fi
    die 'Источник может оставаться замороженным! Выполните восстановление через его консоль.'
  fi
  info 'Финальная копия получена и проверена. Старый сервер заблокирован для записи.'
  warn 'До завершения переключения исходный сервер нельзя запускать вручную.'
}


# Activate the restored server; source remains fenced even if proxy switching
# fails after the target begins accepting writes.
migration_target_publish() {
  require_root migrate-publish
  [[ -s "$MIGRATION_STATE_DIR/target-final-restored" &&
     -s "$MIGRATION_STATE_DIR/final-staged/revision" ]] ||
    die 'Новый сервер не содержит проверенного финального снимка.'
  [[ ! -e "$MIGRATION_STATE_DIR/target-active" ]] ||
    die 'Новый сервер уже активирован.'
  local ip="${1:-}" domain source_status response
  if [[ -z "$ip" ]]; then
    read -r -p 'Публичный IPv4 НОВОГО сервера (доступны 80/443): ' ip
  fi
  migration_valid_ipv4 "$ip" || die 'Неверный IPv4 нового сервера.'
  domain="$(sed -n 's/^MIRA_TV_DOMAIN=//p' "$INSTALL_DIR/.env" | head -1)"
  validate_domain "$domain"
  source_status="$(migration_target_request frozen)" ||
    die 'Источник не подтвердил остановку записи. Публикация запрещена.'
  [[ "$source_status" == MIRA-TV-SOURCE-FROZEN-1 ]] ||
    die 'Источник может принимать записи. Публикация запрещена.'
  [[ "$(migration_target_request arm)" == MIRA-TV-SOURCE-ARMED-1 ]] ||
    die 'Источник не подтвердил постоянную блокировку записи. Публикация запрещена.'
  # Production stack on the new server is started only after the final
  # restoration has passed DB and asset validation.
  (cd "$INSTALL_DIR" && docker compose up -d --build --wait proxy) ||
    die 'Новый HTTPS-сервер не запустился. Старый источник остаётся замороженным.'
  curl --noproxy '*' --fail --silent --show-error --connect-timeout 8 --max-time 20 \
    --resolve "$domain:443:127.0.0.1" "https://$domain/readyz" \
    -o /dev/null ||
    die 'HTTPS нового сервера не подтвердил готовность. Источник остаётся замороженным.'
  # This command is the irreversible writer handoff. On failure, never
  # simply restart the old app after the new app accepted requests.
  if ! response="$(migration_target_request "handoff $ip")"; then
    die 'Перенаправление старого сервера не удалось. Новый сервер работает; старая БД остаётся заблокированной.'
  fi
  [[ "$response" == MIRA-TV-PROXY-ACTIVE-1 ]] ||
    die 'Старый сервер не подтвердил проксирование. Не восстанавливайте его БД без проверки.'
  install -m 0600 "$MIGRATION_STATE_DIR/target-final-restored" "$MIGRATION_STATE_DIR/target-active"
  install -m 0755 "$INSTALL_DIR/mira-tv.sh" "$LAUNCHER_PATH" ||
    warn 'MIRA-TV работает, но консольный launcher не удалось установить.'
  if [[ "$(migration_target_request revoke 2>/dev/null)" == MIRA-TV-SSH-REVOKED-1 ]]; then
    rm -rf -- "$MIGRATION_STATE_DIR/connection"
    info 'Временный SSH-доступ отозван.'
  else
    warn 'Не удалось автоматически отозвать SSH-ключ; отзовите его через консоль исходного сервера.'
  fi
  info 'Новый сервер активен. Старый сервер работает только как HTTPS/WebSocket-прокси.'
  info "Обновите DNS A-запись $domain на IP $ip. Прокси пока не отключать без проверки всех ТВ."
}


# Single user-facing transition after SSH pairing and target preparation.
migration_target_finalize() {
  require_root migrate-finalize
  [[ -f "$MIGRATION_STATE_DIR/target-prepared" &&
     -s "$MIGRATION_STATE_DIR/connection/source" ]] ||
    die 'Сначала подготовьте новый сервер через SSH.'
  local ip
  read -r -p 'Публичный IPv4 нового сервера для HTTPS-прокси: ' ip
  migration_valid_ipv4 "$ip" || die 'Неверный IPv4 нового сервера.'
  if [[ ! -s "$MIGRATION_STATE_DIR/target-final-restored" ]]; then
    migration_target_final_sync
  fi
  migration_target_publish "$ip"
}

migration_target_discard() {
  require_root migrate-discard
  local stage="$MIGRATION_STATE_DIR/staged"
  [[ -d "$stage" && ! -L "$stage" ]] || {
    info 'Предварительная копия отсутствует.'
    return 0
  }
  [[ ! -e "$MIGRATION_STATE_DIR/target-prepared" &&
     ! -e "$MIGRATION_STATE_DIR/target-preparing" &&
     ! -e "$MIGRATION_STATE_DIR/target-final-restored" &&
     ! -e "$MIGRATION_STATE_DIR/target-active" ]] ||
    die 'Сначала безопасно отмените подготовку или переключение, затем удалите копию.'
  rm -rf -- "$stage" "$MIGRATION_STATE_DIR/connection"
  info 'Предварительная копия и временные SSH-секреты удалены. Исходный сервер и его данные не изменены.'
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
  if [[ -f "$MIGRATION_STATE_DIR/target-final-restored" ]]; then
    [[ "$(migration_target_request role)" == MIRA-TV-SOURCE-LIVE-1 ]] ||
      die 'Нельзя удалить финальную копию: исходный сервер не подтвердил безопасное восстановление.'
  fi
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
  rm -rf -- "$MIGRATION_STATE_DIR/final-staged"
  rm -f -- "$marker" "$prepared" "$MIGRATION_STATE_DIR/target-final-restored" "$MIGRATION_STATE_DIR/tv-records-prepared" "$MIGRATION_STATE_DIR/tv-records-final"
  info 'Тестовая установка удалена. Предварительная копия сохранена для повторной подготовки.'
}
