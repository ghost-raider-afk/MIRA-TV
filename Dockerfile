FROM emscripten/emsdk:4.0.10@sha256:90b757eb11fa9a0e3ce4d2d9f76d932a56018e4accc37b5a28b2783751e60eb7 AS wasm-build
WORKDIR /src
COPY native ./native
COPY scripts/build-wasm.sh ./scripts/build-wasm.sh
RUN bash ./scripts/build-wasm.sh /out/mira-motion-kernel.wasm

FROM node:24.14.0-bookworm-slim@sha256:d8e448a56fc63242f70026718378bd4b00f8c82e78d20eefb199224a4d8e33d8 AS runtime

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY --from=wasm-build /out/mira-motion-kernel.wasm ./src/web/admin-ui/public/wasm/mira-motion-kernel.wasm

RUN groupadd --gid 11000 sftp-storage \
  && useradd --uid 10001 --gid sftp-storage --create-home menu-tv \
  && chown -R menu-tv:sftp-storage /app

USER menu-tv
EXPOSE 8080
HEALTHCHECK --interval=20s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/healthz').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "src/server.js"]
