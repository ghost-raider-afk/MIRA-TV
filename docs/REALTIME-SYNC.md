# Realtime synchronization in MIRA-TV

## Contract

MIRA-TV uses a hybrid model:

- **WebSocket** — lightweight invalidation/control events;
- **REST** — authoritative snapshot/delta state;
- **IndexedDB** — durable TV runtime state;
- **Cache Storage** — media and Player assets.

WebSocket never becomes the only source of truth and never transports menu/media payloads.

## Normal flow

1. TV Player restores Last Known Good locally before waiting for the network.
2. It performs one authoritative REST reconciliation.
3. It opens an authenticated WebSocket connection.
4. After WebSocket connect it performs one additional reconciliation to close the race between the initial REST response and socket subscription.
5. Server remains silent while nothing changes.
6. After a relevant successful DB commit, Player receives a compact `context.changed` invalidation.
7. Player requests `/api/device/player-delta` with the component hashes it already has.
8. Only changed components/assets are applied.
9. The candidate becomes Last Known Good only after critical assets and rendering succeed.

The second reconciliation on connect is intentional: it prevents losing a change committed in the small interval between initial REST synchronization and WebSocket registration.

## Fallback

If WebSocket is unavailable, Player enables rare fallback polling using `PLAYER_FALLBACK_POLL_SECONDS` from `.env`.

When WebSocket reconnects:

1. Player immediately reconciles current state;
2. pending logs are uploaded in bounded batches;
3. fallback polling is disabled again.

Reconnect uses exponential backoff with jitter to avoid reconnect storms after server/network recovery. Failed reconnect attempts do not postpone the independent fallback timer.

## Delta model

MIRA-TV does **not** maintain an ever-growing change history for the TV protocol.

For every authoritative Player state the server calculates independent SHA-256 hashes for:

- `screen`;
- `menu`;
- `animation`;
- `environment`;
- `scene_playlist`;
- `entity`;
- `brand`;
- `announcement`;
- `runtime`.

The top-level `revision` is a deterministic digest of `schema_version + component hashes`. It identifies exact state; it is **not a monotonic sequence number**.

A TV sends `schema_version` and its known component hashes. The server compares them directly with current authoritative state and returns only differing components. Therefore missed WebSocket messages do not require replay and do not make the client inconsistent.

If `schema_version` is incompatible, the server returns `full_snapshot_required` with a complete current snapshot. No arbitrary JSON Patch chain is reconstructed.

This stateless delta model deliberately trades a small amount of server-side hashing during an actual synchronization for lower operational complexity, no delta-history storage and deterministic recovery after arbitrarily long disconnections.

## Realtime server cost

The server keeps only lightweight in-memory indexes `screen -> sockets` and `device -> sockets` for addressable invalidation/revocation.

WebSocket liveness uses a native ping once per 60 seconds. It does not emit application JSON and does not write PostgreSQL. Device-session durable `last_seen` writes remain independently throttled by `DEVICE_HEARTBEAT_WRITE_SECONDS` on authenticated HTTP activity.
