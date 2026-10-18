FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV NODE_ENV=production

FROM base AS dependencies
ARG TARGETARCH
COPY package.json package-lock.json ./
RUN set -eux; \
  npm ci --omit=dev --include=optional; \
  arch="${TARGETARCH:-$(dpkg --print-architecture)}"; \
  case "$arch" in \
    amd64) sharp_platform='linux-x64' ;; \
    arm64) sharp_platform='linux-arm64' ;; \
    *) echo "Unsupported Docker target architecture for sharp: $arch" >&2; exit 1 ;; \
  esac; \
  sharp_native="@img/sharp-${sharp_platform}"; \
  sharp_libvips="@img/sharp-libvips-${sharp_platform}"; \
  sharp_native_version="$(node -p "require('./node_modules/sharp/package.json').optionalDependencies['${sharp_native}']")"; \
  sharp_libvips_version="$(node -p "require('./node_modules/sharp/package.json').optionalDependencies['${sharp_libvips}']")"; \
  npm install --no-save --package-lock=false --omit=dev --include=optional \
    "${sharp_native}@${sharp_native_version}" \
    "${sharp_libvips}@${sharp_libvips_version}"; \
  node --input-type=module -e "import sharp from 'sharp'; const output = await sharp({ create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer(); if (!output.length) process.exit(1);"; \
  npm cache clean --force

FROM base AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --gid 11000 mira-tv-assets \
  && useradd --uid 10001 --gid mira-tv-assets --create-home --shell /usr/sbin/nologin mira-tv
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
# Pin the vendor APK in the image: TVs download only from our own server, never GitHub.
ADD --checksum=sha256:462cc87ae09620dfce9d7a7ec1005fa6fffef7f4b72c14b51599e83a423e8559 https://github.com/screenlite/android-web-kiosk/releases/download/v0.0.11/screenlite-web-kiosk-v0-0-11.apk /app/src/web/admin-ui/public/downloads/screenlite-web-kiosk-v0-0-11.apk
RUN chown -R mira-tv:mira-tv-assets /app
USER mira-tv
EXPOSE 8080
CMD ["node", "src/server.js"]
