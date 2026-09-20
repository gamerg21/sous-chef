FROM node:22.18-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
ENV HUSKY=0
RUN corepack enable && pnpm install --frozen-lockfile
FROM deps AS builder
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build
FROM node:22.18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 SOUS_CHEF_DATA_DIR=/data
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs && mkdir /data /backups && chown nextjs:nodejs /data /backups
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --chown=nextjs:nodejs scripts/local-admin.mjs scripts/cleanup-demo.mjs scripts/demo-cleanup-lib.mjs ./scripts/
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
