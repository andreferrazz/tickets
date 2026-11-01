# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e
# Every image is pinned by digest so a rebuild never picks up a newer one.

FROM node:24.22.2-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85 AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24.22.2-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85 AS runner
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
