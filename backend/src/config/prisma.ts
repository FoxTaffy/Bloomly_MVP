import { PrismaClient } from '@prisma/client';

// Единственный экземпляр Prisma Client для всего приложения
// connection_limit=20, pool_timeout=30s, connect_timeout=10s
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL +
        (process.env.DATABASE_URL?.includes('?') ? '&' : '?') +
        'connection_limit=20&pool_timeout=30&connect_timeout=10',
    },
  },
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

// Корректно закрываем соединение с БД при остановке сервера.
const shutdown = async () => {
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);

export default prisma;
