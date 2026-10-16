import { ref, computed, watch } from 'vue'
import { useLangStore } from '@/stores/lang'
import type { Lang } from '@/locales/translations'

// Map app language codes → MyMemory API language codes
export const LANG_TO_API: Record<Lang, string> = {
  RU: 'ru',
  EN: 'en',
  JP: 'ja',
  CN: 'zh-CN',
  DE: 'de',
  FR: 'fr',
  ES: 'es',
  PT: 'pt',
}

// Global queue to prevent hammering the free MyMemory API
const translateQueue: Array<() => Promise<void>> = []
let translateRunning = false

async function drainQueue() {
  if (translateRunning) return
  translateRunning = true
  while (translateQueue.length) {
    const task = translateQueue.shift()!
    await task()
    // Small delay between requests to respect rate limits
    await new Promise((r) => setTimeout(r, 150))
  }
  translateRunning = false
}

/**
 * Translate `text` to the target language using the free MyMemory API.
 * Returns null if translation failed or is same as original.
 */
export async function translateText(text: string, targetLang: Lang): Promise<string | null> {
  const target = LANG_TO_API[targetLang]
  if (!target) return null

  // Extract @username mentions and replace with stable placeholders so the API
  // doesn't mangle them (capitalise, translate, or drop the @ prefix).
  const mentions: string[] = []
  const textForApi = text.replace(/@\w+(?:-\w+)*/g, (m) => {
    mentions.push(m)
    return `[M${mentions.length - 1}]`
  })
  const restoreMentions = (s: string) =>
    mentions.length ? s.replace(/\[M(\d+)\]/g, (_, i) => mentions[+i] ?? '') : s

  const trimmed = textForApi.trim().slice(0, 500)
  if (!trimmed) return null

  // If target is Russian and text is already mostly Cyrillic — skip
  // (use original text for the Cyrillic ratio — placeholders would skew it)
  if (target === 'ru') {
    const cyrillicRatio = (text.match(/[\u0400-\u04FF]/g) ?? []).length / text.length
    if (cyrillicRatio > 0.3) return null
  }

  const INVALID_PREFIXES = ["'AUTO' IS AN INVALID", 'MYMEMORY WARNING', 'PLEASE NOTE']

  const tryFetch = async (src: string): Promise<string | null> => {
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(trimmed)}&langpair=${src}|${target}`
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      const data = await res.json()
      if (data?.responseStatus === 200) {
        const t = data?.responseData?.translatedText as string | undefined
        if (
          t &&
          t.trim() &&
          !INVALID_PREFIXES.some(p => t.startsWith(p)) &&
          t.toLowerCase().trim() !== trimmed.toLowerCase()
        ) return t
      }
    } catch { /* ignore */ }
    return null
  }

  // Try Russian source first (most content on this platform is Russian),
  // then English as fallback, then the same code as target language (detect)
  const sources = ['ru', 'en', target === 'ru' ? 'en' : target]
  for (const src of sources) {
    if (src === target) continue
    const result = await tryFetch(src)
    if (result) return restoreMentions(result)
  }
  return null
}

/**
 * Per-component composable for auto-translating a single piece of content.
 *
 * @param getId  – function that returns a stable cache key (e.g. post id)
 * @param getText – function that returns the original text to translate
 */
export function useAutoTranslate(getId: () => string, getText: () => string) {
  const langStore = useLangStore()

  const translatedText = ref<string | null>(null)
  const isTranslating = ref(false)
  const showTranslation = ref(false)

  // Cache: key = `${id}:${lang}`
  const cache: Record<string, string> = {}

  async function translate() {
    const id = getId()
    const text = getText()
    const lang = langStore.autoTranslateLang
    if (!text || !text.trim()) return

    const cacheKey = `${id}:${lang}`
    if (cache[cacheKey]) {
      translatedText.value = cache[cacheKey]
      showTranslation.value = true
      return
    }

    isTranslating.value = true
    showTranslation.value = true

    await new Promise<void>((resolve) => {
      translateQueue.push(async () => {
        try {
          const result = await translateText(text, lang)
          if (result) {
            cache[cacheKey] = result
            translatedText.value = result
          } else {
            translatedText.value = null
          }
        } catch {
          translatedText.value = null
        } finally {
          isTranslating.value = false
          resolve()
        }
      })
      drainQueue()
    })
  }

  function toggle() {
    if (showTranslation.value) {
      showTranslation.value = false
    } else {
      translate()
    }
  }

  // Auto-translate when global setting is enabled
  watch(() => langStore.autoTranslateEnabled, (enabled) => {
    if (enabled) translate()
    else { showTranslation.value = false; translatedText.value = null }
  }, { immediate: true })

  // Reset when target language changes
  watch(() => langStore.autoTranslateLang, () => {
    translatedText.value = null
    showTranslation.value = false
    isTranslating.value = false
    if (langStore.autoTranslateEnabled) translate()
  })

  const displayText = computed(() => {
    if (showTranslation.value && translatedText.value) return translatedText.value
    return getText()
  })

  return {
    translatedText,
    isTranslating,
    showTranslation,
    translate,
    toggle,
    displayText,
  }
}

/**
 * Composable for translating a collection of items (comments, messages, etc.)
 * Uses plain objects for reactivity instead of Set to avoid Vue 3 tracking issues.
 */
export function useCollectionTranslate() {
  const langStore = useLangStore()

  const translations = ref<Record<string, string>>({})
  const translatingMap = ref<Record<string, boolean>>({})

  function enqueue(id: string, text: string) {
    if (!text || !text.trim() || translations.value[id] || translatingMap.value[id]) return
    const lang = langStore.autoTranslateLang

    translatingMap.value = { ...translatingMap.value, [id]: true }
    translateQueue.push(async () => {
      try {
        const result = await translateText(text, lang)
        if (result) {
          translations.value = { ...translations.value, [id]: result }
        }
      } finally {
        const next = { ...translatingMap.value }
        delete next[id]
        translatingMap.value = next
      }
    })
    drainQueue()
  }

  function getTranslation(id: string): string | null {
    return translations.value[id] ?? null
  }

  function isTranslating(id: string): boolean {
    return !!translatingMap.value[id]
  }

  // Reset when target language changes
  watch(() => langStore.autoTranslateLang, () => {
    translations.value = {}
    translatingMap.value = {}
  })

  return {
    translations,
    enqueue,
    getTranslation,
    isTranslating,
  }
}
