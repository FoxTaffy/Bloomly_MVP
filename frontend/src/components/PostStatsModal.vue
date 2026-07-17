<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/api'
import BIcon from '@/components/BIcon.vue'

const props = defineProps<{ postId: string }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const router = useRouter()
const loading = ref(true)
const proRequired = ref(false)
const stats = ref<{
  viewsCount: number
  rating: number
  upvotes: number
  downvotes: number
  comments: number
  repaws: number
  favourites: number
  createdAt: string
} | null>(null)

async function load() {
  loading.value = true
  proRequired.value = false
  try {
    const r = await api.get(`/posts/${props.postId}/stats`)
    if (r.data.success) stats.value = r.data.data.stats
  } catch (e: any) {
    if (e?.response?.status === 402) proRequired.value = true
  } finally {
    loading.value = false
  }
}

function goToSubscriptions() {
  emit('close')
  router.push('/subscriptions')
}

onMounted(load)
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[9999] flex items-center justify-center px-4" style="background: rgba(0,0,0,0.6)" @click.self="emit('close')">
      <div class="w-full max-w-sm bg-brand-card border border-brand-border rounded-3xl shadow-2xl overflow-hidden">
        <div class="flex items-center justify-between px-5 py-4 border-b border-brand-border">
          <h3 class="font-bold text-white flex items-center gap-2">
            <BIcon name="BarChart2" class="w-4.5 h-4.5 text-brand-accent" /> Статистика поста
          </h3>
          <button @click="emit('close')" class="p-1.5 rounded-full text-white/55 hover:text-white hover:bg-white/5">
            <BIcon name="X" class="w-4 h-4" />
          </button>
        </div>

        <div class="p-5">
          <!-- Loading -->
          <div v-if="loading" class="flex items-center justify-center py-10">
            <BIcon name="Loader2" class="w-6 h-6 text-white/30 animate-spin" />
          </div>

          <!-- PRO upsell -->
          <div v-else-if="proRequired" class="flex flex-col items-center gap-3 py-6 text-center">
            <div class="w-12 h-12 rounded-2xl bg-brand-accent/15 border border-brand-accent/30 flex items-center justify-center">
              <BIcon name="Crown" class="w-6 h-6 text-brand-accent" />
            </div>
            <p class="text-sm font-bold text-white">Статистика доступна в PRO</p>
            <p class="text-xs text-white/55">Оформите подписку PRO, чтобы видеть подробную статистику по каждому посту.</p>
            <button @click="goToSubscriptions"
              class="mt-2 inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-brand-accent to-brand-accent-plus text-white text-sm font-bold rounded-2xl shadow-lg shadow-brand-accent/25">
              <BIcon name="Ticket" class="w-4 h-4" /> Перейти к подписке
            </button>
          </div>

          <!-- Stats grid -->
          <div v-else-if="stats" class="grid grid-cols-2 gap-3">
            <div class="bg-brand-bg border border-brand-border rounded-2xl px-4 py-3">
              <div class="flex items-center gap-1.5 text-white/40 text-[11px] font-semibold uppercase tracking-wide mb-1">
                <BIcon name="Eye" class="w-3.5 h-3.5" /> Просмотры
              </div>
              <p class="text-xl font-extrabold text-white tabular-nums">{{ stats.viewsCount }}</p>
            </div>
            <div class="bg-brand-bg border border-brand-border rounded-2xl px-4 py-3">
              <div class="flex items-center gap-1.5 text-white/40 text-[11px] font-semibold uppercase tracking-wide mb-1">
                <BIcon name="ArrowBigUp" class="w-3.5 h-3.5" /> Рейтинг
              </div>
              <p class="text-xl font-extrabold text-white tabular-nums">{{ stats.rating }}</p>
            </div>
            <div class="bg-brand-bg border border-brand-border rounded-2xl px-4 py-3">
              <div class="flex items-center gap-1.5 text-emerald-400/70 text-[11px] font-semibold uppercase tracking-wide mb-1">
                <BIcon name="ArrowBigUp" class="w-3.5 h-3.5" /> Лайки
              </div>
              <p class="text-xl font-extrabold text-white tabular-nums">{{ stats.upvotes }}</p>
            </div>
            <div class="bg-brand-bg border border-brand-border rounded-2xl px-4 py-3">
              <div class="flex items-center gap-1.5 text-rose-400/70 text-[11px] font-semibold uppercase tracking-wide mb-1">
                <BIcon name="ArrowBigDown" class="w-3.5 h-3.5" /> Дизлайки
              </div>
              <p class="text-xl font-extrabold text-white tabular-nums">{{ stats.downvotes }}</p>
            </div>
            <div class="bg-brand-bg border border-brand-border rounded-2xl px-4 py-3">
              <div class="flex items-center gap-1.5 text-white/40 text-[11px] font-semibold uppercase tracking-wide mb-1">
                <BIcon name="MessageSquare" class="w-3.5 h-3.5" /> Комментарии
              </div>
              <p class="text-xl font-extrabold text-white tabular-nums">{{ stats.comments }}</p>
            </div>
            <div class="bg-brand-bg border border-brand-border rounded-2xl px-4 py-3">
              <div class="flex items-center gap-1.5 text-white/40 text-[11px] font-semibold uppercase tracking-wide mb-1">
                <BIcon name="Repeat2" class="w-3.5 h-3.5" /> Репавы
              </div>
              <p class="text-xl font-extrabold text-white tabular-nums">{{ stats.repaws }}</p>
            </div>
            <div class="bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 col-span-2">
              <div class="flex items-center gap-1.5 text-yellow-400/70 text-[11px] font-semibold uppercase tracking-wide mb-1">
                <BIcon name="Bookmark" class="w-3.5 h-3.5" /> В закладках
              </div>
              <p class="text-xl font-extrabold text-white tabular-nums">{{ stats.favourites }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
