import { reactive } from 'vue'
import api from '@/api'
import { invalidateFriendsCache } from '@/stores/friends'
import { chunk } from '@/lib/feed'

// «Подписан ли я на пользователя» — одна карта на всю вкладку: лента и колонка рекомендаций
// показывают одних и тех же людей, и подписка в одном месте должна сразу видеться в другом.
const following = reactive<Record<string, boolean>>({})

// Сервер принимает не больше 100 id за запрос
const BULK_LIMIT = 100

export function useFollowState() {
  async function load(userIds: string[]) {
    const ids = [...new Set(userIds)].filter(Boolean)
    for (const part of chunk(ids, BULK_LIMIT)) {
      try {
        const res = await api.get('/follows/check-bulk', { params: { ids: part.join(',') } })
        if (res.data.success) Object.assign(following, res.data.data as Record<string, boolean>)
      } catch { /* не критично: кнопка покажет «Читать» */ }
    }
  }

  /** Оптимистично переключает подписку и откатывает её, если сервер отказал. */
  async function toggle(userId: string) {
    const previous = !!following[userId]
    following[userId] = !previous
    try {
      const res = await api.post(`/follows/${userId}/toggle`)
      if (!res.data.success) throw new Error('follow failed')
      following[userId] = res.data.data.following
      invalidateFriendsCache()
    } catch {
      following[userId] = previous
    }
  }

  /** Другой аккаунт на той же вкладке не должен видеть чужие подписки. */
  function reset() {
    for (const id of Object.keys(following)) delete following[id]
  }

  return { following, load, toggle, reset }
}
