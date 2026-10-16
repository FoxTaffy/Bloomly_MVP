import { reactive, ref, watch, type Ref } from 'vue'
import type { Message } from '@/stores/messages'
import { useLangStore } from '@/stores/lang'
import type { Lang } from '@/locales/translations'

// App language → MyMemory API language code
const LANG_TO_API: Record<Lang, string> = {
  RU: 'ru', EN: 'en', JP: 'ja', CN: 'zh-CN', DE: 'de', FR: 'fr', ES: 'es', PT: 'pt',
}

async function translateText(text: string, targetLang: string): Promise<string | null> {
  // Try with 'auto' source first, fall back to 'en'
  const tryFetch = async (src: string) => {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 300))}&langpair=${src}|${targetLang}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    const data = await res.json()
    if (data?.responseStatus === 200) {
      const t = data?.responseData?.translatedText
      if (t && t.trim() && t.toLowerCase().trim() !== text.toLowerCase().trim()) return t as string
    }
    return null
  }
  try {
    return await tryFetch('auto')
  } catch {
    try { return await tryFetch('en') } catch { return null }
  }
}

/** Auto-translation of incoming chat messages through the free MyMemory API. */
export function useChatTranslation(msgList: Ref<Message[]>, isMine: (msg: Message) => boolean) {
  const langStore = useLangStore()
  const translateMode = ref(false)
  const translateLang = ref(LANG_TO_API[langStore.currentLang] ?? 'ru')
  const translations = ref<Record<string, string>>({})
  const translatingIds = reactive(new Set<string>())

  // Sequential queue prevents hammering the free API
  const queue: Array<() => Promise<void>> = []
  let running = false
  async function drainQueue() {
    if (running) return
    running = true
    while (queue.length) await queue.shift()!()
    running = false
  }

  function enqueueTranslation(msg: Message) {
    if (isMine(msg) || !msg.text || translations.value[msg.id] || translatingIds.has(msg.id)) return
    translatingIds.add(msg.id)
    queue.push(async () => {
      try {
        const result = await translateText(msg.text!, translateLang.value)
        if (result) translations.value = { ...translations.value, [msg.id]: result }
      } finally {
        translatingIds.delete(msg.id)
      }
    })
    drainQueue()
  }

  function autoTranslateMissingMessages() {
    for (const msg of msgList.value) enqueueTranslation(msg)
  }

  // New incoming messages
  watch(() => msgList.value.length, (n, old) => {
    if (!translateMode.value || n <= (old ?? 0)) return
    for (const msg of msgList.value.slice(old ?? 0)) enqueueTranslation(msg)
  })

  // Re-translate when the target language changes
  watch(translateLang, () => {
    if (!translateMode.value) return
    translations.value = {}
    autoTranslateMissingMessages()
  })

  // Follow the app language
  watch(() => langStore.currentLang, (lang) => {
    translateLang.value = LANG_TO_API[lang] ?? 'ru'
  })

  return { translateMode, translateLang, translations, translatingIds, autoTranslateMissingMessages }
}
