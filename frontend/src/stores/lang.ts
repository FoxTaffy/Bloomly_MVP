import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { translations, type Lang } from '../locales/translations'

/** Intl/toLocaleDateString locale for each UI language. */
export const LANG_TO_LOCALE: Record<Lang, string> = {
  RU: 'ru-RU', EN: 'en-US', JP: 'ja-JP', CN: 'zh-CN', DE: 'de-DE', FR: 'fr-FR', ES: 'es-ES', PT: 'pt-PT',
}

const COUNTRY_TO_LANG: Record<string, Lang> = {
  RU: 'RU', BY: 'RU', UA: 'RU', KZ: 'RU', UZ: 'RU', TJ: 'RU', KG: 'RU', TM: 'RU', MD: 'RU', AM: 'RU',
  JP: 'JP',
  CN: 'CN', TW: 'CN', HK: 'CN', MO: 'CN',
  DE: 'DE', AT: 'DE', LI: 'DE',
  FR: 'FR', BE: 'FR', LU: 'FR', MC: 'FR',
  ES: 'ES', MX: 'ES', AR: 'ES', CO: 'ES', PE: 'ES', CL: 'ES', VE: 'ES', EC: 'ES', UY: 'ES', BO: 'ES', PY: 'ES',
  PT: 'PT', BR: 'PT', AO: 'PT', MZ: 'PT',
}

export const useLangStore = defineStore('lang', () => {
  const userPickedLang = !!localStorage.getItem('bloomly_lang')
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

  async function detectLangFromIP() {
    if (userPickedLang) return
    try {
      const res = await fetch('https://ip-api.com/json/?fields=countryCode', { signal: AbortSignal.timeout(4000) })
      const data = await res.json()
      const detected = COUNTRY_TO_LANG[data.countryCode as string]
      if (detected) currentLang.value = detected
    } catch { /* silent fail — keep default RU */ }
  }

  return { currentLang, t, setLang, autoTranslateEnabled, autoTranslateLang, setAutoTranslate, setAutoTranslateLang, detectLangFromIP }
})
