FROM oven/bun:1 AS base
WORKDIR /usr/src/app

FROM base AS deps
COPY package.json bun.lock ./
COPY apps/server/package.json ./apps/server/
# クライアントはこのイメージでは動かさないが、bun.lock がワークスペース全体を
# 記録しているため、--frozen-lockfile の整合に package.json だけ必要
COPY apps/client/package.json ./apps/client/
COPY packages/shared/package.json ./packages/shared/
RUN bun install --production --frozen-lockfile --ignore-scripts

FROM base AS release
COPY --from=deps /usr/src/app ./
COPY apps/server ./apps/server
COPY packages/shared ./packages/shared

USER bun
EXPOSE 8080
CMD [ "bun", "run", "apps/server/src/index.ts" ]