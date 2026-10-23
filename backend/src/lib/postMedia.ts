// В media_urls поста вперемешку лежат изображения/видео и вложения-файлы (PSD, архивы — Pro и Business).
// Превью (OG, миниатюры, ленты групп) должны брать только визуальные файлы.
const DOC_RE = /\.(zip|7z|rar|gz|psd)(\?.*)?$/i;
export const isDocUrl = (url: string): boolean => DOC_RE.test(url);
export const firstVisualMedia = (urls: readonly string[] | null | undefined): string | undefined =>
  (urls ?? []).find((u) => !isDocUrl(String(u)));
