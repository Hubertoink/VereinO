# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
WORKDIR /usr/src/app

# Install deps separately for better caching
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN if [ -f package-lock.json ]; then npm ci; \
    elif [ -f pnpm-lock.yaml ]; then corepack enable && pnpm i --frozen-lockfile; \
    elif [ -f yarn.lock ]; then yarn install --frozen-lockfile; \
    else npm install; fi

# Copy sources
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src

# Build
RUN npm run prisma:generate || true
RUN npm run build

# Runtime image
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /usr/src/app
COPY --from=base /usr/src/app/node_modules ./node_modules
COPY --from=base /usr/src/app/dist ./dist
COPY --from=base /usr/src/app/prisma ./prisma
EXPOSE 3001
CMD ["node", "dist/index.js"]
