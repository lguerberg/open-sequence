# The hosted OpenSequence MCP server: Streamable HTTP on 8080, a project API key as the bearer of
# every request. Its own container, so it ships without redeploying the API.
#
# Build from the WORKSPACE ROOT (the folder with pnpm-lock.yaml), like apps/server:
#   docker build -f packages/mcp/Dockerfile -t opensequence/mcp .
#   docker run -p 8080:8080 -e OPENSEQUENCE_URL=https://sequences.example.com opensequence/mcp
#
# Only the MCP package and the SDK it calls the API through are copied in, and every install is
# filtered to those two, so nothing from the server, the engine or the sites enters the image.
# Node 22, because @prefecthq/fastmcp-ts requires it. Dockerfile.dockerignore (next to this file)
# keeps host node_modules and dist folders out of the build context.

FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.30.2 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages/sdk/package.json packages/sdk/
COPY packages/mcp/package.json packages/mcp/
RUN pnpm install --frozen-lockfile --filter "@opensequence/mcp..."
COPY packages/sdk packages/sdk
COPY packages/mcp packages/mcp
RUN pnpm --filter "@opensequence/mcp..." run build

FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@10.30.2 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/sdk/package.json packages/sdk/
COPY packages/mcp/package.json packages/mcp/
RUN pnpm install --frozen-lockfile --prod --filter "@opensequence/mcp..."
COPY --from=build /app/packages/sdk/dist packages/sdk/dist
COPY --from=build /app/packages/mcp/dist packages/mcp/dist

WORKDIR /app/packages/mcp
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:${PORT}/health || exit 1
USER node
# --http: the container is always the hosted server, whatever MCP_TRANSPORT says.
CMD ["node", "dist/cli.js", "--http"]
