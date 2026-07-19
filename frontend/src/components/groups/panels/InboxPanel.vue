<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import BIcon from '@/components/BIcon.vue'
import { useMessagesStore, type GroupInboxThread } from '@/stores/messages'
import { onAvatarError } from '@/composables/useAvatarFallback'

const props = defineProps<{ groupId?: string }>()

const router = useRouter()
const store = useMessagesStore()

const threads = ref<GroupInboxThread[]>([])
const loading = ref(false)
const error = ref('')
const opening = ref<string | null>(null)

async function load() {
  if (!props.groupId) return
  loading.value = true
  error.value = ''
  try {
    threads.value = await store.getGroupInbox(props.groupId)
  } catch (e: any) {
    error.value = e.response?.data?.error?.message ?? e.message
  } finally {
    loading.value = false
  }
}

async function openThread(t: GroupInboxThread) {
  opening.value = t.id
  try {
    await store.openConversationById(t.id)
    router.push({ name: 'messages' })
  } finally {
    opening.value = null
  }
}

function preview(msg: GroupInboxThread['last_message']): string {
  if (!msg) return 'Нет сообщений'
  if (msg.type === 'sticker') return '🖼 Стикер'
  if (msg.type === 'voice' || msg.type === 'audio') return '🎤 Голосовое сообщение'
  if (msg.type === 'image') return '🖼 Фото'
  if (msg.type === 'video') return '🎬 Видео'
  if (msg.type === 'album') return '🖼 Медиа'
  return msg.text || 'Сообщение'
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  return sameDay
    ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

watch(() => props.groupId, () => { threads.value = []; load() })
onMounted(load)

defineExpose({ load })
</script>

<template>
  <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">

    <!-- Header -->
    <div class="px-6 py-5 border-b border-brand-border flex items-center gap-3">
      <div class="w-10 h-10 rounded-2xl bg-brand-accent/15 border border-brand-accent/25 flex items-center justify-center flex-shrink-0">
        <BIcon name="Inbox" class="w-5 h-5 text-brand-accent" />
      </div>
      <div class="flex-1 min-w-0">
        <h1 class="text-lg font-extrabold text-white">Обращения</h1>
        <p class="text-xs text-white/40">Личные сообщения от подписчиков группе — ответить может любой админ</p>
      </div>
      <span class="px-2.5 py-1 rounded-xl bg-white/5 border border-brand-border text-xs font-bold text-white/50">
        {{ threads.length }}
      </span>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="px-6 py-10 flex justify-center">
      <div class="w-8 h-8 border-2 border-brand-accent/30 border-t-brand-accent rounded-full animate-spin" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="px-6 py-10 text-center text-brand-error text-sm">{{ error }}</div>

    <!-- No group -->
    <div v-else-if="!groupId" class="px-6 py-16 flex flex-col items-center gap-3">
      <BIcon name="AlertCircle" class="w-10 h-10 text-white/20" />
      <p class="text-white/40 text-sm">Группа не выбрана</p>
    </div>

    <!-- Threads list -->
    <div v-else class="divide-y divide-brand-border/50">
      <button
        v-for="t in threads"
        :key="t.id"
        :disabled="opening === t.id"
        @click="openThread(t)"
        class="w-full px-6 py-4 flex items-center gap-3 hover:bg-white/2 transition-colors text-left disabled:opacity-50">

        <div class="relative flex-shrink-0">
          <img v-if="t.customer.avatar_url" :src="t.customer.avatar_url" class="w-11 h-11 rounded-2xl object-cover border border-brand-border" @error="onAvatarError" />
          <div v-else class="w-11 h-11 rounded-2xl bg-brand-accent/20 border border-brand-border flex items-center justify-center text-sm font-extrabold text-brand-accent">
            {{ (t.customer.display_name || t.customer.username || '?')[0].toUpperCase() }}
          </div>
          <span v-if="t.needs_reply" class="absolute -top-1 -right-1 w-3.5 h-3.5 bg-brand-accent rounded-full border-2 border-brand-card" title="Ждёт ответа" />
        </div>

        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-2">
            <p class="font-bold text-white text-sm truncate">{{ t.customer.display_name || t.customer.username }}</p>
            <span class="text-[11px] text-white/40 flex-shrink-0 tabular-nums">{{ formatTime(t.last_message?.created_at ?? t.updated_at) }}</span>
          </div>
          <p :class="['text-xs truncate mt-0.5', t.needs_reply ? 'text-white/70 font-medium' : 'text-white/40']">{{ preview(t.last_message) }}</p>
        </div>

        <span v-if="t.needs_reply" class="flex-shrink-0 text-[10px] font-bold text-brand-accent bg-brand-accent/15 border border-brand-accent/25 px-2 py-1 rounded-full">
          Ждёт ответа
        </span>

        <div v-if="opening === t.id" class="flex-shrink-0">
          <div class="w-4 h-4 border-2 border-brand-accent/30 border-t-brand-accent rounded-full animate-spin" />
        </div>
      </button>

      <!-- Empty state -->
      <div v-if="!threads.length" class="px-6 py-16 flex flex-col items-center gap-3">
        <div class="w-14 h-14 rounded-2xl bg-brand-bg border border-brand-border flex items-center justify-center">
          <BIcon name="Inbox" class="w-7 h-7 text-white/20" />
        </div>
        <p class="text-white/40 text-sm font-semibold">Обращений пока нет</p>
      </div>
    </div>

  </div>
</template>
