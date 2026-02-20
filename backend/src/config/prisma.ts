import { PrismaClient } from '@prisma/client';

// Единственный экземпляр Prisma Client для всего приложения
// Это предотвращает исчерпание пула соединений с БД при росте нагрузки
const prisma = new PrismaClient();

// Корректно закрываем соединение с БД при остановке сервера
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export default prisma;
