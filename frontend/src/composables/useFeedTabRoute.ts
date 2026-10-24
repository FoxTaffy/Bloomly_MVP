import { watch, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { DEFAULT_FEED_MODE, parseFeedTab, type FeedMode } from '@/lib/feed'

/**
 * Вкладка ленты в адресе (`/?tab=news`): ссылкой можно поделиться, «Назад» возвращает на ту же вкладку.
 * Адрес — источник истины, пока страница на экране. MainLayout кэшируется <KeepAlive>, и без флага
 * `active` эти watch-и реагировали бы на `?tab` и чужих страниц.
 */
export function useFeedTabRoute(mode: Ref<FeedMode>, nsfwEnabled: Ref<boolean>) {
  const route = useRoute()
  const router = useRouter()
  let active = false

  const tabFromUrl = () => parseFeedTab(route.query.tab, nsfwEnabled.value)

  /** Вкладка из адреса или значение по умолчанию (в т.ч. если ?tab= мусорный или NSFW выключен). */
  const initialMode = (): FeedMode => tabFromUrl() ?? DEFAULT_FEED_MODE

  // При уходе на другую страницу query меняется раньше, чем компонент деактивируется: ждать onDeactivated нельзя
  const onHome = () => route.name === 'home'

  function writeUrl() {
    if (!onHome()) return
    const wanted = mode.value === DEFAULT_FEED_MODE ? undefined : mode.value
    if ((route.query.tab ?? undefined) === wanted) return
    const { tab: _drop, ...rest } = route.query
    router.replace({ query: wanted ? { ...rest, tab: wanted } : rest })
  }

  function readUrl() {
    if (!onHome()) return
    const next = initialMode()
    if (next !== mode.value) mode.value = next
  }

  watch(mode, () => { if (active) writeUrl() })
  watch(() => route.query.tab, () => { if (active) readUrl() })

  return {
    initialMode,
    activate() { active = true; readUrl(); writeUrl() },
    deactivate() { active = false },
  }
}
