<template>
  <div class="den-fair-view">
    <div v-if="loading" class="loading">Загрузка...</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <template v-else-if="fair">
      <!-- Banner -->
      <div class="fair-banner" :style="fair.banner_url ? { backgroundImage: `url(${fair.banner_url})` } : {}">
        <div class="fair-banner-overlay">
          <div v-if="fair.theme" class="fair-theme">{{ fair.theme }}</div>
          <h1 class="fair-title">{{ fair.title }}</h1>
          <div class="fair-dates">
            {{ formatDate(fair.starts_at) }} — {{ formatDate(fair.ends_at) }}
          </div>
          <span class="fair-status" :class="fair.status">{{ statusLabel }}</span>
        </div>
      </div>

      <div class="fair-body">
        <!-- Description -->
        <p v-if="fair.description" class="fair-desc">{{ fair.description }}</p>

        <!-- Apply button -->
        <div v-if="fair.status === 'open' && isLoggedIn && !hasApplied" class="apply-section">
          <select v-model="selectedListing" class="listing-select" v-if="myListings.length">
            <option value="">— Выбрать лот (опционально) —</option>
            <option v-for="l in myListings" :key="l.id" :value="l.id">{{ l.title }}</option>
          </select>
          <button class="apply-btn" :disabled="applying" @click="apply">
            {{ applying ? 'Подаём заявку...' : 'Подать заявку' }}
          </button>
        </div>
        <div v-if="applyError" class="apply-error">{{ applyError }}</div>
        <div v-if="hasApplied" class="applied-note">Вы уже подали заявку на эту ярмарку.</div>

        <!-- Top listings -->
        <section v-if="topListings.length" class="section">
          <h2 class="section-title">Лоты участников</h2>
          <div class="listings-grid">
            <RouterLink
              v-for="listing in topListings"
              :key="listing.id"
              :to="`/dealers-den/${listing.id}`"
              class="listing-card"
            >
              <img v-if="listing.images?.[0]" :src="listing.images[0]" class="listing-img" alt="" />
              <div class="listing-info">
                <span class="listing-title">{{ listing.title }}</span>
                <span class="listing-price">{{ listing.price }} {{ listing.currency }}</span>
                <span class="listing-seller">@{{ listing.seller.username }}</span>
              </div>
            </RouterLink>
          </div>
        </section>

        <!-- Participants -->
        <section v-if="participants.length" class="section">
          <h2 class="section-title">Участники ({{ participants.filter((p: any) => p.status === 'approved').length }})</h2>
          <div class="participants">
            <RouterLink
              v-for="p in participants.filter((p: any) => p.status === 'approved')"
              :key="p.id"
              :to="`/dealers-den/seller/${p.user.username}`"
              class="participant"
            >
              <img v-if="p.user.avatar_url" :src="p.user.avatar_url" class="part-avatar" alt="" />
              <div v-else class="part-avatar part-avatar-placeholder">{{ p.user.username.slice(0, 2).toUpperCase() }}</div>
              <span class="part-name">{{ p.user.display_name || p.user.username }}</span>
            </RouterLink>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { useDealersDenStore } from '../stores/dealersDen'
import { useAuthStore } from '../stores/auth'

const route  = useRoute()
const store  = useDealersDenStore()
const auth   = useAuthStore()

const fair          = ref<any>(null)
const topListings   = ref<any[]>([])
const participants  = ref<any[]>([])
const myListings    = ref<any[]>([])
const loading       = ref(false)
const error         = ref('')
const applying      = ref(false)
const applyError    = ref('')
const hasApplied    = ref(false)
const selectedListing = ref('')

const isLoggedIn = computed(() => !!auth.user)

const statusLabel = computed(() => {
  const labels: Record<string, string> = { upcoming: 'Скоро', open: 'Открыта', closed: 'Завершена' }
  return labels[fair.value?.status] ?? fair.value?.status
})

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}

async function apply() {
  applying.value = true
  applyError.value = ''
  try {
    await store.applyToFair(fair.value.id, selectedListing.value || undefined)
    hasApplied.value = true
  } catch (err: any) {
    applyError.value = err?.response?.data?.message ?? err?.response?.data?.error ?? 'Не удалось подать заявку'
  } finally {
    applying.value = false
  }
}

onMounted(async () => {
  loading.value = true
  error.value   = ''
  try {
    const fairId = route.params.id as string
    let result: any

    if (fairId === 'current') {
      result = await store.getCurrentFair()
    } else {
      result = await store.getFair(fairId)
    }

    if (!result) {
      error.value = 'Ярмарка не найдена'
      return
    }

    fair.value = result.fair
    topListings.value = result.topListings ?? []
    participants.value = result.fair.participants ?? []

    if (auth.user) {
      hasApplied.value = participants.value.some((p: any) => p.user_id === auth.user!.id)
      myListings.value = await store.loadMyListings()
    }
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'Не удалось загрузить ярмарку'
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.den-fair-view { max-width: 1024px; margin: 0 auto; padding: 0 0 40px; }
.loading, .error { text-align: center; color: #9ca3af; padding: 48px; }
.error { color: #dc2626; }

.fair-banner {
  position: relative;
  min-height: 240px;
  background: #6366f1;
  background-size: cover;
  background-position: center;
  border-radius: 0 0 20px 20px;
  overflow: hidden;
}
.fair-banner-overlay {
  position: absolute; inset: 0;
  background: linear-gradient(to top, rgba(0,0,0,0.7), rgba(0,0,0,0.2));
  display: flex; flex-direction: column; justify-content: flex-end;
  padding: 28px 24px;
  color: #fff;
  gap: 6px;
}
.fair-theme { font-size: 13px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.8; }
.fair-title { font-size: 28px; font-weight: 800; margin: 0; }
.fair-dates { font-size: 14px; opacity: 0.8; }
.fair-status {
  display: inline-block; width: fit-content;
  padding: 4px 12px; border-radius: 999px;
  font-size: 12px; font-weight: 600;
}
.upcoming { background: #fef3c7; color: #92400e; }
.open     { background: #d1fae5; color: #065f46; }
.closed   { background: #f3f4f6; color: #6b7280; }

.fair-body { padding: 24px 16px; display: flex; flex-direction: column; gap: 24px; }
.fair-desc { color: #374151; font-size: 15px; line-height: 1.6; margin: 0; }

.apply-section { display: flex; gap: 10px; flex-wrap: wrap; }
.listing-select {
  flex: 1; min-width: 200px;
  padding: 10px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  font-size: 14px;
}
.apply-btn {
  padding: 10px 24px;
  background: #6366f1;
  color: #fff;
  border: none;
  border-radius: 10px;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.15s;
}
.apply-btn:hover:not(:disabled) { background: #4f46e5; }
.apply-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.applied-note { color: #6b7280; font-size: 14px; }
.apply-error { color: #ef4444; font-size: 13px; margin-top: 8px; }

.section { display: flex; flex-direction: column; gap: 14px; }
.section-title { font-size: 18px; font-weight: 700; margin: 0; }

.listings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}
.listing-card { text-decoration: none; color: inherit; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; transition: transform 0.15s; }
.listing-card:hover { transform: translateY(-2px); }
.listing-img { width: 100%; aspect-ratio: 1; object-fit: cover; }
.listing-info { padding: 8px 10px; display: flex; flex-direction: column; gap: 3px; }
.listing-title { font-size: 13px; font-weight: 600; }
.listing-price { font-weight: 700; color: #6366f1; font-size: 14px; }
.listing-seller { font-size: 11px; color: #9ca3af; }

.participants { display: flex; flex-wrap: wrap; gap: 10px; }
.participant {
  display: flex; align-items: center; gap: 8px;
  text-decoration: none; color: inherit;
  padding: 6px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  transition: background 0.15s;
}
.participant:hover { background: #f3f4f6; }
.part-avatar { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; }
.part-avatar-placeholder { background: #6366f1; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; border-radius: 50%; }
.part-name { font-size: 13px; font-weight: 500; }
</style>
