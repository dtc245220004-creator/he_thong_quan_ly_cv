FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --workspace backend --include-workspace-root

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=dependencies --chown=1000:1000 /app/node_modules ./node_modules
COPY --chown=1000:1000 backend/package.json ./backend/package.json
COPY --chown=1000:1000 backend/src ./backend/src
COPY --chown=1000:1000 database/schema.sql ./database/schema.sql
COPY --chown=1000:1000 tests ./tests
USER 1000:1000
EXPOSE 3001
CMD ["node", "backend/src/server.js"]
