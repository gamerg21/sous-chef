# Multi-stage build for Sous Chef Next.js application

# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Use npm ci for reproducible builds, fall back to npm install if lock file is missing or out of sync
RUN if [ -f package-lock.json ]; then \
      npm ci || npm install; \
    else \
      npm install; \
    fi

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Run type check before building (fails fast if there are type errors)
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run type-check

# Build Next.js application
RUN npm run build

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files from standalone build
# Note: standalone build includes the minimal server, but we need to ensure
# Prisma files are available for migrations
# Copy the entire standalone directory to preserve all Next.js internal structure
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

# Copy Prisma files (needed for migrations and client)
# These are needed even though standalone might include them, to ensure migrations work
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.js ./prisma.config.js
COPY --from=builder /app/package.json ./package.json

# Ensure Next.js module is properly available
# Standalone build should include next, but we ensure it's accessible
# The standalone build's node_modules should already have next, but we verify it's there

# Copy our custom server.js to override the one from standalone build
# This enables our HTTPS/HTTP flexible server functionality
COPY --from=builder /app/server.js ./server.js

# Install Prisma CLI globally for migrations (lightweight)
RUN npm install -g prisma@^7.2.0

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

