# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/build ./build
# The SQL migrations and their runner: plain TypeScript that Node runs as is.
COPY db ./db
ENV PORT=3000
EXPOSE 3000
# Migrate before booting, as the Phoenix entrypoint did, so a deploy can never
# serve code that is ahead of its schema. A migration that fails stops the
# container instead of starting the server.
CMD ["sh", "-c", "node db/cli.ts && exec node build/index.js"]
