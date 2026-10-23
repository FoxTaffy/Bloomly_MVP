import { createReadStream } from 'fs';
import { open } from 'fs/promises';

// Lossless-очистка метаданных (GPS, EXIF, XMP, текстовые блоки) из оригиналов фото БЕЗ декодирования и перекодирования
// пикселей: вырезаются только блоки метаданных, сжатые данные изображения и цветовой профиль (ICC) остаются бит-в-бит.
//  - JPEG: сегменты APP1 (Exif / XMP), APP13 (Photoshop IRB / IPTC) и комментарии COM; ICC_PROFILE (APP2), JFIF (APP0),
//    Adobe (APP14) сохраняются.
//  - PNG: чанки eXIf, tEXt, zTXt, iTXt; iCCP, gAMA, cHRM, sRGB, pHYs и данные изображения сохраняются.
//  - WebP: чанки EXIF и XMP (в RIFF обновляется размер и флаги VP8X); ICCP, ANIM и данные сохраняются.
// Ориентация: если в EXIF стоит Orientation ≠ 1, вместо полного EXIF остаётся минимальный блок с одним этим тегом —
// иначе снимок с телефона открылся бы в просмотрщиках повёрнутым. Всё остальное (GPS, модель камеры, даты) уходит.
// Файл читается и пишется потоком, в памяти — только небольшие заголовки сегментов.
// Не охватывает данные, дописанные после конца изображения (EOI / IEND) — они копируются как есть.

export type StrippableMime = 'image/jpeg' | 'image/png' | 'image/webp';
export const canStripMetadata = (mime: string): mime is StrippableMime =>
  mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp';

export class UnsupportedImage extends Error {}

interface Sink {
  /** Сколько байт уже записано. */
  bytes: number;
  write(buf: Buffer): Promise<void>;
  patch(offset: number, buf: Buffer): Promise<void>;
}

/** Построчное чтение потока: ровно n байт, копирование куска или остатка в приёмник без накопления в памяти. */
class Reader {
  private it: AsyncIterator<Buffer>;
  private buf: Buffer = Buffer.alloc(0);
  private eof = false;
  constructor(src: AsyncIterable<Buffer>) { this.it = src[Symbol.asyncIterator](); }

  private async fill(n: number) {
    while (this.buf.length < n && !this.eof) {
      const r = await this.it.next();
      if (r.done) this.eof = true;
      else this.buf = this.buf.length ? Buffer.concat([this.buf, r.value]) : r.value;
    }
  }
  /** До n байт (меньше — только в конце файла). Для заголовков и небольших сегментов. */
  async take(n: number): Promise<Buffer> {
    await this.fill(n);
    const out = this.buf.subarray(0, n);
    this.buf = this.buf.subarray(n);
    return out;
  }
  /** Скопировать n байт в приёмник кусками; возвращает, сколько реально скопировано. */
  async copy(n: number, sink: Sink): Promise<number> {
    let left = n;
    while (left > 0) {
      if (this.buf.length === 0) { await this.fill(1); if (this.buf.length === 0) break; }
      const k = Math.min(left, this.buf.length);
      await sink.write(this.buf.subarray(0, k));
      this.buf = this.buf.subarray(k);
      left -= k;
    }
    return n - left;
  }
  async skip(n: number): Promise<void> {
    let left = n;
    while (left > 0) {
      if (this.buf.length === 0) { await this.fill(1); if (this.buf.length === 0) return; }
      const k = Math.min(left, this.buf.length);
      this.buf = this.buf.subarray(k);
      left -= k;
    }
  }
  /** Всё оставшееся — как есть. */
  async rest(sink: Sink): Promise<void> {
    if (this.buf.length) { await sink.write(this.buf); this.buf = Buffer.alloc(0); }
    for (;;) {
      const r = await this.it.next();
      if (r.done) return;
      await sink.write(r.value);
    }
  }
}

// ── Orientation ─────────────────────────────────────────────────────────────────

/** Тег Orientation (0x0112) из TIFF-структуры EXIF; 1 — если его нет или структура не читается. */
export function readOrientation(tiff: Buffer): number {
  if (tiff.length < 14) return 1;
  const le = tiff.toString('latin1', 0, 2) === 'II';
  if (!le && tiff.toString('latin1', 0, 2) !== 'MM') return 1;
  const u16 = (o: number) => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
  const u32 = (o: number) => (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
  if (u16(2) !== 42) return 1;
  const ifd = u32(4);
  if (ifd + 2 > tiff.length) return 1;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > tiff.length) return 1;
    if (u16(e) === 0x0112) {
      const v = u16(e + 8);
      return v >= 1 && v <= 8 ? v : 1;
    }
  }
  return 1;
}

/** Минимальный TIFF с единственным тегом Orientation (big-endian, 26 байт). */
export function minimalOrientationTiff(orientation: number): Buffer {
  const b = Buffer.alloc(26);
  b.write('MM', 0, 'latin1');
  b.writeUInt16BE(42, 2);
  b.writeUInt32BE(8, 4);          // IFD0 сразу за заголовком
  b.writeUInt16BE(1, 8);          // одна запись
  b.writeUInt16BE(0x0112, 10);    // Orientation
  b.writeUInt16BE(3, 12);         // SHORT
  b.writeUInt32BE(1, 14);         // count
  b.writeUInt16BE(orientation, 18);
  // 20..21 — добивка значения, 22..25 — смещение следующего IFD = 0
  return b;
}

// ── JPEG ────────────────────────────────────────────────────────────────────────

const EXIF_HEADER = Buffer.from('Exif\0\0', 'latin1');

async function stripJpeg(r: Reader, sink: Sink) {
  const soi = await r.take(2);
  if (soi.length < 2 || soi[0] !== 0xff || soi[1] !== 0xd8) throw new UnsupportedImage('not a JPEG');
  await sink.write(soi);
  for (;;) {
    const m = await r.take(2);
    if (m.length < 2) return;
    if (m[0] !== 0xff) throw new UnsupportedImage('bad JPEG marker');
    const marker = m[1];
    if (marker === 0xff) throw new UnsupportedImage('JPEG fill bytes');
    // SOS и EOI: дальше идут сжатые данные — копируем остаток как есть, пиксели не трогаем
    if (marker === 0xda || marker === 0xd9) { await sink.write(m); await r.rest(sink); return; }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { await sink.write(m); continue; } // маркеры без длины
    const lenBuf = await r.take(2);
    if (lenBuf.length < 2) throw new UnsupportedImage('truncated JPEG');
    const len = lenBuf.readUInt16BE(0);
    if (len < 2) throw new UnsupportedImage('bad JPEG segment');
    const payload = await r.take(len - 2);
    if (payload.length < len - 2) throw new UnsupportedImage('truncated JPEG');

    if (marker === 0xe1) { // APP1: Exif (оставляем только Orientation), XMP и прочее — удаляем
      if (payload.subarray(0, 6).equals(EXIF_HEADER)) {
        const orientation = readOrientation(payload.subarray(6));
        if (orientation !== 1) {
          const tiff = minimalOrientationTiff(orientation);
          const seg = Buffer.alloc(4 + 6 + tiff.length);
          seg[0] = 0xff; seg[1] = 0xe1; seg.writeUInt16BE(2 + 6 + tiff.length, 2);
          EXIF_HEADER.copy(seg, 4); tiff.copy(seg, 10);
          await sink.write(seg);
        }
      }
      continue;
    }
    if (marker === 0xed || marker === 0xfe) continue; // APP13 (Photoshop / IPTC) и комментарии
    await sink.write(m); await sink.write(lenBuf); await sink.write(payload); // APP0, ICC (APP2), APP14, DQT, SOF…
  }
}

// ── PNG ─────────────────────────────────────────────────────────────────────────

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_DROP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf']);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function stripPng(r: Reader, sink: Sink) {
  const sig = await r.take(8);
  if (!sig.equals(PNG_SIG)) throw new UnsupportedImage('not a PNG');
  await sink.write(sig);
  for (;;) {
    const head = await r.take(8);
    if (head.length < 8) { if (head.length) await sink.write(head); return; }
    const len = head.readUInt32BE(0);
    const type = head.toString('latin1', 4, 8);
    if (len > 0x7fffffff) throw new UnsupportedImage('bad PNG chunk');
    if (PNG_DROP.has(type)) {
      if (type === 'eXIf') {
        const data = await r.take(len);
        await r.skip(4); // CRC
        const orientation = readOrientation(data);
        if (orientation !== 1) {
          const tiff = minimalOrientationTiff(orientation);
          const chunk = Buffer.alloc(12 + tiff.length);
          chunk.writeUInt32BE(tiff.length, 0);
          chunk.write('eXIf', 4, 'latin1');
          tiff.copy(chunk, 8);
          chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + tiff.length)), 8 + tiff.length);
          await sink.write(chunk);
        }
      } else {
        await r.skip(len + 4);
      }
      continue;
    }
    await sink.write(head);
    const copied = await r.copy(len + 4, sink);
    if (copied < len + 4) throw new UnsupportedImage('truncated PNG');
    if (type === 'IEND') { await r.rest(sink); return; }
  }
}

// ── WebP ────────────────────────────────────────────────────────────────────────

async function stripWebp(r: Reader, sink: Sink) {
  const head = await r.take(12);
  if (head.length < 12 || head.toString('latin1', 0, 4) !== 'RIFF' || head.toString('latin1', 8, 12) !== 'WEBP') throw new UnsupportedImage('not a WebP');
  await sink.write(head); // размер RIFF поправим в конце
  let flagsOffset = -1;
  let flagsByte = 0;
  let keptOrientation = false;
  for (;;) {
    const ch = await r.take(8);
    if (ch.length < 8) break;
    const fourcc = ch.toString('latin1', 0, 4);
    const size = ch.readUInt32LE(4);
    const padded = size + (size & 1);
    if (fourcc === 'XMP ') { await r.skip(padded); continue; }
    if (fourcc === 'EXIF') {
      const data = await r.take(padded);
      const tiff = data.subarray(0, 6).equals(EXIF_HEADER) ? data.subarray(6, size) : data.subarray(0, size);
      const orientation = readOrientation(tiff);
      if (orientation !== 1) {
        const min = minimalOrientationTiff(orientation);
        const out = Buffer.alloc(8 + min.length);
        out.write('EXIF', 0, 'latin1');
        out.writeUInt32LE(min.length, 4);
        min.copy(out, 8);
        await sink.write(out);
        keptOrientation = true;
      }
      continue;
    }
    if (fourcc === 'VP8X') {
      const payload = await r.take(padded);
      payload[0] &= ~0x0c; // снимаем флаги EXIF (0x08) и XMP (0x04): вернём EXIF, только если оставим Orientation
      flagsOffset = sink.bytes + 8;
      flagsByte = payload[0];
      await sink.write(ch);
      await sink.write(payload);
      continue;
    }
    await sink.write(ch);
    const copied = await r.copy(padded, sink);
    if (copied < padded) throw new UnsupportedImage('truncated WebP');
  }
  if (keptOrientation && flagsOffset >= 0) {
    await sink.patch(flagsOffset, Buffer.from([flagsByte | 0x08])); // в файле остался EXIF (только Orientation) — поднимаем его флаг
  }
  const riff = Buffer.alloc(4);
  riff.writeUInt32LE(sink.bytes - 8, 0);
  await sink.patch(4, riff);
}

// ── Публичный API ───────────────────────────────────────────────────────────────

/**
 * Копирует изображение srcPath в dstPath без метаданных (GPS, EXIF, XMP, текстовые блоки), не затрагивая сжатые
 * пиксели и цветовой профиль. Возвращает размер результата. Не поддерживаемый или повреждённый файл — UnsupportedImage.
 */
export async function stripImageMetadata(srcPath: string, dstPath: string, mime: StrippableMime): Promise<{ sizeBytes: number }> {
  const out = await open(dstPath, 'w+');
  let written = 0;
  const sink: Sink = {
    get bytes() { return written; },
    async write(buf) { await out.write(buf, 0, buf.length, written); written += buf.length; },
    async patch(offset, buf) { await out.write(buf, 0, buf.length, offset); },
  } as Sink;
  try {
    const reader = new Reader(createReadStream(srcPath, { highWaterMark: 256 * 1024 }));
    if (mime === 'image/jpeg') await stripJpeg(reader, sink);
    else if (mime === 'image/png') await stripPng(reader, sink);
    else await stripWebp(reader, sink);
    return { sizeBytes: written };
  } finally {
    await out.close();
  }
}
