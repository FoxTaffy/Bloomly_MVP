// Проверка содержимого файла по сигнатуре (magic bytes). Заголовок Content-Type присылает клиент,
// поэтому файл, объявленный как video/mp4, но содержащий HTML, не должен проходить.
// Список покрывает разрешённые типы загрузки (media/controller.ts). Неизвестный тип — отказ.

const ascii = (buf: Buffer, text: string, offset = 0) =>
  buf.subarray(offset, offset + text.length).toString('latin1') === text;

export function sniffMatches(buf: Buffer, mime: string): boolean {
  if (buf.length < 12) return false;
  switch (mime) {
    case 'image/jpeg':
      return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case 'image/png':
      return buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/gif':
      return ascii(buf, 'GIF8');
    case 'image/webp':
      return ascii(buf, 'RIFF') && ascii(buf, 'WEBP', 8);
    case 'image/avif':
    case 'video/mp4':
    case 'video/quicktime':
    case 'audio/mp4':
      // Контейнер ISO BMFF: слово ftyp на смещении 4
      return ascii(buf, 'ftyp', 4);
    case 'video/webm':
    case 'audio/webm':
      // EBML-заголовок Matroska/WebM
      return buf.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    case 'audio/ogg':
      return ascii(buf, 'OggS');
    case 'audio/wav':
      return ascii(buf, 'RIFF') && ascii(buf, 'WAVE', 8);
    // Документы и исходники для вложений чата
    case 'application/zip':
      return buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 3 || buf[2] === 5) && (buf[3] === 4 || buf[3] === 6);
    case 'application/x-7z-compressed':
      return buf.subarray(0, 6).equals(Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]));
    case 'application/vnd.rar':
    case 'application/x-rar-compressed':
      return ascii(buf, 'Rar!\x1a\x07');
    case 'application/gzip':
      return buf[0] === 0x1f && buf[1] === 0x8b;
    case 'image/vnd.adobe.photoshop':
      return ascii(buf, '8BPS');
    case 'audio/mpeg':
      // ID3-тег или кадр MPEG (синхрослово 11 бит)
      return ascii(buf, 'ID3') || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);
    default:
      return false;
  }
}
