import { ref, watch } from 'vue'

// «Синонимы тегов» в поиске: искать по тегу вместе с его синонимами (лиса → fox, foxes…).
// Одна настройка на всё приложение, хранится в браузере; по умолчанию включена.
const STORAGE_KEY = 'bloomly:tagSynonyms'
const enabled = ref(localStorage.getItem(STORAGE_KEY) !== 'false')
watch(enabled, (v) => localStorage.setItem(STORAGE_KEY, String(v)))

export function useTagSynonyms() {
  return { tagSynonyms: enabled }
}
