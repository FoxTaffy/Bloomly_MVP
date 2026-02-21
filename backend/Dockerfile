FROM node:20-alpine

# Устанавливаем зависимости для Prisma и OpenSSL 1.1
# Мы добавляем репозиторий со старыми библиотеками, чтобы Prisma могла их найти
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Генерируем клиент Prisma специально под текущую архитектуру
RUN npx prisma generate

EXPOSE 8080

CMD ["npx", "tsx", "src/server.ts"]
