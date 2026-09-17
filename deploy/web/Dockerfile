FROM node:22-alpine AS build
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
# Shared renderer components resolve the same React/runtime dependencies as the web entry.
RUN ln -s /app/web/node_modules /app/node_modules
COPY web/ ./
COPY src/ /app/src/
COPY shared/ /app/shared/
COPY electron/ /app/electron/
COPY assets/ /app/assets/
COPY build/ /app/build/
RUN npm run build

FROM nginx:stable-alpine
COPY deploy/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
EXPOSE 8080
