FROM node:22-bookworm-slim AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/types/package.json packages/types/package.json

RUN npm ci

FROM deps AS build

COPY apps/api apps/api
COPY packages packages

RUN npm run build:api

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/types/package.json packages/types/package.json

RUN npm ci --omit=dev --workspace=api --include-workspace-root=false

COPY --from=build --chown=node:node /app/apps/api/dist apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/src/infra/db/migrations apps/api/dist/infra/db/migrations

WORKDIR /app/apps/api

EXPOSE 3000

USER node

CMD ["node", "dist/server.js"]
