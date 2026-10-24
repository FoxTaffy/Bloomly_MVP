<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDealersDenStore, type DealerListing } from '@/stores/dealersDen'
import { useLangStore } from '@/stores/lang'
import { useAuthStore } from '@/stores/auth'
import { apiErrorMessage } from '@/lib/apiError'
import { onAvatarError } from '@/composables/useAvatarFallback'
import * as fmt from '@/lib/format'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import BIcon from '@/components/BIcon.vue'
import UserBadges from '@/components/UserBadges.vue'
import DenTrustBadge from '@/components/DenTrustBadge.vue'
import DenReviewCard from '@/components/DenReviewCard.vue'
import DenListingCard from '@/components/den/DenListingCard.vue'
import EmptyState from '@/components/ui/EmptyState.vue'

const route = useRoute()
const router = useRouter()
const store = useDealersDenStore()
const auth = useAuthStore()
const langStore = useLangStore()

const data = ref<any>(null)
const loading = ref(true)
const error = ref('')

const user = computed(() => data.value?.user)
const name = computed(() => user.value?.displayName || user.value?.username || '')
const badgeUser = computed(() => user.value && {
  is_verified: user.value.isVerified, verification_type: user.value.verificationType,
  badge_type: user.value.badgeType, role: user.value.role, subscription_tier: user.value.subscriptionTier,
})
const memberSince = computed(() => user.value ? fmt.formatDate(user.value.createdAt, 'long', 'ru-RU') : '')

const stats = computed(() => !data.value ? [] : [
  { icon: 'ShoppingBag', value: data.value.stats.totalSales, label: 'продаж' },
  ...(data.value.stats.avgRating > 0 ? [{ icon: 'Star', value: `${data.value.stats.avgRating.toFixed(1)} (${data.value.stats.reviewCount})`, label: 'рейтинг' }] : []),
  { icon: 'Calendar', value: memberSince.value, label: 'на Bloomly' },
])

const BADGE_LABELS: Record<string, string> = { den_top_week: '🏆 Топ недели', fair_champion: '🎪 Чемпион ярмарки' }

function openListing(l: DealerListing) { router.push({ name: 'dealer-listing', params: { id: l.id } }) }
async function toggleWishlist(l: DealerListing) {
  if (!auth.user) { router.push({ name: 'login' }); return }
  const was = !!l.is_wishlisted
  l.is_wishlisted = !was
  try { await (was ? store.removeFromWishlist(l.id) : store.addToWishlist(l.id)) } catch { l.is_wishlisted = was }
}

onMounted(async () => {
  try {
    data.value = await store.getSellerPage(route.params.username as string)
  } catch (e) {
    error.value = apiErrorMessage(e) ?? 'Не удалось загрузить страницу продавца'
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

        <div v-if="loading" class="card-surface h-40 animate-pulse" />
        <EmptyState v-else-if="error" icon="PackageX" :title="error" />

        <template v-else-if="data">
          <div class="card-surface p-5 flex gap-5 items-start max-sm:flex-col">
            <img v-if="user.avatarUrl" :src="user.avatarUrl" @error="onAvatarError" class="w-20 h-20 rounded-full object-cover border-2 border-brand-border shrink-0" alt="" />
            <div v-else class="w-20 h-20 rounded-full bg-brand-gradient flex items-center justify-center text-2xl font-black shrink-0">{{ name.slice(0, 2).toUpperCase() }}</div>

            <div class="min-w-0 flex-1 stack-y-2">
              <div class="flex items-center gap-2 flex-wrap">
                <h1 class="text-2xl font-black truncate">{{ name }}</h1>
                <UserBadges :user="badgeUser" size="md" />
              </div>
              <p class="text-sm text-white/35">@{{ user.username }}</p>
              <div class="flex items-center gap-2 flex-wrap">
                <DenTrustBadge :trust="user.denTrustScore" />
                <span v-if="user.den_frozen" class="chip border-brand-error/40 bg-brand-error/15 text-brand-error">
                  <BIcon name="Snowflake" class="w-2.5 h-2.5" /> Аккаунт заморожен
                </span>
                <span v-for="b in data.badges" :key="b" class="chip border-brand-yellow/30 bg-brand-yellow/10 text-brand-yellow">{{ BADGE_LABELS[b] ?? b }}</span>
              </div>
              <div class="grid grid-cols-2 sm:flex gap-2 pt-2">
                <div v-for="s in stats" :key="s.label" class="flex items-center gap-2 bg-white/5 border border-white/8 rounded-2xl px-3.5 py-2 min-w-0">
                  <BIcon :name="s.icon" class="w-3.5 h-3.5 text-brand-accent-minus shrink-0" />
                  <span class="text-sm font-extrabold tabular-nums truncate">{{ s.value }}</span>
                  <span class="text-xs text-white/40 truncate">{{ s.label }}</span>
                </div>
              </div>
            </div>
          </div>

          <section v-if="data.activeListings.length" class="stack-y-3">
            <h2 class="section-title"><BIcon name="LayoutGrid" class="w-4 h-4 text-brand-accent" /> Активные лоты</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              <DenListingCard v-for="l in data.activeListings" :key="l.id" :listing="l" mode="browse" :viewer-id="auth.user?.id"
                @open="openListing(l)" @wishlist="toggleWishlist(l)" @bid="openListing(l)" @ticket="openListing(l)"
                @tag="(tag: string) => router.push({ name: 'dealers-den', query: { search: tag } })" @nsfw="openListing(l)" />
            </div>
          </section>

          <section v-if="data.reviews.length" class="stack-y-3">
            <h2 class="section-title"><BIcon name="Star" class="w-4 h-4 text-brand-yellow" /> {{ langStore.t.dealerListingReviewsTitle }}</h2>
            <div class="card-surface divide-y divide-brand-border">
              <DenReviewCard v-for="r in data.reviews" :key="r.id" :review="r" class="p-4" />
            </div>
          </section>

          <EmptyState v-if="!data.activeListings.length && !data.reviews.length" icon="ShoppingBag" title="У продавца пока нет активных лотов и отзывов" />
        </template>
      </main>
    </div>
  </div>
</template>
