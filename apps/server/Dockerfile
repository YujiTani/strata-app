FROM oven/bun:1 AS base
WORKDIR /usr/src/app

FROM base AS deps
COPY package.json bun.lock ./
COPY apps/server/package.json ./apps/server/
COPY packages/shared/package.json ./packages/shared/
RUN bun install --production --frozen-lockfile --ignore-scripts

FROM base AS release
COPY --from=deps /usr/src/app ./
COPY apps/server ./apps/server
COPY packages/shared ./packages/shared

USER bun
EXPOSE 3001
CMD [ "bun", "run", "apps/server/src/index.ts" ]