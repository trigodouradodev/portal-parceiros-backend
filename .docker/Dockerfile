# Builder stage
FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci && npm cache clean --force

COPY prisma ./prisma
COPY prisma.config.ts tsconfig*.json nest-cli.json ./
COPY src ./src

RUN npx prisma generate && npm run build

# Production stage
FROM node:24-alpine AS production

RUN addgroup -g 1001 -S nodejs && \
    adduser -S trigouser -u 1001

WORKDIR /app

# Copy built application and dependencies from builder stage
COPY --from=builder --chown=trigouser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=trigouser:nodejs /app/dist ./dist
COPY --from=builder --chown=trigouser:nodejs /app/package*.json ./

# Switch to non-root user
USER trigouser

EXPOSE 3000

# Use exec form for proper signal handling
CMD ["node", "dist/src/main.js"]
