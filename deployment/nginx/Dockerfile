FROM node:22-alpine AS frontend-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --workspace frontend --include-workspace-root
COPY frontend frontend
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
USER root
RUN apk add --no-cache openssl
COPY --from=frontend-build /app/frontend/dist /usr/share/nginx/html
COPY deployment/nginx/nginx.conf /etc/nginx/nginx.conf
COPY deployment/nginx/start.sh /usr/local/bin/start-nginx
RUN chmod 0555 /usr/local/bin/start-nginx
USER 101:101
ENTRYPOINT ["/usr/local/bin/start-nginx"]
