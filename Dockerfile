# Multi-stage build for Sous Chef Next.js application

# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Use pnpm with a frozen lockfile for reproducible installs
RUN corepack enable
RUN pnpm install --frozen-lockfile

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js application
RUN pnpm run build

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files from standalone build
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy the .next/server directory which contains compiled webpack files
# that Next.js needs even in standalone mode
COPY --from=builder /app/.next/server ./.next/server

# Since we're using a custom server.js, we need all node_modules
# Standalone mode doesn't include everything needed for custom servers
# Copy all node_modules from builder to ensure all dependencies are available
COPY --from=builder /app/node_modules ./node_modules

COPY --from=builder /app/package.json ./package.json

# Copy our custom server.js to override the one from standalone build
COPY --from=builder /app/server.js ./server.js

# Install OpenSSL for certificate generation (needed for auto-generated self-signed certs)
RUN apk add --no-cache openssl

# Create certificates directory for auto-generated or mounted certificates
RUN mkdir -p /app/certs && chmod 755 /app/certs

# Set correct permissions
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
