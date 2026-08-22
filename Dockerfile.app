# App image for every vertical's API and worker. All run via tsx (no per-app
# build): this keeps runtime data assets (e.g. the ukraine worker's
# ukraine-boundary.geojson) resolvable and avoids a separate compiled-migrate
# step. Only the shared packages are built, since apps import them through
# their package exports (dist).
FROM node:22-slim

RUN corepack enable
WORKDIR /app

# Install deps against the lockfile first for layer caching.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/ukraine-shared/package.json packages/ukraine-shared/
COPY packages/elections-shared/package.json packages/elections-shared/
COPY apps/ukraine-api/package.json apps/ukraine-api/
COPY apps/ukraine-worker/package.json apps/ukraine-worker/
COPY apps/ukraine-web/package.json apps/ukraine-web/
COPY apps/elections-api/package.json apps/elections-api/
COPY apps/elections-web/package.json apps/elections-web/
RUN pnpm install --frozen-lockfile

# Source + build the shared packages.
COPY . .
RUN pnpm --filter @ukraine-tracker/shared build \
 && pnpm --filter @elections-tracker/shared build

# Command is supplied by docker-compose (api: serve, worker: ingest loop).
