import { defineStore } from 'pinia'
import { ref, computed, shallowRef } from 'vue'
import { ru, isLang, loadTranslation, type Lang, type Translation } from '../locales/translations'

/** Intl/toLocaleDateString locale for each UI language. */
export const LANG_TO_LOCALE: Record<Lang, string> = {
  RU: 'ru-RU', EN: 'en-US', JP: 'ja-JP', CN: 'zh-CN', DE: 'de-DE', FR: 'fr-FR', ES: 'es-ES', PT: 'pt-PT',
}

/** Код языка браузера/Google («ru», «pt-BR», «zh-TW», «ja») → язык интерфейса; незнакомый → null. */
export function langFromLocaleCode(code?: string | null): Lang | null {
  const base = (code ?? '').toLowerCase().split(/[-_]/)[0]
  const map: Record<string, Lang> = { ru: 'RU', en: 'EN', ja: 'JP', zh: 'CN', de: 'DE', fr: 'FR', es: 'ES', pt: 'PT' }
  return map[base] ?? null
}

/** Первый заход без выбора: язык браузера по приоритету; ни один не поддержан — английский. */
function detectBrowserLang(): Lang {
  const list = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const code of list) {
    const l = langFromLocaleCode(code)
    if (l) return l
  }
  return list.filter(Boolean).length ? 'EN' : 'RU'
}

export type DateField = 'day' | 'month' | 'year'

/** Field order + separator for numeric date entry (e.g. birth date), derived from each locale's own convention. */
export const DATE_FIELD_ORDER: Record<Lang, { order: DateField[]; separator: string }> = (() => {
  const probe = new Date(2020, 0, 15) // day/month distinct enough to detect ordering
  const result = {} as Record<Lang, { order: DateField[]; separator: string }>
  for (const lang of Object.keys(LANG_TO_LOCALE) as Lang[]) {
    const parts = new Intl.DateTimeFormat(LANG_TO_LOCALE[lang], { day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(probe)
    const order = parts.filter((p): p is Intl.DateTimeFormatPart & { type: DateField } =>
      p.type === 'day' || p.type === 'month' || p.type === 'year').map(p => p.type)
    const separator = parts.find(p => p.type === 'literal')?.value ?? '.'
    result[lang] = { order, separator }
  }
  return result
})()

export const useLangStore = defineStore('lang', () => {
  const saved = localStorage.getItem('bloomly_lang')
  // Язык, выбранный не руками, а определённый автоматически, помечаем: Google-вход может его уточнить
  const autoDetected = !isLang(saved)
  const initial: Lang = isLang(saved) ? saved : detectBrowserLang()
  if (autoDetected) {
    try { localStorage.setItem('bloomly_lang', initial); localStorage.setItem('bloomly_lang_auto', '1') } catch { /* private mode */ }
  }
  const currentLang = ref<Lang>(initial)
  const autoTranslateEnabled = ref<boolean>(localStorage.getItem('bloomly_auto_translate') === '1')
  const savedAuto = localStorage.getItem('bloomly_auto_translate_lang')
  const autoTranslateLang = ref<Lang>(isLang(savedAuto) ? savedAuto : currentLang.value)

  // Загруженные словари. Пока выбранный язык грузится, показывается русский.
  const loaded = shallowRef<Partial<Record<Lang, Translation>>>({ RU: ru })
  const t = computed(() => loaded.value[currentLang.value] ?? ru)

  async function ensureLoaded(lang: Lang) {
    if (loaded.value[lang]) return
    const dict = await loadTranslation(lang)
    loaded.value = { ...loaded.value, [lang]: dict }
  }

  /** Словарь сохранённого языка; main.ts ждёт его перед монтированием, чтобы не мелькал русский. */
  const ready: Promise<void> = ensureLoaded(currentLang.value).catch(() => {})

  /** Язык переключается, когда его словарь уже загружен (без промежуточного русского). */
  async function setLang(lang: Lang, auto = false) {
    localStorage.setItem('bloomly_lang', lang)
    if (auto) localStorage.setItem('bloomly_lang_auto', '1')
    else localStorage.removeItem('bloomly_lang_auto')
    try { await ensureLoaded(lang) } catch { return }
    currentLang.value = lang
  }

  /** Язык аккаунта Google: применяем, только пока пользователь сам язык не выбирал. */
  async function applySuggestedLang(code?: string | null) {
    if (localStorage.getItem('bloomly_lang_auto') !== '1') return
    const l = langFromLocaleCode(code)
    if (l && l !== currentLang.value) await setLang(l, true)
  }

  function setAutoTranslate(enabled: boolean) {
    autoTranslateEnabled.value = enabled
    localStorage.setItem('bloomly_auto_translate', enabled ? '1' : '0')
  }

  function setAutoTranslateLang(lang: Lang) {
    autoTranslateLang.value = lang
    localStorage.setItem('bloomly_auto_translate_lang', lang)
  }

  return { currentLang, t, ready, setLang, applySuggestedLang, autoTranslateEnabled, autoTranslateLang, setAutoTranslate, setAutoTranslateLang }
})
