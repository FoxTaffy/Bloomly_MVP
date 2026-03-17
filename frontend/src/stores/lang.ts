import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { translations, type Lang } from '../locales/translations'

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
