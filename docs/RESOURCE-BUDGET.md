# Бюджет ресурсов TV Player

Жёсткое правило: при отсутствии изменений CPU/JS/сеть/диск должны быть близки к idle.

- без постоянного re-render статических слоёв;
- без 5-секундного polling при рабочем WebSocket;
- fallback polling редкий;
- видео декодируется штатным hardware decoder;
- скрытые анимации ставятся на pause;
- тяжёлые assets не хранятся в IndexedDB;
- логирование пакетное и ограниченное;
- reconnect — exponential backoff + jitter.
