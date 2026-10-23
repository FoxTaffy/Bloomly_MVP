import { describe, it, expect } from 'vitest'
import { checkUpload, effectiveMime, requiredTier, uploadKind, limitBytes, formatBytes, normalizeTier } from '../src/lib/uploadLimits'

const MB = 1024 * 1024
const GB = 1024 * MB
const f = (name: string, type: string, size: number) => ({ name, type, size })

describe('checkUpload: предпроверка файла по тарифу', () => {
  it('Free: фото до 15 МБ проходит, сверх — «слишком большое» с подсказкой Lite', () => {
    expect(checkUpload(f('a.jpg', 'image/jpeg', 15 * MB), 'free').ok).toBe(true)
    expect(checkUpload(f('a.jpg', 'image/jpeg', 15 * MB + 1), 'free')).toMatchObject({ ok: false, reason: 'too_big', limit: 15 * MB, needTier: 'lite' })
  })

  it('видео: Free 100 МБ → Lite 500 МБ → Pro 1 ГБ → Business 2 ГБ', () => {
    expect(checkUpload(f('v.mp4', 'video/mp4', 100 * MB), 'free').ok).toBe(true)
    expect(checkUpload(f('v.mp4', 'video/mp4', 300 * MB), 'free')).toMatchObject({ ok: false, needTier: 'lite' })
    expect(checkUpload(f('v.mp4', 'video/mp4', 700 * MB), 'lite')).toMatchObject({ ok: false, needTier: 'pro' })
    expect(checkUpload(f('v.mp4', 'video/mp4', 1.5 * GB), 'pro')).toMatchObject({ ok: false, needTier: 'business' })
    expect(checkUpload(f('v.mp4', 'video/mp4', 2 * GB), 'business').ok).toBe(true)
    expect(checkUpload(f('v.mp4', 'video/mp4', 2 * GB + 1), 'business')).toMatchObject({ ok: false, needTier: null })
  })

  it('фото Lite+ до 50 МБ, сверх — нигде', () => {
    for (const tier of ['lite', 'pro', 'business']) expect(checkUpload(f('a.png', 'image/png', 50 * MB), tier).ok).toBe(true)
    expect(checkUpload(f('a.png', 'image/png', 51 * MB), 'business')).toMatchObject({ ok: false, needTier: null })
  })

  it('PSD и архивы: Free и Lite — недоступны (нужен Pro), Pro и Business — до 1 и 2 ГБ', () => {
    for (const tier of ['free', 'lite']) {
      expect(checkUpload(f('a.zip', 'application/zip', 1 * MB), tier)).toMatchObject({ ok: false, reason: 'not_in_plan', needTier: 'pro' })
    }
    expect(checkUpload(f('a.psd', '', 800 * MB), 'pro').ok).toBe(true)
    expect(checkUpload(f('a.psd', '', 1.5 * GB), 'pro')).toMatchObject({ ok: false, reason: 'too_big', needTier: 'business' })
    expect(checkUpload(f('a.7z', '', 2 * GB), 'business').ok).toBe(true)
  })

  it('неизвестный и пустой тариф считаются Free', () => {
    expect(normalizeTier(undefined)).toBe('free')
    expect(normalizeTier('god')).toBe('free')
    expect(checkUpload(f('a.jpg', 'image/jpeg', 20 * MB), 'god').ok).toBe(false)
  })
})

describe('вспомогательное', () => {
  it('тип PSD и архивов определяется по расширению, когда браузер молчит', () => {
    expect(effectiveMime(f('art.PSD', '', 1))).toBe('image/vnd.adobe.photoshop')
    expect(effectiveMime(f('a.zip', 'application/x-zip-compressed', 1))).toBe('application/zip')
    expect(effectiveMime(f('a.rar', 'application/octet-stream', 1))).toBe('application/vnd.rar')
    expect(effectiveMime(f('a.jpg', 'image/jpeg', 1))).toBe('image/jpeg')
  })

  it('PSD — документ, а не фото; аудио считается как видео', () => {
    expect(uploadKind('image/vnd.adobe.photoshop')).toBe('document')
    expect(uploadKind('audio/mpeg')).toBe('video')
    expect(uploadKind('image/png')).toBe('photo')
    expect(limitBytes('lite', 'document')).toBe(0)
  })

  it('requiredTier и формат размера', () => {
    expect(requiredTier('video', 50 * MB)).toBe('free')
    expect(requiredTier('document', 1)).toBe('pro')
    expect(formatBytes(15 * MB)).toBe('15 МБ')
    expect(formatBytes(1.5 * GB)).toBe('1.5 ГБ')
  })
})
