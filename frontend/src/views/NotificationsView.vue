<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/api'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import BIcon from '@/components/BIcon.vue'
import { useWarningModalStore } from '@/stores/warningModal'
import { onAvatarError } from '@/composables/useAvatarFallback'

const router = useRouter()
const warningModal = useWarningModalStore()

const notifications = ref<any[]>([])
const isLoading = ref(false)

const normalizeNotif = (n: any) => ({ ...n, is_read: n.is_read ?? n.read ?? false })

const fetchAll = async () => {
  isLoading.value = true
  try {
    const res = await api.get('/notifications')
    if (res.data.success) notifications.value = res.data.data.notifications.map(normalizeNotif)
  } catch {} finally { isLoading.value = false }
}

const markAllRead = async () => {
  try {
    await api.post('/notifications/read', {})
    notifications.value.forEach((n: any) => { n.is_read = true })
  } catch {}
}

const AUTOMOD_TYPES = ['automod_warn', 'automod_freeze', 'automod_unfreeze', 'automod_ban', 'automod_clear_warns', 'admin_broadcast']
const isAutomodNotif = (n: any) => AUTOMOD_TYPES.includes(n.type)

const automodMessage = (n: any) => {
  const meta = n.meta || {}
  switch (n.type) {
    case 'automod_warn': return `⚠️ Предупреждение ${meta.count ?? '?'} из ${meta.limit ?? 5}${meta.reason ? ' — ' + meta.reason : ''}`
    case 'automod_freeze': return `🧊 Аккаунт временно заморожен${meta.reason ? ' — ' + meta.reason : ''}`
    case 'automod_unfreeze': return '🔓 Заморозка снята, аккаунт снова активен'
    case 'automod_ban': return `🚫 Аккаунт заблокирован${meta.reason ? ' — ' + meta.reason : ''}`
    case 'automod_clear_warns': return '✅ Предупреждения сброшены модератором'
    case 'admin_broadcast': return `📣 ${meta.title ?? ''}${meta.body ? ' — ' + meta.body : ''}`
    default: return ''
  }
}

const notifTypeLabel = (type: string) => {
  const map: Record<string, string> = {
    LIKE: 'поставил(а) + вашей публикации', COMMENT: 'прокомментировал(а) вашу публикацию',
    REPAW: 'поставил(а) RePaw вашей публикации', FOLLOW: 'подписался(ась) на вас',
    MENTION: 'упомянул(а) вас', FOLLOW_POST: 'опубликовал(а) новый пост', GROUP_POST: 'новый пост в сообществе',
  }
  return map[type.toUpperCase()] ?? type
}

const formatDate = (d: string) => new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })

const onClick = async (n: any) => {
  if (!n.is_read) {
    n.is_read = true
    try { await api.post('/notifications/read', { ids: [n.id] }) } catch {}
  }
  if (n.type === 'automod_warn') { warningModal.open(n); return }
  if (n.sender?.username && ['FOLLOW', 'RELATIONSHIP_ACCEPTED', 'follow', 'relationship_accepted'].includes(n.type)) {
    router.push(`/profile/${n.sender.username}`); return
  }
  if (n.post_id) { router.push(`/post/${n.post_id}`); return }
  if (n.sender?.username) router.push(`/profile/${n.sender.username}`)
}

onMounted(fetchAll)
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito">
    <AppHeader />

    <div class="max-w-7xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-8">
      <AppSidebar />

      <main class="flex-1 min-w-0 pb-28 md:pb-20 max-w-2xl">
        <div class="bg-brand-card border border-brand-border rounded-3xl px-6 py-5 shadow-xl mb-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-2xl bg-brand-accent/15 flex items-center justify-center flex-shrink-0">
                <BIcon name="Bell" class="w-5 h-5 text-brand-accent" />
              </div>
              <h1 class="text-xl font-extrabold text-white">Все уведомления</h1>
            </div>
            <button @click="markAllRead" class="text-xs text-brand-accent hover:text-white font-semibold transition-colors">
              Прочитать всё
            </button>
          </div>
        </div>

        <div v-if="isLoading" class="space-y-2">
          <div v-for="n in 6" :key="n" class="h-16 rounded-2xl bg-brand-card border border-brand-border animate-pulse" />
        </div>
        <div v-else-if="notifications.length === 0"
          class="rounded-3xl border border-brand-border bg-brand-card flex flex-col items-center gap-3 py-16 text-white/25">
          <BIcon name="BellOff" class="w-10 h-10 opacity-40" />
          <p class="text-sm font-semibold">Уведомлений нет</p>
        </div>
        <div v-else class="space-y-1.5">
          <div v-for="n in notifications" :key="n.id"
            class="flex items-start gap-3 px-4 py-3 rounded-2xl cursor-pointer transition-colors"
            :class="[
              n.type === 'automod_warn' ? 'bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/30' :
              !n.is_read ? 'bg-brand-accent/5 hover:bg-brand-accent/10' : 'bg-brand-card hover:bg-white/5 border border-brand-border',
            ]"
            @click="onClick(n)">
            <div v-if="isAutomodNotif(n)" class="w-10 h-10 rounded-full bg-gradient-to-br from-[#4C67CF] to-[#7c3aed] flex items-center justify-center flex-shrink-0">
              <span class="text-white font-black text-sm select-none" style="letter-spacing:-1px">B</span>
            </div>
            <img v-else :src="n.sender?.avatar_url || '/icons/badges/NN.jpg'"
              class="w-10 h-10 rounded-full object-cover border border-brand-border flex-shrink-0" @error="onAvatarError" />
            <div class="min-w-0 flex-1">
              <p v-if="isAutomodNotif(n)" class="text-sm text-white leading-snug font-semibold">{{ automodMessage(n) }}</p>
              <p v-else class="text-sm text-white leading-snug">
                <span class="font-semibold">{{ n.sender?.display_name || n.sender?.username }}</span>
                {{ ' ' }}{{ notifTypeLabel(n.type) }}
              </p>
              <p class="text-xs text-white/40 mt-0.5">{{ formatDate(n.created_at) }}</p>
            </div>
            <div v-if="!n.is_read" class="w-2 h-2 bg-brand-accent rounded-full flex-shrink-0 mt-2"></div>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>
