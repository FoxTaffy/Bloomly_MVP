/**
 * One-off maintenance: освобождает email и username брошенных неподтверждённых регистраций
 * (например, почта введена с опечаткой и код подтверждения так и не пришёл). Dry-run by default —
 * ничего не меняет, пока не запущен с --execute.
 *
 * Правила те же, что при регистрации (modules/auth/unverifiedRelease.ts):
 *  - не подтверждён, не удалён, не забанен, не заморожен, не OAuth;
 *  - без постов, комментариев, сообщений и входов (refresh-токенов, last_seen_at);
 *  - у почты нет действующего кода 'register' (последний истёк или использован).
 * Освобождение = deleted_at + переименование email и username с суффиксом _del_.
 *
 * Usage:
 *   npm run db:release-unverified-accounts                 # dry run, prints a report only
 *   npm run db:release-unverified-accounts -- --dry-run    # то же самое, явно
 *   npm run db:release-unverified-accounts -- --execute    # actually releases the accounts
 */
import prisma from '../config/prisma.js';
import { classifyUnverified, releaseUnverified } from '../modules/auth/unverifiedRelease.js';

const OTP_WINDOW_MS = 15 * 60 * 1000;

async function main() {
  const execute = process.argv.includes('--execute');
  if (execute && process.argv.includes('--dry-run')) {
    throw new Error('--dry-run и --execute нельзя указывать вместе');
  }

  const { releasable, pending } = await classifyUnverified(prisma, {}, OTP_WINDOW_MS);
  console.log(`Неподтверждённых регистраций с ещё действующим кодом (не трогаем): ${pending.length}`);
  console.log(`Брошенных неподтверждённых регистраций к освобождению: ${releasable.length}`);
  releasable.forEach((u) => console.log(`  ${u.id}  @${u.username}  <${u.email}>  создан ${u.created_at.toISOString()}`));

  if (!execute) {
    console.log('\nDry run only — nothing was changed. Re-run with --execute to release these accounts.');
    return;
  }

  let released = 0;
  for (const u of releasable) {
    // Каждый аккаунт отдельно: условия перепроверяются в updateMany, изменившиеся пропускаются
    if (await releaseUnverified(prisma, u)) released += 1;
    else console.log(`  пропущен ${u.id}: состояние изменилось`);
  }
  console.log(`\nОсвобождено: ${released} из ${releasable.length}.`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
