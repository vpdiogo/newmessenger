# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9 AS dependencies
WORKDIR /app
RUN --mount=type=secret,id=proxy_ca \
    export NODE_USE_ENV_PROXY=1; \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    corepack enable && corepack prepare pnpm@12.9.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN --mount=type=secret,id=proxy_ca \
    export NODE_USE_ENV_PROXY=1; \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    pnpm install --frozen-lockfile

FROM dependencies AS build
COPY tsconfig.json ./
COPY src src
COPY apps/web apps/web
ARG VITE_API_BASE_URL=https://newmessenger-app.duckdns.org/api
RUN pnpm build && pnpm web:build
RUN --mount=type=secret,id=proxy_ca \
    export NODE_USE_ENV_PROXY=1; \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    pnpm --filter newmessenger deploy --prod --legacy /production

FROM node:24-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9 AS api
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /production/node_modules node_modules
COPY --from=build /app/dist dist
COPY --chown=node:node package.json ./
COPY --chown=node:node infra/docker/database.mjs infra/docker/api.mjs infra/docker/healthcheck.mjs infra/docker/
ARG BUILD_REVISION=local
LABEL org.opencontainers.image.revision=$BUILD_REVISION
USER node
EXPOSE 3000
CMD ["node", "infra/docker/api.mjs"]

FROM dependencies AS migrate
COPY --chown=node:node package.json ./
COPY --chown=node:node migrations migrations
COPY --chown=node:node infra/docker/database.mjs infra/docker/migrate.mjs infra/docker/
ENV NODE_ENV=production
ARG BUILD_REVISION=local
LABEL org.opencontainers.image.revision=$BUILD_REVISION
USER node
CMD ["node", "infra/docker/migrate.mjs"]

FROM caddy:2-alpine@sha256:78bd35025c7ba85961dd149ae670315129954e77abe2383ac47c89106b35ade9 AS web
COPY --from=build /app/apps/web/dist /srv
COPY infra/docker/Caddyfile /etc/caddy/Caddyfile
ARG BUILD_REVISION=local
LABEL org.opencontainers.image.revision=$BUILD_REVISION
EXPOSE 8080
