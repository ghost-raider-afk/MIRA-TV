# Realtime и delta sync

WebSocket сообщает только о необходимости синхронизации и управляющих событиях. REST остаётся authoritative transport для snapshot/delta. Это предотвращает дублирование бизнес-логики и упрощает offline recovery.
