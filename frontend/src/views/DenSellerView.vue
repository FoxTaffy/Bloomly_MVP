<template>
  <div class="den-seller-view">
    <div v-if="loading" class="loading">Загрузка...</div>

    <div v-else-if="error" class="error">{{ error }}</div>

    <template v-else-if="data">
      <!-- Hero -->
      <div class="seller-hero">
        <img v-if="data.user.avatarUrl" :src="data.user.avatarUrl" class="seller-avatar" alt="" />
        <div v-else class="seller-avatar seller-avatar-placeholder">{{ initials }}</div>
        <div class="seller-meta">
          <div class="seller-name-row">
            <h1 class="seller-name">{{ data.user.displayName || data.user.username }}</h1>
            <span v-if="data.user.isVerified" class="verified-badge">✓ Верифицирован</span>
          </div>
          <p class="seller-username">@{{ data.user.username }}</p>
          <DenTrustBadge :trust="data.user.denTrustScore" />
          <div class="seller-stats">
            <span>{{ data.stats.totalSales }} продаж</span>
            <span v-if="data.stats.avgRating > 0">{{ data.stats.avgRating.toFixed(1) }}★ ({{ data.stats.reviewCount }})</span>
            <span>Участник с {{ memberSince }}</span>
          </div>
          <div v-if="data.badges.length" class="badges">
            <span v-for="badge in data.badges" :key="badge" class="badge">{{ badgeLabel(badge) }}</span>
          </div>
        </div>
      </div>

      <div class="seller-body">
        <!-- Active listings -->
        <section v-if="data.activeListings.length" class="section">
          <h2 class="section-title">Активные лоты</h2>
          <div class="listings-grid">
            <RouterLink
              v-for="listing in data.activeListings"
              :key="listing.id"
              :to="`/dealers-den/${listing.id}`"
              class="listing-card"
            >
              <img v-if="listing.images[0]" :src="listing.images[0]" class="listing-img" alt="" />
              <div class="listing-info">
                <span class="listing-title">{{ listing.title }}</span>
                <span class="listing-price">{{ listing.price }} {{ listing.currency }}</span>
              </div>
            </RouterLink>
          </div>
        </section>

        <!-- Reviews -->
        <section v-if="data.reviews.length" class="section">
          <h2 class="section-title">Отзывы</h2>
          <div class="reviews-list">
            <DenReviewCard v-for="review in data.reviews" :key="review.id" :review="review" />
          </div>
        </section>

        <div v-if="!data.activeListings.length && !data.reviews.length" class="empty">
          У продавца пока нет активных лотов и отзывов
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { useDealersDenStore } from '../stores/dealersDen'
import DenTrustBadge from '../components/DenTrustBadge.vue'
import DenReviewCard from '../components/DenReviewCard.vue'

const route  = useRoute()
const store  = useDealersDenStore()
const data   = ref<any>(null)
const loading = ref(false)
const error   = ref('')

const initials = computed(() => {
  if (!data.value) return ''
  const name = data.value.user.displayName || data.value.user.username
  return name.slice(0, 2).toUpperCase()
})

const memberSince = computed(() => {
  if (!data.value) return ''
  return new Date(data.value.user.createdAt).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long' })
})

function badgeLabel(badge: string) {
  const labels: Record<string, string> = {
    den_top_week: '🏆 Топ недели',
    fair_champion: '🎪 Чемпион ярмарки',
  }
  return labels[badge] ?? badge
}

onMounted(async () => {
  loading.value = true
  error.value   = ''
  try {
    data.value = await store.getSellerPage(route.params.username as string)
  } catch (e: any) {
    error.value = e?.response?.data?.error || 'Не удалось загрузить страницу продавца'
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.den-seller-view { max-width: 960px; margin: 0 auto; padding: 24px 16px; }
.loading, .error, .empty { text-align: center; color: #9ca3af; padding: 48px; }
.error { color: #dc2626; }

.seller-hero {
  display: flex;
  gap: 20px;
  align-items: flex-start;
  padding: 24px;
  background: #fff;
  border-radius: 20px;
  border: 1px solid #e5e7eb;
  margin-bottom: 24px;
}
.seller-avatar {
  width: 80px; height: 80px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}
.seller-avatar-placeholder {
  background: #6366f1;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 700;
}
.seller-meta { flex: 1; display: flex; flex-direction: column; gap: 8px; }
.seller-name-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.seller-name  { font-size: 22px; font-weight: 800; margin: 0; }
.verified-badge {
  padding: 2px 10px;
  background: #eff6ff;
  color: #2563eb;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}
.seller-username { color: #9ca3af; font-size: 14px; margin: 0; }
.seller-stats { display: flex; gap: 16px; font-size: 13px; color: #6b7280; flex-wrap: wrap; }
.badges { display: flex; gap: 8px; flex-wrap: wrap; }
.badge {
  padding: 4px 12px;
  border-radius: 999px;
  background: #fef3c7;
  color: #92400e;
  font-size: 12px;
  font-weight: 600;
}

.seller-body { display: flex; flex-direction: column; gap: 28px; }
.section { display: flex; flex-direction: column; gap: 16px; }
.section-title { font-size: 18px; font-weight: 700; margin: 0; }

.listings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}
.listing-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  overflow: hidden;
  text-decoration: none;
  color: inherit;
  transition: transform 0.15s;
}
.listing-card:hover { transform: translateY(-2px); }
.listing-img { width: 100%; aspect-ratio: 1; object-fit: cover; }
.listing-info { padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; }
.listing-title { font-size: 13px; font-weight: 600; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.listing-price { font-size: 14px; font-weight: 700; color: #6366f1; }

.reviews-list { display: flex; flex-direction: column; gap: 12px; }
</style>
