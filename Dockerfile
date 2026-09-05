# Two images from one build:
#   runner (default) - the web app; receives its Convex URL at runtime
#   setup            - one-shot job that configures a Convex backend
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
ENV HUSKY=0
RUN corepack enable && pnpm install --frozen-lockfile

FROM deps AS source
COPY . .
# Host checkouts may carry owner-only modes; the setup job runs unprivileged.
RUN find . -path ./node_modules -prune -o -exec chmod a+rX {} +

FROM source AS builder
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && pnpm build

# Setup job: Convex CLI + this checkout's functions. Runs as a non-root user
# with a writable HOME so the CLI can keep its cache; it never serves traffic.
FROM source AS setup
ENV NODE_ENV=production HOME=/tmp
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 setup \
  && mkdir -p /backups /run/sous-chef && chown setup:nodejs /backups /run/sous-chef
USER setup
ENTRYPOINT ["node", "docker/setup.mjs"]
CMD ["configure"]

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
