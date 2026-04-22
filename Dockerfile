FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY backoffice/src/package.json backoffice/src/package-lock.json* ./
RUN npm install

COPY backoffice/src/ ./
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
WORKDIR /usr/share/nginx/html

COPY --from=build /app/dist ./
COPY backoffice/src/nginx.conf /etc/nginx/conf.d/default.conf
COPY backoffice/src/docker-entrypoint.sh /docker-entrypoint.d/40-runtime-config.sh
USER root
RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh \
	&& touch /usr/share/nginx/html/config.js \
	&& chown -R 101:101 /usr/share/nginx/html \
	&& chown 101:101 /docker-entrypoint.d/40-runtime-config.sh

USER 101

EXPOSE 8080
