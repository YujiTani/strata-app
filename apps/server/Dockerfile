FROM oven/bun:1 AS base
WORKDIR /usr/src/app

FROM base AS deps
RUN mkdir -p temp/prod
COPY package.json bun.lock temp/prod/
COPY apps/server/package.json temp/prod/apps/server/
COPY packages/shared/package.json temp/prod/packages/shared/
RUN cd temp/prod && bun install --production --frozen-lockfile

FROM base AS release
COPY --from=deps temp/prod/node_modules ./node_modules
COPY . .

USER bun
EXPOSE 3001
ENTRYPOINT [ "bun", "run", "apps/server/src/index.ts" ]