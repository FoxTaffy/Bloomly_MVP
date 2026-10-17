# Этап 1: Сборка приложения
FROM node:24-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

# Этап 2: Создание production-образа
FROM node:24-alpine
WORKDIR /app
RUN apk add --no-cache openssl ffmpeg
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Генерируем клиент Prisma для production
RUN npx prisma generate

EXPOSE 8080
CMD ["npm", "run", "start"]
