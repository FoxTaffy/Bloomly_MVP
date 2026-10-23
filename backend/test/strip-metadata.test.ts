import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import sharp from 'sharp';
import { mkdtemp, writeFile, readFile, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { stripImageMetadata, readOrientation, minimalOrientationTiff, canStripMetadata, UnsupportedImage } from '../src/lib/stripMetadata.js';

let dir: string;
beforeAll(async () => { dir = await mkdtemp(path.join(os.tmpdir(), 'strip-')); });
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

// Картинка с шумом 400×300: сжатые данные нетривиальны, любое пережатие меняло бы байты
async function noise() {
  const raw = Buffer.alloc(400 * 300 * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 37 + (i >> 5) * 11) & 255;
  return sharp(raw, { raw: { width: 400, height: 300, channels: 3 } });
}
const GPS = { IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '55/1 45/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '37/1 37/1 0/1' } };
// В EXIF GPS живёт в отдельном IFD, на который ведёт указатель — тег 0x8825 (в файле от sharp порядок байт little-endian)
const hasGps = async (buf: Buffer) => {
  const exif = (await sharp(buf).metadata()).exif;
  return !!exif && (exif.includes(Buffer.from([0x25, 0x88])) || exif.includes(Buffer.from([0x88, 0x25])));
};
const strip = async (buf: Buffer, ext: string, mime: 'image/jpeg' | 'image/png' | 'image/webp') => {
  const src = path.join(dir, `in-${Math.random().toString(36).slice(2)}${ext}`);
  const dst = `${src}.out`;
  await writeFile(src, buf);
  const r = await stripImageMetadata(src, dst, mime);
  const out = await readFile(dst);
  expect(r.sizeBytes).toBe(out.length);
  return out;
};
const pixels = async (buf: Buffer) => (await sharp(buf).raw().toBuffer({ resolveWithObject: true }));

/** Байты сжатых данных JPEG: всё, начиная с маркера SOS (FF DA). */
const jpegScan = (buf: Buffer) => {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) throw new Error('bad');
    const m = buf[i + 1];
    if (m === 0xda) return buf.subarray(i);
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error('no SOS');
};
/** Все чанки PNG по типам. */
const pngChunks = (buf: Buffer) => {
  const out: { type: string; data: Buffer }[] = [];
  let i = 8;
  while (i < buf.length) {
    const len = buf.readUInt32BE(i);
    out.push({ type: buf.toString('latin1', i + 4, i + 8), data: buf.subarray(i + 8, i + 8 + len) });
    i += 12 + len;
  }
  return out;
};
const pngChunk = (type: string, data: Buffer) => {
  const { crc32 } = { crc32: (b: Buffer) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; } return ~c >>> 0; } };
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
};

describe('JPEG: GPS и EXIF уходят, пиксели и ICC — бит-в-бит', () => {
  it('удаляет EXIF с GPS, XMP остаётся неприкосновенным по пикселям: сжатые данные идентичны', async () => {
    const withMeta = await (await noise()).withExif({ IFD0: { Copyright: 'secret-owner', Make: 'CameraCo' }, ...GPS }).jpeg({ quality: 90 }).toBuffer();
    expect(await hasGps(withMeta)).toBe(true);

    const out = await strip(withMeta, '.jpg', 'image/jpeg');
    expect(await hasGps(out)).toBe(false);
    expect(out.includes(Buffer.from('secret-owner'))).toBe(false);
    expect(out.includes(Buffer.from('CameraCo'))).toBe(false);
    expect(out.includes(Buffer.from('Exif'))).toBe(false);
    expect(jpegScan(out).equals(jpegScan(withMeta))).toBe(true); // сжатые пиксели не тронуты
    const [a, b] = [await pixels(withMeta), await pixels(out)];
    expect(b.data.equals(a.data)).toBe(true);
    expect(out.length).toBeLessThan(withMeta.length);
  });

  it('цветовой профиль ICC сохраняется целиком', async () => {
    const src = await (await noise()).withIccProfile('p3').withExif(GPS).jpeg({ quality: 85 }).toBuffer();
    const iccBefore = (await sharp(src).metadata()).icc!;
    expect(iccBefore.length).toBeGreaterThan(100);
    const out = await strip(src, '.jpg', 'image/jpeg');
    const meta = await sharp(out).metadata();
    expect(meta.icc).toBeDefined();
    expect(meta.icc!.equals(iccBefore)).toBe(true);
    expect(await hasGps(out)).toBe(false);
  });

  it('Orientation ≠ 1 сохраняется минимальным EXIF (без GPS и прочего), Orientation = 1 — EXIF вырезается целиком', async () => {
    const rotated = await (await noise()).withMetadata({ orientation: 6 }).withExif({ IFD0: { Make: 'CameraCo' }, ...GPS }).jpeg().toBuffer();
    expect((await sharp(rotated).metadata()).orientation).toBe(6);
    expect(await hasGps(rotated)).toBe(true);
    const out = await strip(rotated, '.jpg', 'image/jpeg');
    const meta = await sharp(out).metadata();
    expect(meta.orientation).toBe(6);
    expect(await hasGps(out)).toBe(false);
    expect(out.includes(Buffer.from('CameraCo'))).toBe(false);
    expect(jpegScan(out).equals(jpegScan(rotated))).toBe(true);

    const upright = await (await noise()).withExif({ IFD0: { Make: 'CameraCo' }, ...GPS }).jpeg().toBuffer();
    const out2 = await strip(upright, '.jpg', 'image/jpeg');
    expect(out2.includes(Buffer.from('Exif'))).toBe(false);
  });

  it('файл без метаданных остаётся тем же набором байт; результат открывается', async () => {
    const plain = await (await noise()).jpeg().toBuffer();
    const out = await strip(plain, '.jpg', 'image/jpeg');
    expect(out.equals(plain)).toBe(true);
    expect((await sharp(out).metadata()).format).toBe('jpeg');
  });

  it('комментарии JPEG вырезаются', async () => {
    const plain = await (await noise()).jpeg().toBuffer();
    const text = Buffer.from('home at 55.75,37.62', 'latin1');
    const com = Buffer.concat([Buffer.from([0xff, 0xfe, 0, text.length + 2]), text]);
    const withCom = Buffer.concat([plain.subarray(0, 2), com, plain.subarray(2)]);
    expect(withCom.includes(text)).toBe(true);
    const out = await strip(withCom, '.jpg', 'image/jpeg');
    expect(out.includes(text)).toBe(false);
    expect(out.equals(plain)).toBe(true);
  });
});

describe('PNG: текстовые блоки и eXIf уходят, IDAT и iCCP — бит-в-бит', () => {
  it('удаляет tEXt / zTXt / iTXt / eXIf, остальные чанки не меняются', async () => {
    const base = await (await noise()).png().toBuffer();
    const chunks = pngChunks(base);
    const ihdr = chunks[0];
    // IHDR (длина 13) остаётся первым; метаданные вставляем сразу за ним
    const tiff = Buffer.from('MM\0*\0\0\0\x08\0\x01\x01\x12\0\x03\0\0\0\x01\0\x01\0\0\0\0\0\0', 'latin1');
    const inject = Buffer.concat([
      pngChunk('tEXt', Buffer.from('Comment\0lat=55.75', 'latin1')),
      pngChunk('zTXt', Buffer.from('Note\0\0xyz', 'latin1')),
      pngChunk('iTXt', Buffer.from('XML:com.adobe.xmp\0\0\0\0\0<gps/>', 'latin1')),
      pngChunk('eXIf', tiff),
    ]);
    const head = 8 + 12 + ihdr.data.length;
    const withMeta = Buffer.concat([base.subarray(0, head), inject, base.subarray(head)]);
    expect(pngChunks(withMeta).map((c) => c.type)).toEqual(expect.arrayContaining(['tEXt', 'zTXt', 'iTXt', 'eXIf']));

    const out = await strip(withMeta, '.png', 'image/png');
    const types = pngChunks(out).map((c) => c.type);
    for (const t of ['tEXt', 'zTXt', 'iTXt', 'eXIf']) expect(types).not.toContain(t);
    expect(out.equals(base)).toBe(true); // ровно исходный файл без вставок
    const [a, b] = [await pixels(withMeta), await pixels(out)];
    expect(b.data.equals(a.data)).toBe(true);
  });

  it('iCCP сохраняется; Orientation в eXIf переносится минимальным блоком', async () => {
    const base = await (await noise()).withIccProfile('p3').png().toBuffer();
    expect(pngChunks(base).some((c) => c.type === 'iCCP')).toBe(true);
    const tiff = minimalOrientationTiff(8);
    const head = 8 + 12 + 13;
    const withExif = Buffer.concat([base.subarray(0, head), pngChunk('eXIf', Buffer.concat([tiff.subarray(0, 0), tiff])), base.subarray(head)]);
    const out = await strip(withExif, '.png', 'image/png');
    const chunks = pngChunks(out);
    expect(chunks.find((c) => c.type === 'iCCP')!.data.equals(pngChunks(base).find((c) => c.type === 'iCCP')!.data)).toBe(true);
    const exif = chunks.find((c) => c.type === 'eXIf')!;
    expect(exif.data.length).toBe(26);
    expect(readOrientation(exif.data)).toBe(8);
    expect(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data.length)).toEqual(pngChunks(base).filter((c) => c.type === 'IDAT').map((c) => c.data.length));
  });
});

describe('WebP: EXIF и XMP уходят, размер RIFF и флаги исправлены', () => {
  it('очищает lossless WebP от EXIF с GPS; пиксели те же, файл валиден', async () => {
    const src = await (await noise()).withExif({ IFD0: { Make: 'CameraCo' }, ...GPS }).webp({ lossless: true }).toBuffer();
    expect(await hasGps(src)).toBe(true);
    const out = await strip(src, '.webp', 'image/webp');
    expect(await hasGps(out)).toBe(false);
    expect(out.includes(Buffer.from('CameraCo'))).toBe(false);
    expect(out.readUInt32LE(4)).toBe(out.length - 8); // RIFF size
    expect((await sharp(out).metadata()).format).toBe('webp');
    expect((await pixels(out)).data.equals((await pixels(src)).data)).toBe(true);
    // флаг EXIF в VP8X снят
    if (out.toString('latin1', 12, 16) === 'VP8X') expect(out[20] & 0x0c).toBe(0);
  });

  it('Orientation сохраняется минимальным EXIF, флаг VP8X поднят', async () => {
    const src = await (await noise()).withMetadata({ orientation: 3 }).withExif({ IFD0: { Make: 'CameraCo' }, ...GPS }).webp({ lossless: true }).toBuffer();
    expect((await sharp(src).metadata()).orientation).toBe(3);
    const out = await strip(src, '.webp', 'image/webp');
    expect((await sharp(out).metadata()).orientation).toBe(3);
    expect(await hasGps(out)).toBe(false);
    expect(out.readUInt32LE(4)).toBe(out.length - 8);
  });
});

describe('границы', () => {
  it('поддерживаемые форматы и отказ на неподходящем содержимом', async () => {
    expect(['image/jpeg', 'image/png', 'image/webp'].every(canStripMetadata)).toBe(true);
    expect(canStripMetadata('image/avif')).toBe(false);
    expect(canStripMetadata('image/gif')).toBe(false);
    const bad = path.join(dir, 'bad.jpg');
    await writeFile(bad, Buffer.from('this is not a jpeg at all'));
    await expect(stripImageMetadata(bad, `${bad}.out`, 'image/jpeg')).rejects.toBeInstanceOf(UnsupportedImage);
  });

  it('readOrientation читает оба порядка байт и не падает на мусоре', () => {
    expect(readOrientation(minimalOrientationTiff(6))).toBe(6);
    const le = Buffer.from('II*\0\x08\0\0\0\x01\0\x12\x01\x03\0\x01\0\0\0\x03\0\0\0\0\0\0\0', 'latin1');
    expect(readOrientation(le)).toBe(3);
    expect(readOrientation(Buffer.from('garbage'))).toBe(1);
    expect(readOrientation(Buffer.alloc(0))).toBe(1);
  });

  it('большой файл идёт потоком и остаётся целым (8 МБ шума в JPEG-обёртке после EOI)', async () => {
    const plain = await (await noise()).jpeg().toBuffer();
    const tail = Buffer.alloc(8 * 1024 * 1024, 7); // «хвост» после EOI копируется как есть
    const out = await strip(Buffer.concat([plain, tail]), '.jpg', 'image/jpeg');
    expect(out.length).toBe(plain.length + tail.length);
    expect(out.subarray(plain.length).equals(tail)).toBe(true);
  });
});
