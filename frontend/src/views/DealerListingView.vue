<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useDealersDenStore } from '@/stores/dealersDen'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import BIcon from '@/components/BIcon.vue'

const router = useRouter()
const route  = useRoute()
const auth   = useAuthStore()
const store  = useDealersDenStore()

const listing = computed(() => store.currentListing)
const activeImage = ref(0)

onMounted(async () => {
  const id = route.params.id as string
  await store.loadListing(id)
  activeImage.value = 0
})

const TYPE_LABELS: Record<string, string> = {
  digital: 'Цифровое', physical: 'Физическое', both: 'Оба варианта',
}
const CAT_LABELS: Record<string, string> = {
  art: 'Арт', fursuit: 'Фурсьют', badge: 'Значок', print: 'Принт',
  music: 'Музыка', craft: 'Handmade', merch: 'Мерч', other: 'Другое',
}
const STATUS_LABELS: Record<string, string> = {
  active: 'В наличии', sold: 'Продано', draft: 'Черновик', archived: 'Архив',
}
const STATUS_COLOR: Record<string, string> = {
  active: 'text-brand-success bg-brand-success/10 border-brand-success/30',
  sold: 'text-brand-error bg-brand-error/10 border-brand-error/30',
  draft: 'text-brand-warning bg-brand-warning/10 border-brand-warning/30',
  archived: 'text-white/55 bg-white/5 border-white/10',
}

function isSoldOut(l: any) {
  return l.status === 'sold' || (l.quantity > 0 && l.quantity_sold >= l.quantity)
}

function formatPrice(price: string, currency: string) {
  return `${parseFloat(price).toLocaleString()} ${currency}`
}

function contactSeller() {
  if (!listing.value) return
  router.push({ name: 'messages' })
}

function goToProfile() {
  if (!listing.value) return
  router.push(`/profile/${listing.value.seller.id}`)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito">
    <AppHeader />

    <div class="max-w-7xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-8">
      <AppSidebar />

      <main class="flex-1 min-w-0 pb-28 md:pb-20">

        <!-- Back button -->
        <button
          @click="router.push({ name: 'dealers-den' })"
          class="flex items-center gap-2 text-white/55 hover:text-white text-sm font-semibold mb-4 transition-colors">
          <BIcon name="ArrowLeft" class="w-4 h-4" />
          Обратно в Dealers' Den
        </button>

        <!-- Loading -->
        <div v-if="store.isLoading" class="space-y-4">
          <div class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden animate-pulse">
            <div class="w-full h-72 bg-brand-border" />
            <div class="p-6 space-y-4">
              <div class="h-6 bg-brand-border rounded-full w-2/3" />
              <div class="h-4 bg-brand-border rounded-full w-full" />
              <div class="h-4 bg-brand-border rounded-full w-3/4" />
            </div>
          </div>
        </div>

        <!-- 404 -->
        <div
          v-else-if="!listing"
          class="text-center py-20 bg-brand-card border border-brand-border rounded-3xl">
          <BIcon name="PackageX" class="w-14 h-14 text-white/30 mx-auto mb-4" />
          <h2 class="text-2xl font-bold text-white mb-2">Объявление не найдено</h2>
          <p class="text-white/55 text-sm mb-6">Оно могло быть удалено или перемещено</p>
          <button
            @click="router.push({ name: 'dealers-den' })"
            class="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-accent hover:bg-brand-accent-plus text-white text-sm font-bold rounded-xl transition-all">
            <BIcon name="ShoppingBag" class="w-4 h-4" />
            В Dealers' Den
          </button>
        </div>

        <!-- Main card -->
        <div v-else class="space-y-4">
          <div class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-xl">

            <!-- Image gallery -->
            <div class="relative">
              <!-- Main image -->
              <div class="w-full h-72 md:h-96 bg-brand-bg overflow-hidden">
                <img
                  v-if="listing.images[activeImage]"
                  :src="listing.images[activeImage]"
                  :alt="listing.title"
                  class="w-full h-full object-contain" />
                <div
                  v-else
                  class="w-full h-full flex items-center justify-center">
                  <BIcon name="Image" class="w-20 h-20 text-brand-border" />
                </div>

                <!-- Sold out overlay -->
                <div
                  v-if="isSoldOut(listing)"
                  class="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <span class="bg-brand-error text-white font-extrabold text-xl px-6 py-2 rounded-full">ПРОДАНО</span>
                </div>

                <!-- NSFW blur -->
                <div
                  v-else-if="listing.is_nsfw"
                  class="absolute inset-0 backdrop-blur-2xl flex flex-col items-center justify-center gap-2">
                  <BIcon name="EyeOff" class="w-12 h-12 text-white/50" />
                  <span class="text-white/70 font-bold">Контент 18+</span>
                </div>
              </div>

              <!-- Thumbnails -->
              <div
                v-if="listing.images.length > 1"
                class="flex gap-2 overflow-x-auto p-3 bg-brand-bg/50 hide-scrollbar">
                <button
                  v-for="(img, i) in listing.images"
                  :key="i"
                  @click="activeImage = i"
                  class="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 border-2 transition-all"
                  :class="activeImage === i ? 'border-brand-accent' : 'border-transparent opacity-60 hover:opacity-100'">
                  <img :src="img" class="w-full h-full object-cover" />
                </button>
              </div>
            </div>

            <!-- Content -->
            <div class="p-6 space-y-5">

              <!-- Header row -->
              <div class="flex flex-wrap items-start justify-between gap-4">
                <div class="space-y-2 flex-1 min-w-0">
                  <!-- Badges -->
                  <div class="flex flex-wrap gap-2">
                    <span class="bg-brand-border text-white/70 text-xs font-bold px-3 py-1 rounded-full capitalize">
                      {{ CAT_LABELS[listing.category] ?? listing.category }}
                    </span>
                    <span :class="'border text-xs font-bold px-3 py-1 rounded-full ' + (
                      listing.type === 'digital'  ? 'text-brand-accent bg-brand-accent/10 border-brand-accent/30' :
                      listing.type === 'physical' ? 'text-brand-success bg-brand-success/10 border-brand-success/30' :
                      'text-brand-yellow bg-brand-yellow/10 border-brand-yellow/30'
                    )">
                      {{ TYPE_LABELS[listing.type] }}
                    </span>
                    <span v-if="listing.is_nsfw" class="border border-brand-error/30 text-brand-error bg-brand-error/10 text-xs font-bold px-3 py-1 rounded-full">18+</span>
                    <span :class="'border text-xs font-bold px-3 py-1 rounded-full ' + (STATUS_COLOR[listing.status] || '')">
                      {{ STATUS_LABELS[listing.status] ?? listing.status }}
                    </span>
                  </div>

                  <h1 class="text-2xl font-extrabold text-white leading-tight">{{ listing.title }}</h1>
                </div>

                <!-- Price block -->
                <div class="text-right">
                  <div class="text-3xl font-extrabold text-brand-yellow">
                    {{ formatPrice(listing.price, listing.currency) }}
                  </div>
                  <div class="text-xs text-white/40 mt-1">
                    <template v-if="listing.quantity > 0">
                      {{ isSoldOut(listing) ? 'Нет в наличии' : `Осталось: ${listing.quantity - listing.quantity_sold}` }}
                    </template>
                  </div>
                </div>
              </div>

              <!-- Description -->
              <div v-if="listing.description">
                <h3 class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2">Описание</h3>
                <p class="text-sm text-white/80 leading-relaxed whitespace-pre-line">{{ listing.description }}</p>
              </div>

              <!-- Tags -->
              <div v-if="listing.tags.length">
                <h3 class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2">Теги</h3>
                <div class="flex flex-wrap gap-2">
                  <span
                    v-for="tag in listing.tags"
                    :key="tag"
                    class="text-xs text-brand-accent bg-brand-accent/10 border border-brand-accent/20 px-3 py-1 rounded-full">
                    #{{ tag }}
                  </span>
                </div>
              </div>

              <!-- Meta info -->
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div class="bg-brand-bg border border-brand-border rounded-2xl px-4 py-3">
                  <p class="text-[10px] text-white/40 uppercase font-bold tracking-wider">Категория</p>
                  <p class="text-sm text-white font-semibold mt-0.5">{{ CAT_LABELS[listing.category] ?? listing.category }}</p>
                </div>
                <div class="bg-brand-bg border border-brand-border rounded-2xl px-4 py-3">
                  <p class="text-[10px] text-white/40 uppercase font-bold tracking-wider">Формат</p>
                  <p class="text-sm text-white font-semibold mt-0.5">{{ TYPE_LABELS[listing.type] }}</p>
                </div>
                <div class="bg-brand-bg border border-brand-border rounded-2xl px-4 py-3">
                  <p class="text-[10px] text-white/40 uppercase font-bold tracking-wider">Опубликовано</p>
                  <p class="text-sm text-white font-semibold mt-0.5">{{ formatDate(listing.created_at) }}</p>
                </div>
              </div>

              <!-- Seller section -->
              <div class="bg-brand-bg border border-brand-border rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap">
                <div
                  class="flex items-center gap-3 cursor-pointer"
                  @click="goToProfile">
                  <img
                    v-if="listing.seller.avatar_url"
                    :src="listing.seller.avatar_url"
                    class="w-12 h-12 rounded-full object-cover border-2 border-brand-border hover:border-brand-accent transition-colors" />
                  <div
                    v-else
                    class="w-12 h-12 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent text-lg font-extrabold border-2 border-brand-border hover:border-brand-accent transition-colors">
                    {{ (listing.seller.display_name ?? listing.seller.username)[0].toUpperCase() }}
                  </div>
                  <div>
                    <div class="flex items-center gap-1.5">
                      <span class="font-bold text-white hover:text-brand-accent transition-colors">
                        {{ listing.seller.display_name ?? listing.seller.username }}
                      </span>
                      <BIcon v-if="listing.seller.is_verified" name="BadgeCheck" class="w-4 h-4 text-brand-accent" />
                    </div>
                    <p class="text-xs text-white/40">@{{ listing.seller.username }}</p>
                  </div>
                </div>

                <!-- Contact button (not shown for own listings) -->
                <button
                  v-if="auth.user && auth.user.id !== listing.seller_id"
                  @click="contactSeller"
                  class="flex items-center gap-2 px-4 py-2 bg-brand-accent hover:bg-brand-accent-plus text-white text-sm font-bold rounded-xl transition-all shadow-md shadow-brand-accent/25">
                  <BIcon name="MessageCircle" class="w-4 h-4" />
                  Написать продавцу
                </button>
              </div>

            </div>
          </div>
        </div>

      </main>
    </div>
  </div>
</template>
