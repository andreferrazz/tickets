# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG PUBLIC_API_URL
ENV PUBLIC_API_URL=${PUBLIC_API_URL}
RUN npm run build

FROM nginx:1.27-alpine AS runner
COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
