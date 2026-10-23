import { afterAll } from 'vitest';

// Каждый тестовый файл поднимает своё приложение (Fastify + Prisma). Без закрытия соединения и таймеры живут
// до конца процесса — на длинном прогоне это копило память контейнера до OOM-kill (код 137).
afterAll(async () => {
  const g = globalThis as { __bloomlyApp?: { close: () => Promise<void> } };
  if (!g.__bloomlyApp) return;
  await g.__bloomlyApp.close().catch(() => undefined);
  g.__bloomlyApp = undefined;
  const { default: prisma } = await import('../src/config/prisma.js');
  await prisma.$disconnect().catch(() => undefined);
});
