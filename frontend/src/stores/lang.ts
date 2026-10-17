import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { translations, type Lang } from '../locales/translations'

/** Intl/toLocaleDateString locale for each UI language. */
export const LANG_TO_LOCALE: Record<Lang, string> = {
  RU: 'ru-RU', EN: 'en-US', JP: 'ja-JP', CN: 'zh-CN', DE: 'de-DE', FR: 'fr-FR', ES: 'es-ES', PT: 'pt-PT',
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
  const currentLang = ref<Lang>((localStorage.getItem('bloomly_lang') as Lang) || 'RU')
  const autoTranslateEnabled = ref<boolean>(localStorage.getItem('bloomly_auto_translate') === '1')
  const autoTranslateLang = ref<Lang>((localStorage.getItem('bloomly_auto_translate_lang') as Lang) || currentLang.value)

  const t = computed(() => translations[currentLang.value])

  function setLang(lang: Lang) {
    currentLang.value = lang
    localStorage.setItem('bloomly_lang', lang)
  }

  function setAutoTranslate(enabled: boolean) {
    autoTranslateEnabled.value = enabled
    localStorage.setItem('bloomly_auto_translate', enabled ? '1' : '0')
  }

  function setAutoTranslateLang(lang: Lang) {
    autoTranslateLang.value = lang
    localStorage.setItem('bloomly_auto_translate_lang', lang)
  }

  return { currentLang, t, setLang, autoTranslateEnabled, autoTranslateLang, setAutoTranslate, setAutoTranslateLang }
})
