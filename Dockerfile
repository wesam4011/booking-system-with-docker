# Build stage
FROM node:18 AS build
WORKDIR /app

# Copy backend package files and install dependencies
COPY backend/package*.json ./
RUN npm install

# Copy backend code
COPY backend/ .

# Copy frontend files from frontend/public/ to ./public/
COPY frontend/public/ ./public/

# Debug: Show what we copied
RUN echo "=== Build stage debug ===" && \
    echo "Files in /app:" && ls -la && \
    echo "Files in /app/public:" && ls -la public/ && \
    echo "Checking index.html:" && ls -la public/index.html

# Production stage
FROM node:18-alpine
WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy everything from build stage
COPY --from=build /app .

# Final debug check
RUN echo "=== Production stage debug ===" && \
    echo "Files in /app:" && ls -la && \
    echo "Files in /app/public:" && ls -la public/ && \
    echo "Checking index.html:" && ls -la public/index.html

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
