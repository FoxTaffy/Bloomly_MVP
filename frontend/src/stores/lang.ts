import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { translations, type Lang } from '../locales/translations'

export const useLangStore = defineStore('lang', () => {
  const currentLang = ref<Lang>((localStorage.getItem('bloomly_lang') as Lang) || 'RU')

  const t = computed(() => translations[currentLang.value])

  function setLang(lang: Lang) {
    currentLang.value = lang
    localStorage.setItem('bloomly_lang', lang)
  }

  return { currentLang, t, setLang }
})
