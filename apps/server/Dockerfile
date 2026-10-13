# OpenSequence server image: one image, roles chosen by SEQ_ROLES (api | worker | all).
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.30.2 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/engine/package.json packages/engine/
COPY packages/queue/package.json packages/queue/
COPY packages/providers/package.json packages/providers/
COPY packages/auth/package.json packages/auth/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile --filter @opensequence/server...
COPY packages ./packages
COPY apps/server ./apps/server
RUN pnpm -r --filter @opensequence/server... run build
RUN pnpm deploy --filter @opensequence/server --prod /out

FROM node:22-alpine
RUN addgroup -S oseq && adduser -S oseq -G oseq
WORKDIR /app
COPY --from=build /out ./
# The engine's and auth's migrations ship next to their dist folders.
USER oseq
ENV NODE_ENV=production SEQ_PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1:${SEQ_PORT}/healthz || exit 1
CMD ["node", "dist/main.js"]
