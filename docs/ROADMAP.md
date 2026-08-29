# MIRA-TV Roadmap

## 1.0.0.1
- чистый MIRA-TV namespace и installer;
- единый Player state вместо отдельной файловой публикации;
- offline-first Last Known Good;
- локальный журнал Player с bounded storage;
- WebSocket invalidation/control plane;
- REST snapshot/delta sync;
- render-on-change по независимым слоям;
- строгий ресурсный бюджет телевизора.

## После 1.0.0.1
- расширенная fleet-диагностика;
- component-level asset manifests;
- опциональный WebGL2/WebGPU слой только для эффектов, которым это действительно нужно;
- измеримый resource telemetry budget без покадрового логирования.
