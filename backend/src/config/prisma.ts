import { PrismaClient } from '@prisma/client';

// Единственный экземпляр Prisma Client для всего приложения
// Это предотвращает исчерпание пула соединений с БД при росте нагрузки
const prisma = new PrismaClient();

// Корректно закрываем соединение с БД при остановке сервера.
// Используем SIGTERM/SIGINT (Docker, Kubernetes), а не beforeExit
// (beforeExit ненадёжен — не срабатывает при kill/ctrl+c).
const shutdown = async () => {
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);

export default prisma;
