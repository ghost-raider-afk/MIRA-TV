FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV NODE_ENV=production

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM base AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --gid 11000 mira-tv-assets \
  && useradd --uid 10001 --gid mira-tv-assets --create-home --shell /usr/sbin/nologin mira-tv
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY native ./native
COPY scripts ./scripts
RUN chown -R mira-tv:mira-tv-assets /app
USER mira-tv
EXPOSE 8080
CMD ["node", "src/server.js"]
