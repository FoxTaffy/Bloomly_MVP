/**
 * Переносит legacy-объекты закрытых папок (верификация, жалобы, поддержка), которые загружены до
 * введения префикса private/, под private/<папка>/<файл>, обновляет ссылки в БД и удаляет оригинал.
 *
 * До этого они лежали в публичном бакете по прямой ссылке: любой, кто знал URL, читал документы.
 *
 * Dry-run по умолчанию: ничего не копирует и не меняет, только печатает план.
 * Реальный перенос: npm run db:migrate-legacy-private-media -- --execute
 *
 * Идемпотентен: объект, уже существующий под private/, пропускается, а ссылки уже перенесённые
 * не находятся по старому URL.
 */
import * as Minio from 'minio';
import prisma from '../config/prisma.js';

const LEGACY_FOLDERS = ['verification', 'reports', 'support'];
const PRIVATE_PREFIX = 'private/';
const EXECUTE = process.argv.includes('--execute');

const BUCKET = process.env.MINIO_BUCKET || 'bloomly';
const PUBLIC_URL = process.env.MINIO_PUBLIC_URL || 'https://bloomly.fun/s3';
const client = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'minio',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ROOT_USER || 'admin',
  secretKey: process.env.MINIO_ROOT_PASSWORD || '',
});

type Obj = { key: string; size: number };

const publicUrl = (key: string) => `${PUBLIC_URL}/${BUCKET}/${key}`;

async function listLegacyObjects(): Promise<Obj[]> {
  const found: Obj[] = [];
  for (const folder of LEGACY_FOLDERS) {
    await new Promise<void>((resolve, reject) => {
      const stream = client.listObjectsV2(BUCKET, `${folder}/`, true);
      stream.on('data', (o) => { if (o.name) found.push({ key: o.name, size: o.size ?? 0 }); });
      stream.on('end', () => resolve());
      stream.on('error', reject);
    });
  }
  return found;
}

async function objectExists(key: string): Promise<boolean> {
  try {
    await client.statObject(BUCKET, key);
    return true;
  } catch {
    return false;
  }
}

/** Все строки БД, где старый URL лежит в массиве ссылок. Возвращает функцию замены для записи. */
async function referencesTo(url: string) {
  const [verifications, reports, supports] = await Promise.all([
    prisma.verificationRequest.findMany({ where: { evidence_urls: { has: url } }, select: { id: true, evidence_urls: true } }),
    prisma.report.findMany({ where: { evidence_urls: { has: url } }, select: { id: true, evidence_urls: true } }),
    prisma.supportTicketMessage.findMany({ where: { attachment_urls: { has: url } }, select: { id: true, attachment_urls: true } }),
  ]);
  return { verifications, reports, supports };
}

async function main() {
  console.log(`Режим: ${EXECUTE ? 'EXECUTE (объекты будут перенесены)' : 'DRY-RUN (ничего не меняется)'}`);
  console.log(`Бакет: ${BUCKET}, папки: ${LEGACY_FOLDERS.join(', ')}\n`);

  const objects = await listLegacyObjects();
  const totals = { objects: 0, bytes: 0, dbRows: 0, refs: 0, alreadyMoved: 0, missingInDb: 0 };
  const byFolder = new Map<string, number>();

  for (const obj of objects) {
    const folder = obj.key.split('/')[0];
    byFolder.set(folder, (byFolder.get(folder) ?? 0) + 1);
    totals.objects += 1;
    totals.bytes += obj.size;

    const newKey = `${PRIVATE_PREFIX}${obj.key}`;
    const oldUrl = publicUrl(obj.key);
    const row = await prisma.mediaObject.findUnique({ where: { object_key: obj.key }, select: { id: true } });
    if (row) totals.dbRows += 1; else totals.missingInDb += 1;

    const refs = await referencesTo(oldUrl);
    const refCount = refs.verifications.length + refs.reports.length + refs.supports.length;
    totals.refs += refCount;

    const alreadyCopied = await objectExists(newKey);
    if (alreadyCopied) totals.alreadyMoved += 1;

    const action = alreadyCopied ? 'уже скопирован' : 'перенести';
    console.log(`${action.padEnd(15)} ${obj.key}  ->  ${newKey}  (${(obj.size / 1024).toFixed(1)} KB, ссылок в БД: ${refCount}, строка media_objects: ${row ? 'да' : 'нет'})`);

    if (!EXECUTE) continue;

    if (!alreadyCopied) {
      await client.copyObject(BUCKET, newKey, `/${BUCKET}/${obj.key}`, new Minio.CopyConditions());
    }
    // Переключаем ссылки только после успешного копирования, в одной транзакции с media_objects
    await prisma.$transaction(async (tx) => {
      if (row) await tx.mediaObject.update({ where: { id: row.id }, data: { object_key: newKey } });
      for (const v of refs.verifications) {
        await tx.verificationRequest.update({ where: { id: v.id }, data: { evidence_urls: v.evidence_urls.map((u) => (u === oldUrl ? publicUrl(newKey) : u)) } });
      }
      for (const r of refs.reports) {
        await tx.report.update({ where: { id: r.id }, data: { evidence_urls: r.evidence_urls.map((u) => (u === oldUrl ? publicUrl(newKey) : u)) } });
      }
      for (const s of refs.supports) {
        await tx.supportTicketMessage.update({ where: { id: s.id }, data: { attachment_urls: s.attachment_urls.map((u) => (u === oldUrl ? publicUrl(newKey) : u)) } });
      }
    });
    // Оригинал удаляем последним: до этого момента ссылка на него ещё может быть открыта
    await client.removeObject(BUCKET, obj.key);
  }

  console.log('\nИтого:');
  console.log(`  объектов: ${totals.objects} (${(totals.bytes / 1024 / 1024).toFixed(2)} MB)`);
  for (const [folder, n] of byFolder) console.log(`    ${folder}: ${n}`);
  console.log(`  строк media_objects: ${totals.dbRows}, без строки: ${totals.missingInDb}`);
  console.log(`  ссылок в БД к переносу: ${totals.refs}`);
  console.log(`  уже скопировано ранее: ${totals.alreadyMoved}`);
  if (!EXECUTE) console.log('\nDRY-RUN: данные не изменены. Для переноса запустите с --execute.');
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
