// В media_urls поста вперемешку лежат изображения/видео и вложения-файлы (PSD, архивы — Pro и Business).
// Карусель, сетка и лайтбокс работают только с визуальными; файлы выводятся отдельной плашкой скачивания.

const DOC_RE = /\.(zip|7z|rar|gz|psd)(\?.*)?$/i

export const isDocUrl = (url: string): boolean => DOC_RE.test(url)
export const visualMedia = (urls: readonly string[] | null | undefined): string[] => (urls ?? []).filter(u => !isDocUrl(u))
export const fileMedia = (urls: readonly string[] | null | undefined): string[] => (urls ?? []).filter(isDocUrl)

/** Расширение для плашки: PSD, ZIP, 7Z… */
export const fileExt = (url: string): string => (url.split('?')[0].split('.').pop() ?? 'file').toUpperCase()
