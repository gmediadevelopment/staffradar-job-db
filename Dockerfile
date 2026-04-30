FROM node:20-slim

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/

# Install dev deps for build, build, then remove
RUN npm install && npx tsc && npm prune --production

# Expose port
EXPOSE 4500

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:4500/health || exit 1

CMD ["node", "dist/server.js"]
