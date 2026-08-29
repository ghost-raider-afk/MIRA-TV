# Realtime synchronization in MIRA-TV

## Contract

MIRA-TV uses a hybrid model:

- **WebSocket** — lightweight invalidation/control events;
- **REST** — authoritative snapshot/delta state;
- **IndexedDB** — durable TV runtime state;
- **Cache Storage** — media and Player assets.

WebSocket never becomes the only source of truth.

## Normal flow

1. TV Player restores Last Known Good locally.
2. Opens authenticated WebSocket connection.
3. Server remains silent while nothing changes.
4. After a relevant server commit, Player receives a compact event with target/revision.
5. Player requests delta from its last confirmed revision.
6. Only changed components/assets are applied.
7. New revision becomes Last Known Good after successful application.

## Fallback

If WebSocket is unavailable, Player enables rare fallback polling using `PLAYER_FALLBACK_POLL_SECONDS` from `.env`.

When WebSocket reconnects:

1. Player immediately reconciles revision.
2. Pending logs are uploaded in bounded batches.
3. Fallback polling is disabled again.

Reconnect uses exponential backoff with jitter to avoid reconnect storms after server/network recovery.

## Delta

The server revision is monotonic. A TV requests changes since its confirmed revision. If the server no longer has a safe delta path, it returns a full snapshot requirement instead of trying to reconstruct an unsafe patch chain.

Delta should describe domain components that changed rather than arbitrary per-field mutation instructions. This keeps recovery deterministic and allows independent render-on-change by layer.
