# Build and run the route service. Context is the repo root.
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/route-core/package.json packages/route-core/
COPY packages/api-contract/package.json packages/api-contract/
COPY services/route-api/package.json services/route-api/
RUN pnpm install --frozen-lockfile --filter @slinga/route-api...
COPY tsconfig.base.json ./
COPY packages/route-core packages/route-core
COPY packages/api-contract packages/api-contract
COPY services/route-api services/route-api
RUN pnpm --filter @slinga/route-api... build && \
    pnpm --filter @slinga/route-api --prod --legacy deploy /app

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 3000
CMD ["node", "dist/server.js"]
