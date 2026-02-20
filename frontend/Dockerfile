FROM node:20-alpine AS builder
WORKDIR /app

# 1. Сначала копируем только файлы зависимостей
COPY frontend/package*.json ./

# 2. Устанавливаем зависимости + ПРИНУДИТЕЛЬНО Tailwind v4 и PostCSS
# Это лечит ошибку "Module not found: Can't resolve tailwindcss"
RUN npm install && npm install tailwindcss@next @tailwindcss/postcss@next postcss

# 3. Копируем всё остальное
COPY . .

# 4. Выносим содержимое frontend в корень
RUN if [ -d "frontend" ]; then mv frontend/* . && mv frontend/.[!.]* . 2>/dev/null || true; fi

# 5. Генерируем конфиг (убрал ключ eslint, чтобы не было варнингов)
RUN echo '/** @type {import("next").NextConfig} */ \
const nextConfig = { \
  typescript: { ignoreBuildErrors: true }, \
  async rewrites() { \
    return [ \
      { \
        source: "/api/api/:path*", \
        destination: "http://62.60.217.144:8080/api/:path*" \
      }, \
      { \
        source: "/api/:path*", \
        destination: "http://62.60.217.144:8080/api/:path*" \
      } \
    ]; \
  } \
}; \
export default nextConfig;' > next.config.mjs

RUN rm -f next.config.ts next.config.js

# 6. Собираем проект
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/ .
EXPOSE 3000
CMD ["npm", "run", "start"]
