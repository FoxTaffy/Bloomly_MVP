# Используем стабильную версию Node.js
FROM node:20-slim

# Устанавливаем OpenSSL (нужен для работы Prisma)
RUN apt-get update -y && apt-get install -y openssl

# Создаем рабочую директорию
WORKDIR /app

# Сначала копируем только файлы зависимостей из папки backend
COPY backend/package*.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем всё содержимое папки backend в рабочую директорию /app
COPY backend/ .

# Генерируем клиент Prisma, указывая путь к схеме (теперь она в текущей папке)
RUN npx prisma generate --schema ./prisma/schema.prisma

# Билдим проект (если используешь TypeScript)
RUN npm run build || echo "Skip build if not defined"

# Открываем порт 8080 (как в твоем server.ts)
EXPOSE 8080

# Запускаем сервер
CMD ["npm", "run", "start"]
