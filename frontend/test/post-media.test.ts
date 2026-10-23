import { describe, it, expect } from 'vitest'
import { isDocUrl, visualMedia, fileMedia, fileExt } from '../src/lib/postMedia'

describe('вложения поста: файлы отдельно от картинок', () => {
  const urls = ['https://s3/posts/a.webp', 'https://s3/posts/src.PSD', 'https://s3/posts/b.mp4', 'https://s3/posts/pack.zip?x=1', 'https://s3/posts/c.7z']

  it('делит список на визуальные и файлы, порядок сохраняется', () => {
    expect(visualMedia(urls)).toEqual(['https://s3/posts/a.webp', 'https://s3/posts/b.mp4'])
    expect(fileMedia(urls)).toEqual(['https://s3/posts/src.PSD', 'https://s3/posts/pack.zip?x=1', 'https://s3/posts/c.7z'])
  })

  it('распознаёт PSD и архивы по расширению без учёта регистра и параметров', () => {
    for (const u of ['a.psd', 'a.PSD', 'a.zip', 'a.rar', 'a.7z', 'a.gz', 'a.zip?token=1']) expect(isDocUrl(u), u).toBe(true)
    for (const u of ['a.png', 'a.mp4', 'a.webp', 'zip.png', 'a.zipx']) expect(isDocUrl(u), u).toBe(false)
  })

  it('пустые значения безопасны; расширение для плашки в верхнем регистре', () => {
    expect(visualMedia(undefined)).toEqual([])
    expect(fileMedia(null)).toEqual([])
    expect(fileExt('https://s3/posts/art.psd?x=1')).toBe('PSD')
  })
})
