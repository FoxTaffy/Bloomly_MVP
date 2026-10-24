import { computed, ref, watch, type Ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useStickersStore, type StickerPack } from '@/stores/stickers'
import { emojiKey, emojiList, singleEmoji } from '@/lib/emoji'

export type StickerSuggestion = { url: string; packId: string; nsfw: boolean }
const MAX_SUGGESTIONS = 16

/**
 * Подсказки стикеров по эмодзи (как в Telegram): когда в поле только один эмодзи,
 * показываем стикеры из своей библиотеки (свои паки + добавленные), к которым он привязан.
 * Любой другой текст подсказки не вызывает.
 */
export function useStickerSuggest(text: Ref<string>) {
  const auth = useAuthStore()
  const stickers = useStickersStore()
  const dismissedFor = ref<string | null>(null)
  let loadRequested = false

  const emoji = computed(() => (auth.user ? singleEmoji(text.value) : null))

  // Библиотеку грузим лениво — только когда впервые набран одиночный эмодзи
  watch(emoji, (value) => {
    if (!value || loadRequested) return
    loadRequested = true
    if (!stickers.myPacks.length) stickers.loadMyPacks().catch(() => {})
    if (!stickers.myCollection.length) stickers.loadMyCollection().catch(() => {})
  })
  watch(text, () => { if (dismissedFor.value !== null && dismissedFor.value !== text.value) dismissedFor.value = null })

  const items = computed<StickerSuggestion[]>(() => {
    const value = emoji.value
    if (!value || dismissedFor.value === text.value) return []
    const key = emojiKey(value)
    const seenPacks = new Set<string>()
    const seenUrls = new Set<string>()
    const out: StickerSuggestion[] = []
    const packs: StickerPack[] = [...stickers.myPacks, ...stickers.myCollection]
    for (const pack of packs) {
      if (seenPacks.has(pack.id)) continue
      seenPacks.add(pack.id)
      pack.stickers.forEach((url, i) => {
        if (out.length >= MAX_SUGGESTIONS || seenUrls.has(url)) return
        const tags = emojiList(pack.sticker_emojis?.[i] ?? '').map(emojiKey)
        if (!tags.includes(key)) return
        seenUrls.add(url)
        out.push({ url, packId: pack.id, nsfw: pack.is_nsfw || (pack.nsfw_stickers?.includes(i) ?? false) })
      })
    }
    return out
  })

  /** Скрыть подсказки до следующего изменения текста (Escape). */
  function dismiss() { dismissedFor.value = text.value }

  return { items, dismiss }
}
