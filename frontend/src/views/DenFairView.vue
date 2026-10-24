<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDealersDenStore } from '@/stores/dealersDen'
import { useAuthStore } from '@/stores/auth'
import { apiErrorMessage } from '@/lib/apiError'
import * as fmt from '@/lib/format'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import BIcon from '@/components/BIcon.vue'
import EmptyState from '@/components/ui/EmptyState.vue'

const route = useRoute()
const router = useRouter()
const store = useDealersDenStore()
const auth = useAuthStore()

const fair = ref<any>(null)
const topListings = ref<any[]>([])
const mine = ref<{ status: string; listing_id: string | null } | null>(null)
const myListings = ref<any[]>([])
const loading = ref(true)
const error = ref('')
const applying = ref(false)
const applyError = ref('')
const selectedListing = ref('')

const participants = computed(() => (fair.value?.participants ?? []) as any[])
// Публично виден только одобренный состав; собственная заявка приходит отдельно
const MY_STATUS: Record<string, string> = {
  pending: 'Заявка на рассмотрении — организаторы ответят после проверки.',
  approved: 'Ваша заявка одобрена — вы участвуете в ярмарке.',
  rejected: 'Заявка отклонена организаторами.',
}
const STATUS: Record<string, { label: string; cls: string }> = {
  upcoming: { label: 'Скоро', cls: 'bg-brand-yellow/20 border-brand-yellow/40 text-brand-yellow' },
  open: { label: 'Открыта', cls: 'bg-brand-success/20 border-brand-success/40 text-brand-success' },
  closed: { label: 'Завершена', cls: 'bg-white/10 border-white/20 text-white/60' },
}
const status = computed(() => STATUS[fair.value?.status] ?? STATUS.closed)
const canApply = computed(() => fair.value?.status === 'open' && !!auth.user && !mine.value)
const formatDate = (d: string) => fmt.formatDate(d, 'long', 'ru-RU')

async function apply() {
  applying.value = true
  applyError.value = ''
  try {
    const { participant } = await store.applyToFair(fair.value.id, selectedListing.value || undefined)
    mine.value = { status: participant.status, listing_id: participant.listing_id }
  } catch (e) {
    applyError.value = apiErrorMessage(e) ?? 'Не удалось подать заявку'
  } finally {
    applying.value = false
  }
}

onMounted(async () => {
  try {
    const id = route.params.id as string
    const result = id === 'current' ? await store.getCurrentFair() : await store.getFair(id)
    if (!result) { error.value = 'Ярмарка не найдена'; return }
    fair.value = result.fair
    topListings.value = result.topListings ?? []
    mine.value = result.mine ?? null
    if (auth.user) myListings.value = (await store.loadMyListings()).filter((l: any) => l.status === 'active' && !l.is_nsfw)
  } catch (e) {
    error.value = apiErrorMessage(e) ?? 'Не удалось загрузить ярмарку'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito">
    <AppHeader />
    <div class="max-w-7xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-8">
      <AppSidebar />
      <main class="flex-1 min-w-0 pb-28 md:pb-20 stack-y-5">
        <button @click="router.push({ name: 'dealers-den' })" class="flex items-center gap-2 text-white/40 hover:text-white text-sm font-semibold transition-colors">
          <BIcon name="ArrowLeft" class="w-4 h-4" /> Dealers&apos; Den
        </button>

        <div v-if="loading" class="card-surface h-48 animate-pulse" />
        <EmptyState v-else-if="error" icon="PackageX" :title="error" />

        <template v-else-if="fair">
          <div class="relative overflow-hidden rounded-3xl border border-brand-border bg-linear-to-br from-brand-accent/25 via-brand-bg to-brand-purple/20 min-h-48 flex items-end bg-cover bg-center"
            :style="fair.banner_url ? { backgroundImage: `url(${fair.banner_url})` } : undefined">
            <div class="w-full p-6 bg-linear-to-t from-black/80 to-transparent stack-y-2">
              <p v-if="fair.theme" class="text-xs font-bold uppercase tracking-widest text-brand-accent-minus">{{ fair.theme }}</p>
              <h1 class="text-3xl font-black">{{ fair.title }}</h1>
              <div class="flex items-center gap-3 flex-wrap">
                <span class="text-sm text-white/60">{{ formatDate(fair.starts_at) }} — {{ formatDate(fair.ends_at) }}</span>
                <span class="chip" :class="status.cls">{{ status.label }}</span>
              </div>
            </div>
          </div>

          <p v-if="fair.description" class="text-sm text-white/70 leading-relaxed whitespace-pre-line">{{ fair.description }}</p>

          <div v-if="mine" class="card-surface px-4 py-3 text-sm" :class="mine.status === 'approved' ? 'text-brand-success' : mine.status === 'rejected' ? 'text-brand-error' : 'text-white/70'">
            {{ MY_STATUS[mine.status] ?? '' }}
          </div>
          <div v-else-if="canApply" class="card-surface p-4 flex gap-3 flex-wrap items-center">
            <select v-if="myListings.length" v-model="selectedListing"
              class="flex-1 min-w-48 bg-brand-bg border border-brand-border rounded-2xl px-4 py-2.5 text-sm text-white outline-hidden">
              <option value="">— Выбрать лот (опционально) —</option>
              <option v-for="l in myListings" :key="l.id" :value="l.id">{{ l.title }}</option>
            </select>
            <button :disabled="applying" @click="apply"
              class="px-5 py-2.5 rounded-2xl text-sm font-bold text-white bg-brand-gradient hover:opacity-90 transition-opacity disabled:opacity-50">
              {{ applying ? 'Подаём заявку…' : 'Подать заявку' }}
            </button>
          </div>
          <p v-if="applyError" class="text-sm text-brand-error">{{ applyError }}</p>

          <section v-if="topListings.length" class="stack-y-3">
            <h2 class="section-title"><BIcon name="LayoutGrid" class="w-4 h-4 text-brand-accent" /> Лоты участников</h2>
            <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              <RouterLink v-for="l in topListings" :key="l.id" :to="`/dealers-den/${l.id}`" class="card-surface group hover:border-brand-accent/50 hover:-translate-y-0.5 transition-all">
                <div class="aspect-square bg-brand-bg overflow-hidden">
                  <img v-if="l.images?.[0]" :src="l.images[0]" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="" />
                </div>
                <div class="p-3">
                  <p class="text-xs font-extrabold line-clamp-1">{{ l.title }}</p>
                  <p class="text-sm font-black text-brand-yellow mt-0.5">{{ fmt.formatPrice(l.price, l.currency) }}</p>
                  <p class="text-[10px] text-white/35 truncate">@{{ l.seller.username }}</p>
                </div>
              </RouterLink>
            </div>
          </section>

          <section v-if="participants.length" class="stack-y-3">
            <h2 class="section-title"><BIcon name="Users" class="w-4 h-4 text-brand-purple" /> Участники · {{ participants.length }}</h2>
            <div class="flex flex-wrap gap-2">
              <RouterLink v-for="p in participants" :key="p.id" :to="`/dealers-den/seller/${p.user.username}`"
                class="flex items-center gap-2 bg-brand-card border border-brand-border rounded-full pl-1.5 pr-3.5 py-1.5 hover:border-brand-accent/50 transition-colors">
                <img v-if="p.user.avatar_url" :src="p.user.avatar_url" class="w-7 h-7 rounded-full object-cover" alt="" />
                <span v-else class="w-7 h-7 rounded-full bg-brand-gradient flex items-center justify-center text-[10px] font-extrabold">{{ p.user.username.slice(0, 2).toUpperCase() }}</span>
                <span class="text-sm font-bold">{{ p.user.display_name || p.user.username }}</span>
              </RouterLink>
            </div>
          </section>
        </template>
      </main>
    </div>
  </div>
</template>
